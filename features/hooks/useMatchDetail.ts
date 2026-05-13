"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { KnockoutMatch, MatchStatus, MatchPeriod } from "@/types/championship";

const supabase = createClient();

export type MatchPlayer = {
  registrationId: string;
  name: string;
  position: string | null;
  number: number | null;
  teamId: string; // championship_team_id
  isStarter?: boolean;
  isCaptain?: boolean;
};

export type MatchEventItem = {
  id: string;
  eventType: string;
  eventTimeS: number;
  period: string;
  playerId: string | null;
  playerName: string | null;
  assistPlayerId: string | null;
  assistPlayerName: string | null;
  playerInId: string | null;
  playerInName: string | null;
  teamId: string;
  relatedEventId: string | null;
  notes: string | null;
  createdAt: string;
};

export type MatchPenalty = {
  id: string;
  teamId: string;
  playerId: string | null;
  playerName: string | null;
  shotOrder: number;
  result: "scored" | "missed" | "saved";
};

export type MatchLineupPlayer = {
  id: string;
  playerId: string;
  championshipTeamId: string;
  isStarter: boolean;
  isCaptain: boolean;
};

export type MatchDetail = {
  match: KnockoutMatch & {
    status: MatchStatus;
    home_score: number;
    away_score: number;
    current_period: MatchPeriod;
    period_started_at: string | null;
    period_1_duration_s: number | null;
    period_2_duration_s: number | null;
    extra_1_duration_s: number | null;
    extra_2_duration_s: number | null;
    penalty_home_score: number;
    penalty_away_score: number;
    penalty_winner_team_id: string | null;
    championship_id: string;
  };
  homeTeam: { id: string; name: string; logoUrl: string | null; championshipTeamId: string };
  awayTeam: { id: string; name: string; logoUrl: string | null; championshipTeamId: string };
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  events: MatchEventItem[];
  penalties: MatchPenalty[];
  lineups: MatchLineupPlayer[];
};

/** Acumulado de períodos anteriores em segundos */
export function getAccumulatedSeconds(match: MatchDetail["match"]): number {
  return (
    (match.period_1_duration_s ?? 0) +
    (match.period_2_duration_s ?? 0) +
    (match.extra_1_duration_s ?? 0) +
    (match.extra_2_duration_s ?? 0)
  );
}

/** Elapsed do período atual em segundos (calculado de period_started_at) */
export function getCurrentPeriodElapsed(match: MatchDetail["match"]): number {
  if (!match.period_started_at) return 0;
  return Math.floor((Date.now() - new Date(match.period_started_at).getTime()) / 1000);
}

export function getTotalElapsed(match: MatchDetail["match"]): number {
  return getAccumulatedSeconds(match) + getCurrentPeriodElapsed(match);
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function useMatchDetail(matchId: string) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data: matchRow } = await supabase
      .from("knockout_matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (!matchRow) { setLoading(false); return; }

    const match = matchRow as MatchDetail["match"];

    // Resolve home/away via match_slots
    const { data: slots } = await supabase
      .from("match_slots")
      .select("slot_order, championship_team_id")
      .eq("match_id", matchId)
      .order("slot_order");

    let resolvedHomeCTId = slots?.find((s) => s.slot_order === 1)?.championship_team_id ?? null;
    let resolvedAwayCTId = slots?.find((s) => s.slot_order === 2)?.championship_team_id ?? null;

    // Fallback: se não há slots, tenta resolver pelo nome (ex: "Time A x Time B" ou labels de grupo "A1 x A2")
    if ((!resolvedHomeCTId || !resolvedAwayCTId) && match.name) {
      const parts = match.name.split(/\s+x\s+/i).map((p) => p.trim());
      
      // Busca nos group_slots se o nome do jogo contém labels (A1, B2, etc)
      const { data: gSlots } = await supabase
        .from("group_slots")
        .select("label, championship_team_id")
        .eq("phase_id", match.phase_id)
        .in("label", parts.filter(Boolean));

      if (!resolvedHomeCTId) resolvedHomeCTId = gSlots?.find((g) => g.label === parts[0])?.championship_team_id ?? null;
      if (!resolvedAwayCTId) resolvedAwayCTId = gSlots?.find((g) => g.label === parts[1])?.championship_team_id ?? null;
    }

    const ctIds = [resolvedHomeCTId, resolvedAwayCTId].filter(Boolean) as string[];

    const [{ data: ctRows }, { data: eventRows }, { data: penaltyRows }, { data: lineupRows }] = await Promise.all([
      supabase.from("championship_teams").select("id, team_id").in("id", ctIds.length ? ctIds : ["__none__"]),
      supabase.from("match_events_v2")
        .select(`*, 
          player:championship_registrations!match_events_v2_player_id_fkey(id, players(name)),
          assist:championship_registrations!match_events_v2_assist_player_id_fkey(id, players(name)),
          player_in:championship_registrations!match_events_v2_player_in_id_fkey(id, players(name))
        `)
        .eq("knockout_match_id", matchId)
        .is("deleted_at", null)
        .order("event_time_s"),
      supabase.from("penalty_shootouts")
        .select(`*, championship_registrations(id, players(name))`)
        .eq("knockout_match_id", matchId)
        .order("shot_order"),
      supabase.from("match_lineups")
        .select("*")
        .eq("knockout_match_id", matchId)
    ]);

    const teamIds = (ctRows ?? []).map((ct) => ct.team_id).filter(Boolean);
    const { data: teamRows } = await supabase.from("teams").select("id, name, logo_url").in("id", teamIds.length ? teamIds : ["__none__"]);
    const teamMap = Object.fromEntries((teamRows ?? []).map((t) => [t.id, t]));
    const ctToTeam = Object.fromEntries((ctRows ?? []).map((ct) => [ct.id, teamMap[ct.team_id]]));

    const homeTeamData = resolvedHomeCTId ? ctToTeam[resolvedHomeCTId] : null;
    const awayTeamData = resolvedAwayCTId ? ctToTeam[resolvedAwayCTId] : null;

    // Players for each team
    const [{ data: homePlayers }, { data: awayPlayers }] = await Promise.all([
      resolvedHomeCTId
        ? supabase.from("championship_team_players").select("id, registration_id, championship_registrations(id, players(id, name, position))").eq("championship_team_id", resolvedHomeCTId)
        : Promise.resolve({ data: [] }),
      resolvedAwayCTId
        ? supabase.from("championship_team_players").select("id, registration_id, championship_registrations(id, players(id, name, position))").eq("championship_team_id", resolvedAwayCTId)
        : Promise.resolve({ data: [] }),
    ]);

    function mapPlayers(rows: any[] | null, ctId: string, lps: MatchLineupPlayer[]): MatchPlayer[] {
      return (rows ?? []).map((row: any) => {
        const lineup = lps.find((l) => l.playerId === row.registration_id);
        return {
          registrationId: row.registration_id,
          name: row.championship_registrations?.players?.name ?? "Jogador",
          position: row.championship_registrations?.players?.position ?? null,
          number: null,
          teamId: ctId,
          isStarter: lineup?.isStarter ?? false,
          isCaptain: lineup?.isCaptain ?? false,
        };
      });
    }

    const events: MatchEventItem[] = (eventRows ?? []).map((ev: any) => ({
      id: ev.id,
      eventType: ev.event_type,
      eventTimeS: ev.event_time_s,
      period: ev.period,
      playerId: ev.player_id,
      playerName: ev.player?.players?.name ?? null,
      assistPlayerId: ev.assist_player_id,
      assistPlayerName: ev.assist?.players?.name ?? null,
      playerInId: ev.player_in_id,
      playerInName: ev.player_in?.players?.name ?? null,
      teamId: ev.team_id,
      relatedEventId: ev.related_event_id,
      notes: ev.notes,
      createdAt: ev.created_at,
    }));

    const penalties: MatchPenalty[] = (penaltyRows ?? []).map((p: any) => ({
      id: p.id,
      teamId: p.team_id,
      playerId: p.player_id,
      playerName: p.championship_registrations?.players?.name ?? null,
      shotOrder: p.shot_order,
      result: p.result as MatchPenalty["result"],
    }));

    const lineups: MatchLineupPlayer[] = (lineupRows ?? []).map((l: any) => ({
      id: l.id,
      playerId: l.player_id,
      championshipTeamId: l.championship_team_id,
      isStarter: l.is_starter,
      isCaptain: l.is_captain
    }));

    setDetail({
      match,
      homeTeam: { id: homeTeamData?.id ?? "", name: homeTeamData?.name ?? "Time A", logoUrl: homeTeamData?.logo_url ?? null, championshipTeamId: resolvedHomeCTId ?? "" },
      awayTeam: { id: awayTeamData?.id ?? "", name: awayTeamData?.name ?? "Time B", logoUrl: awayTeamData?.logo_url ?? null, championshipTeamId: resolvedAwayCTId ?? "" },
      homePlayers: mapPlayers(homePlayers, resolvedHomeCTId ?? "", lineups),
      awayPlayers: mapPlayers(awayPlayers, resolvedAwayCTId ?? "", lineups),
      events,
      penalties,
      lineups,
    });

    setElapsed(getTotalElapsed(match));
    setLoading(false);
  }, [matchId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!detail?.match || detail.match.status !== "IN_PROGRESS") return;

    intervalRef.current = setInterval(() => {
      setElapsed(getTotalElapsed(detail.match));
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [detail?.match]);

  useEffect(() => {
    const channel = supabase
      .channel(`match-detail-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "knockout_matches", filter: `id=eq.${matchId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2", filter: `knockout_match_id=eq.${matchId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "penalty_shootouts", filter: `knockout_match_id=eq.${matchId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_lineups", filter: `knockout_match_id=eq.${matchId}` }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [matchId, load]);

  return { detail, loading, elapsed, reload: load };
}
