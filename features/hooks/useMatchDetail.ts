"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { KnockoutMatch, MatchStatus, MatchPeriod } from "@/types/championship";
import { buildResolutionContext, resolveCtId } from "@/features/utils/resolveSlotTeam";

const supabase = createClient();

type PlayerRegistrationRow = {
  id: string;
  registration_id: string;
  championship_registrations: PlayerRegistration | PlayerRegistration[] | null;
};

type PlayerRegistration = {
  id: string;
  profile_photo_link: string | null;
  players:
    | {
        id: string;
        name: string;
        position: string | null;
      }
    | {
        id: string;
        name: string;
        position: string | null;
      }[]
    | null;
};

function singleRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

type MatchEventRow = {
  id: string;
  event_type: string;
  event_time_s: number;
  period: string;
  player_id: string | null;
  player: { players: { name: string | null } | { name: string | null }[] | null } | { players: { name: string | null } | { name: string | null }[] | null }[] | null;
  assist_player_id: string | null;
  assist: { players: { name: string | null } | { name: string | null }[] | null } | { players: { name: string | null } | { name: string | null }[] | null }[] | null;
  player_in_id: string | null;
  player_in: { players: { name: string | null } | { name: string | null }[] | null } | { players: { name: string | null } | { name: string | null }[] | null }[] | null;
  team_id: string;
  related_event_id: string | null;
  notes: string | null;
  created_at: string;
};

type MatchPenaltyRow = {
  id: string;
  team_id: string;
  player_id: string | null;
  championship_registrations:
    | {
        players: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        players: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
  shot_order: number;
  result: MatchPenalty["result"];
};

type MatchLineupRow = {
  id: string;
  player_id: string;
  championship_team_id: string;
  is_starter: boolean;
  is_captain: boolean;
};

export type MatchPlayer = {
  registrationId: string;
  name: string;
  position: string | null;
  number: number | null;
  teamId: string; // championship_team_id
  isStarter?: boolean;
  isCaptain?: boolean;
  photoUrl: string | null;
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
  homeTeam: { id: string; name: string; logoUrl: string | null; championshipTeamId: string; uniformColor: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null; championshipTeamId: string; uniformColor: string | null };
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  events: MatchEventItem[];
  penalties: MatchPenalty[];
  lineups: MatchLineupPlayer[];
  suspendedRegistrationIds: Set<string>;
  bookedRegistrationIds: Set<string>;
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
      .select("slot_order, championship_team_id, uniform_color")
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

    // Third fallback: knockout_match_sources resolution (Repescagem, Semifinal, etc.)
    // Triggered when match_slots and group-label parsing both fail to resolve a team.
    // championship_id may be null on the match row (not backfilled for all phases);
    // derive it from the phase when missing.
    let derivedChampId: string | null = match.championship_id ?? null;
    if (!derivedChampId && match.phase_id) {
      const { data: phaseRow } = await supabase
        .from("phases")
        .select("championship_id")
        .eq("id", match.phase_id)
        .single();
      derivedChampId = phaseRow?.championship_id ?? null;
    }

    if ((!resolvedHomeCTId || !resolvedAwayCTId) && derivedChampId) {
      const champId = derivedChampId;
      const { data: allPhases } = await supabase.from("phases").select("id").eq("championship_id", champId);
      const allPhaseIds = (allPhases ?? []).map(p => p.id);

      if (allPhaseIds.length > 0) {
        const [
          { data: allMatches },
          { data: allSlotsForCtx },
          { data: allGroupSlotsForCtx },
          { data: allSources },
          { data: champSettings },
          { data: tieBreakerRules },
        ] = await Promise.all([
          supabase.from("knockout_matches")
            .select("id, phase_id, name, code, status, home_score, away_score, penalty_home_score, penalty_away_score, penalty_winner_team_id")
            .in("phase_id", allPhaseIds),
          supabase.from("match_slots").select("match_id, slot_order, championship_team_id"),
          supabase.from("group_slots").select("phase_id, label, championship_team_id, group_letter").in("phase_id", allPhaseIds),
          supabase.from("knockout_match_sources").select("knockout_match_id, slot_order, source_type, source_group, source_position, source_match_code, source_phase_id"),
          supabase.from("championships").select("points_win, points_draw, points_loss").eq("id", champId).single(),
          supabase.from("tie_breaker_rules").select("phase_id, rule, priority").in("phase_id", allPhaseIds).order("priority"),
        ]);

        const allMatchIds = (allMatches ?? []).map(m => m.id);
        const { data: goalEvents } = await supabase
          .from("match_events_v2")
          .select("knockout_match_id, event_type, team_id")
          .is("deleted_at", null)
          .in("event_type", ["GOAL", "OWN_GOAL"])
          .in("knockout_match_id", allMatchIds.length ? allMatchIds : ["__none__"]);

        const ctx = buildResolutionContext(
          (allMatches ?? []) as Parameters<typeof buildResolutionContext>[0],
          (allSlotsForCtx ?? []) as Parameters<typeof buildResolutionContext>[1],
          (allGroupSlotsForCtx ?? []) as Parameters<typeof buildResolutionContext>[2],
          (allSources ?? []) as Parameters<typeof buildResolutionContext>[3],
          (goalEvents ?? []) as Parameters<typeof buildResolutionContext>[4],
          (tieBreakerRules ?? []) as Parameters<typeof buildResolutionContext>[5],
          { win: champSettings?.points_win ?? 3, draw: champSettings?.points_draw ?? 1, loss: champSettings?.points_loss ?? 0 },
        );

        if (!resolvedHomeCTId) resolvedHomeCTId = resolveCtId(matchId, 1, ctx) ?? null;
        if (!resolvedAwayCTId) resolvedAwayCTId = resolveCtId(matchId, 2, ctx) ?? null;
      }
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

    const homeColor = resolvedHomeCTId
      ? (slots?.find((s) => s.championship_team_id === resolvedHomeCTId)?.uniform_color ?? slots?.find((s) => s.slot_order === 1)?.uniform_color ?? null)
      : (slots?.find((s) => s.slot_order === 1)?.uniform_color ?? null);
    const awayColor = resolvedAwayCTId
      ? (slots?.find((s) => s.championship_team_id === resolvedAwayCTId)?.uniform_color ?? slots?.find((s) => s.slot_order === 2)?.uniform_color ?? null)
      : (slots?.find((s) => s.slot_order === 2)?.uniform_color ?? null);

    // Players for each team
    const [{ data: homePlayers }, { data: awayPlayers }] = await Promise.all([
      resolvedHomeCTId
        ? supabase.from("championship_team_players").select("id, registration_id, championship_registrations(id, profile_photo_link, players(id, name, position))").eq("championship_team_id", resolvedHomeCTId)
        : Promise.resolve({ data: [] }),
      resolvedAwayCTId
        ? supabase.from("championship_team_players").select("id, registration_id, championship_registrations(id, profile_photo_link, players(id, name, position))").eq("championship_team_id", resolvedAwayCTId)
        : Promise.resolve({ data: [] }),
    ]);

    const allRegIds = [
      ...(homePlayers ?? []),
      ...(awayPlayers ?? []),
    ].map((r) => r.registration_id);

    const [{ data: suspRows }, { data: bookedRows }] = await Promise.all([
      supabase
        .from("v_suspended_players")
        .select("registration_id")
        .eq("suspended_match_id", matchId),
      supabase
        .from("v_booked_players")
        .select("registration_id")
        .in("registration_id", allRegIds.length ? allRegIds : ["__none__"]),
    ]);

    const suspendedRegistrationIds = new Set(
      (suspRows ?? []).map((r: { registration_id: string }) => r.registration_id)
    );
    const bookedRegistrationIds = new Set(
      (bookedRows ?? []).map((r: { registration_id: string }) => r.registration_id)
    );

    function mapPlayers(rows: PlayerRegistrationRow[] | null, ctId: string, lps: MatchLineupPlayer[]): MatchPlayer[] {
      return (rows ?? []).map((row) => {
        const lineup = lps.find((l) => l.playerId === row.registration_id);
        const registration = singleRelation(row.championship_registrations);
        const player = singleRelation(registration?.players ?? null);
        return {
          registrationId: row.registration_id,
          name: player?.name ?? "Jogador",
          position: player?.position ?? null,
          number: null,
          teamId: ctId,
          isStarter: lineup?.isStarter ?? false,
          isCaptain: lineup?.isCaptain ?? false,
          photoUrl: registration?.profile_photo_link ?? null,
        };
      });
    }

    const events: MatchEventItem[] = ((eventRows ?? []) as MatchEventRow[]).map((ev) => ({
      id: ev.id,
      eventType: ev.event_type,
      eventTimeS: ev.event_time_s,
      period: ev.period,
      playerId: ev.player_id,
      playerName: singleRelation(singleRelation(ev.player)?.players ?? null)?.name ?? null,
      assistPlayerId: ev.assist_player_id,
      assistPlayerName: singleRelation(singleRelation(ev.assist)?.players ?? null)?.name ?? null,
      playerInId: ev.player_in_id,
      playerInName: singleRelation(singleRelation(ev.player_in)?.players ?? null)?.name ?? null,
      teamId: ev.team_id,
      relatedEventId: ev.related_event_id,
      notes: ev.notes,
      createdAt: ev.created_at,
    }));

    const penalties: MatchPenalty[] = ((penaltyRows ?? []) as MatchPenaltyRow[]).map((p) => ({
      id: p.id,
      teamId: p.team_id,
      playerId: p.player_id,
      playerName: singleRelation(singleRelation(p.championship_registrations)?.players ?? null)?.name ?? null,
      shotOrder: p.shot_order,
      result: p.result as MatchPenalty["result"],
    }));

    const lineups: MatchLineupPlayer[] = ((lineupRows ?? []) as MatchLineupRow[]).map((l) => ({
      id: l.id,
      playerId: l.player_id,
      championshipTeamId: l.championship_team_id,
      isStarter: l.is_starter,
      isCaptain: l.is_captain
    }));

    // ── Live score calculation ────────────────────────────────────────────────
    // When a match is IN_PROGRESS, compute score from the events list rather
    // than trusting the DB column (which may lag behind). This guarantees the
    // Scoreboard updates the instant a new event arrives via Realtime.
    const homeCTId = resolvedHomeCTId ?? "";
    const awayCTId = resolvedAwayCTId ?? "";

    const liveMatch = { ...match };
    if (match.status === "IN_PROGRESS") {
      liveMatch.home_score = events.filter(
        (e) =>
          (e.eventType === "GOAL" && e.teamId === homeCTId) ||
          (e.eventType === "OWN_GOAL" && e.teamId === awayCTId),
      ).length;
      liveMatch.away_score = events.filter(
        (e) =>
          (e.eventType === "GOAL" && e.teamId === awayCTId) ||
          (e.eventType === "OWN_GOAL" && e.teamId === homeCTId),
      ).length;
    }

    setDetail({
      match: liveMatch,
      homeTeam: { id: homeTeamData?.id ?? "", name: homeTeamData?.name ?? "Time A", logoUrl: homeTeamData?.logo_url ?? null, championshipTeamId: homeCTId, uniformColor: homeColor },
      awayTeam: { id: awayTeamData?.id ?? "", name: awayTeamData?.name ?? "Time B", logoUrl: awayTeamData?.logo_url ?? null, championshipTeamId: awayCTId, uniformColor: awayColor },
      homePlayers: mapPlayers(homePlayers, homeCTId, lineups),
      awayPlayers: mapPlayers(awayPlayers, awayCTId, lineups),
      events,
      penalties,
      lineups,
      suspendedRegistrationIds,
      bookedRegistrationIds,
    });

    setElapsed(getTotalElapsed(match));
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "match_slots", filter: `match_id=eq.${matchId}` }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [matchId, load]);

  return { detail, loading, elapsed, reload: load };
}
