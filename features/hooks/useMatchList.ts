"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChampionship } from "@/components/ChampionshipContext";
import type { KnockoutMatch, MatchStatus, Phase } from "@/types/championship";
import { buildResolutionContext, resolveCtId, type ResolutionContext } from "@/features/utils/resolveSlotTeam";

const supabase = createClient();

type TeamInfo = { id: string; name: string; logo_url: string | null };

export type MatchListItem = {
  id: string;
  phaseId: string;
  phaseName: string;
  phaseOrder: number;
  matchName: string | null;
  matchCode: string | null;
  roundNumber: number | null;
  groupLabel: string | null;
  scheduledAt: string | null;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  currentPeriod: string;
  home: { label: string; logoUrl: string | null; type: "team" | "rule" | "pending" };
  away: { label: string; logoUrl: string | null; type: "team" | "rule" | "pending" };
};

function resolveSourceLabel(
  match: KnockoutMatch,
  slotOrder: 1 | 2,
  sources: { knockout_match_id: string; slot_order: number; source_type: string; source_group?: string | null; source_position?: number | null; source_match_code?: string | null }[],
  groupSlots: { phase_id: string; label: string; championship_team_id: string | null }[],
  teamMap: Record<string, TeamInfo>,
  ctToTeam: Record<string, string>,
  phaseId: string,
  ctx: ResolutionContext,
): { label: string; logoUrl: string | null; type: "team" | "rule" | "pending" } {
  // 1. Try live resolution: direct match_slots assignment OR knockout_match_sources
  //    (group standings computed from current results, match_winner/loser chains)
  const ctId = resolveCtId(match.id, slotOrder, ctx);
  if (ctId) {
    const teamId = ctToTeam[ctId];
    const team = teamId ? teamMap[teamId] : null;
    if (team) return { label: team.name, logoUrl: team.logo_url, type: "team" };
  }

  // 2. Unresolvable source → show rule text as a hint
  const source = sources.find((s) => s.knockout_match_id === match.id && s.slot_order === slotOrder);
  if (source) {
    if (source.source_type === "group_position")
      return { label: `${source.source_position ?? "?"}º Gr. ${source.source_group ?? "?"}`, logoUrl: null, type: "rule" };
    if (source.source_type === "match_winner")
      return { label: `Vencedor ${source.source_match_code ?? "?"}`, logoUrl: null, type: "rule" };
    if (source.source_type === "match_loser")
      return { label: `Perdedor ${source.source_match_code ?? "?"}`, logoUrl: null, type: "rule" };
  }

  // 3. Group-phase match: parse match name ("A1 x A3") → look up current slot assignment
  if (match.name && match.name.toLowerCase().includes(" x ")) {
    const parts = match.name.split(/\s+x\s+/i).map((p) => p.trim());
    const label = slotOrder === 1 ? parts[0] : parts[1];
    if (label) {
      const gs = groupSlots.find((g) => g.phase_id === phaseId && g.label === label);
      if (gs?.championship_team_id) {
        const teamId = ctToTeam[gs.championship_team_id];
        const team = teamId ? teamMap[teamId] : null;
        if (team) return { label: team.name, logoUrl: team.logo_url, type: "team" };
      }
      return { label: label.toUpperCase(), logoUrl: null, type: "rule" };
    }
  }

  return { label: "A definir", logoUrl: null, type: "pending" };
}

export function useMatchList() {
  const { championship } = useChampionship();
  const championshipId = championship?.id ?? null;
  const [items, setItems] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!championshipId) { setItems([]); return; }
    setLoading(true);

    const { data: phases } = await supabase
      .from("phases")
      .select("id, name, order_number, type")
      .eq("championship_id", championshipId)
      .order("order_number");

    if (!phases?.length) { setLoading(false); setItems([]); return; }

    const phaseIds = phases.map((p) => p.id);

    // First batch — parallel
    const [
      { data: matchRows },
      { data: ctRows },
      { data: groupSlots },
      { data: slots },
      { data: sources },
      { data: champSettings },
      { data: tieBreakerRules },
    ] = await Promise.all([
      supabase
        .from("knockout_matches")
        .select("id, phase_id, name, code, round_number, group_label, scheduled_at, status, home_score, away_score, current_period, championship_id, penalty_home_score, penalty_away_score, penalty_winner_team_id")
        .in("phase_id", phaseIds)
        .order("scheduled_at", { ascending: true, nullsFirst: false }),
      supabase.from("championship_teams").select("id, team_id").eq("championship_id", championshipId),
      supabase.from("group_slots").select("phase_id, label, championship_team_id, group_letter").in("phase_id", phaseIds),
      supabase.from("match_slots").select("match_id, slot_order, label, championship_team_id"),
      supabase.from("knockout_match_sources").select("knockout_match_id, slot_order, source_type, source_group, source_position, source_match_code, source_phase_id"),
      supabase.from("championships").select("points_win, points_draw, points_loss").eq("id", championshipId).single(),
      supabase.from("tie_breaker_rules").select("phase_id, rule, priority").in("phase_id", phaseIds).order("priority"),
    ]);

    // Second pass: goal events filtered to this championship's matches
    const matchIds = (matchRows ?? []).map(m => m.id);
    const { data: goalEvents } = await supabase
      .from("match_events_v2")
      .select("knockout_match_id, event_type, team_id")
      .is("deleted_at", null)
      .in("event_type", ["GOAL", "OWN_GOAL"])
      .in("knockout_match_id", matchIds.length ? matchIds : ["__none__"]);

    const ctToTeam: Record<string, string> = {};
    const teamIds: string[] = [];
    for (const ct of ctRows ?? []) {
      ctToTeam[ct.id] = ct.team_id;
      teamIds.push(ct.team_id);
    }

    const { data: teamRows } = await supabase.from("teams").select("id, name, logo_url").in("id", teamIds.length ? teamIds : ["__none__"]);
    const teamMap: Record<string, TeamInfo> = {};
    for (const t of teamRows ?? []) teamMap[t.id] = t;

    const phaseMap: Record<string, Phase> = {};
    for (const p of phases) phaseMap[p.id] = p as unknown as Phase;

    const pointsConfig = {
      win: champSettings?.points_win ?? 3,
      draw: champSettings?.points_draw ?? 1,
      loss: champSettings?.points_loss ?? 0,
    };

    const ctx = buildResolutionContext(
      (matchRows ?? []) as Parameters<typeof buildResolutionContext>[0],
      (slots ?? []) as Parameters<typeof buildResolutionContext>[1],
      (groupSlots ?? []) as Parameters<typeof buildResolutionContext>[2],
      (sources ?? []) as Parameters<typeof buildResolutionContext>[3],
      (goalEvents ?? []) as Parameters<typeof buildResolutionContext>[4],
      (tieBreakerRules ?? []) as Parameters<typeof buildResolutionContext>[5],
      pointsConfig,
    );

    const result: MatchListItem[] = (matchRows ?? []).map((m) => {
      const match = m as unknown as KnockoutMatch & { status: MatchStatus; home_score: number; away_score: number; current_period: string };
      const phase = phaseMap[match.phase_id];
      return {
        id: match.id,
        phaseId: match.phase_id,
        phaseName: phase?.name ?? "",
        phaseOrder: (phase as unknown as { order_number: number })?.order_number ?? 0,
        matchName: match.name,
        matchCode: match.code,
        roundNumber: match.round_number,
        groupLabel: match.group_label,
        scheduledAt: match.scheduled_at,
        status: (match.status ?? "NOT_STARTED") as MatchStatus,
        homeScore: match.home_score ?? 0,
        awayScore: match.away_score ?? 0,
        currentPeriod: match.current_period ?? "not_started",
        home: resolveSourceLabel(match, 1, sources ?? [], groupSlots ?? [], teamMap, ctToTeam, match.phase_id, ctx),
        away: resolveSourceLabel(match, 2, sources ?? [], groupSlots ?? [], teamMap, ctToTeam, match.phase_id, ctx),
      };
    });

    setItems(result);
    setLoading(false);
  }, [championshipId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    if (!championshipId) return;

    const channel = supabase
      .channel(`match-list-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "knockout_matches", filter: `championship_id=eq.${championshipId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_slots" }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load, championshipId]);

  return { items, loading, reload: load };
}
