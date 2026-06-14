"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildResolutionContext, resolveCtId } from "@/features/utils/resolveSlotTeam";

const supabase = createClient();

export type LiveTeam = {
  championshipTeamId: string | null;
  name: string;          // nome do time ou label do slot ("A1", "Vencedor J3"...)
  logoUrl: string | null;
  uniformColor: string | null;
};

export type LiveEvent = {
  id: string;
  eventType: string;
  eventTimeS: number;
  period: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  assistName: string | null;
};

export type LiveMatchInfo = {
  id: string;
  name: string | null;
  phaseName: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentPeriod: string;
  periodStartedAt: string | null;
  scheduledAt: string | null;
  home: LiveTeam;
  away: LiveTeam;
  homeScore: number;
  awayScore: number;
  penaltyHomeScore: number;
  penaltyAwayScore: number;
  penaltyWinner: "home" | "away" | null; // lado que venceu nos pênaltis (null = não decidido nos pênaltis)
  events: LiveEvent[];
};

export type GoalSignal = {
  eventId: string;
  playerName: string | null;
  playerPhotoUrl: string | null;
  assistName: string | null;
  teamName: string;
  teamLogoUrl: string | null;
};

export type PublicLiveData = {
  current: LiveMatchInfo | null;   // jogo IN_PROGRESS (único por campeonato)
  last: LiveMatchInfo | null;      // último COMPLETED
  next: LiveMatchInfo | null;      // próximo NOT_STARTED por scheduled_at
};

// Jogo ao vivo (ou último + próximo) do campeonato, com eventos nomeados.
// onGoal dispara quando um novo evento GOAL chega após a carga inicial.
export function usePublicLiveMatch(
  championshipId: string | null,
  onGoal?: (signal: GoalSignal) => void,
) {
  const [data, setData] = useState<PublicLiveData>({ current: null, last: null, next: null });
  const [loading, setLoading] = useState(true);
  const knownGoalIdsRef = useRef<Set<string> | null>(null);
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!championshipId) { setData({ current: null, last: null, next: null }); setLoading(false); return; }
    try {
      // Jogos ligam-se ao campeonato via phase_id (knockout_matches.championship_id
      // está nulo no schema atual — mesmo padrão do useGroupStandings).
      const { data: phaseRows } = await supabase
        .from("phases").select("id, name").eq("championship_id", championshipId);
      const phaseName = new Map((phaseRows ?? []).map((p) => [p.id, p.name]));
      const phaseIds = (phaseRows ?? []).map((p) => p.id);
      if (phaseIds.length === 0) {
        knownGoalIdsRef.current = new Set();
        setData({ current: null, last: null, next: null });
        setLoading(false);
        return;
      }

      const { data: matches } = await supabase
        .from("knockout_matches")
        .select("id, name, code, status, phase_id, current_period, period_started_at, scheduled_at, home_score, away_score, penalty_home_score, penalty_away_score, penalty_winner_team_id, completed_at")
        .in("phase_id", phaseIds);

      const all = matches ?? [];
      const current = all.find((m) => m.status === "IN_PROGRESS") ?? null;
      const last = all
        .filter((m) => m.status === "COMPLETED" && m.completed_at)
        .sort((a, b) => (b.completed_at! > a.completed_at! ? 1 : -1))[0] ?? null;
      // Próximo: não-iniciado com menor horário agendado
      const next = all
        .filter((m) => m.status === "NOT_STARTED" && m.scheduled_at)
        .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))[0] ?? null;

      const ids = [current?.id, last?.id, next?.id].filter(Boolean) as string[];
      if (ids.length === 0) {
        knownGoalIdsRef.current = new Set();
        setData({ current: null, last: null, next: null });
        setLoading(false);
        return;
      }

      const allMatchIds = all.map((m) => m.id);
      const guardIds = allMatchIds.length ? allMatchIds : ["__none__"];

      // Contexto de resolução de times (mesmo padrão do useMatchDetail): resolve
      // slots sem championship_team_id direto via group_position / match_winner.
      const [
        allSlotsRes, groupSlotsRes, sourcesRes, ctxGoalsRes, tieBreakerRes,
        champSettingsRes, ctRowsRes, eventsRes, playersRes,
      ] = await Promise.all([
        supabase.from("match_slots").select("match_id, slot_order, championship_team_id, uniform_color").in("match_id", guardIds),
        supabase.from("group_slots").select("phase_id, label, group_letter, championship_team_id").in("phase_id", phaseIds),
        supabase.from("knockout_match_sources").select("knockout_match_id, slot_order, source_type, source_group, source_position, source_match_code, source_phase_id").in("knockout_match_id", guardIds),
        supabase.from("match_events_v2").select("knockout_match_id, event_type, team_id").is("deleted_at", null).in("event_type", ["GOAL", "OWN_GOAL"]).in("knockout_match_id", guardIds),
        supabase.from("tie_breaker_rules").select("phase_id, rule, priority").in("phase_id", phaseIds).order("priority"),
        supabase.from("championships").select("points_win, points_draw, points_loss").eq("id", championshipId).maybeSingle(),
        supabase.from("championship_teams").select("id, team_id").eq("championship_id", championshipId),
        supabase.from("match_events_v2").select("id, knockout_match_id, event_type, event_time_s, period, team_id, player_id, assist_player_id").in("knockout_match_id", ids).is("deleted_at", null).order("event_time_s"),
        supabase.from("public_players").select("registration_id, player_name, photo_url").eq("championship_id", championshipId),
      ]);

      const ctx = buildResolutionContext(
        all as Parameters<typeof buildResolutionContext>[0],
        (allSlotsRes.data ?? []) as Parameters<typeof buildResolutionContext>[1],
        (groupSlotsRes.data ?? []) as Parameters<typeof buildResolutionContext>[2],
        (sourcesRes.data ?? []) as Parameters<typeof buildResolutionContext>[3],
        (ctxGoalsRes.data ?? []) as Parameters<typeof buildResolutionContext>[4],
        (tieBreakerRes.data ?? []) as Parameters<typeof buildResolutionContext>[5],
        {
          win: champSettingsRes.data?.points_win ?? 3,
          draw: champSettingsRes.data?.points_draw ?? 1,
          loss: champSettingsRes.data?.points_loss ?? 0,
        },
      );

      // ct → time (nome/logo) e uniform_color por (match, slot)
      const teamIds = (ctRowsRes.data ?? []).map((ct) => ct.team_id).filter(Boolean);
      const { data: teamRows } = await supabase
        .from("teams").select("id, name, logo_url").in("id", teamIds.length ? teamIds : ["__none__"]);
      const teamById = new Map((teamRows ?? []).map((t) => [t.id, t]));
      const ctToTeam = new Map((ctRowsRes.data ?? []).map((ct) => [ct.id, teamById.get(ct.team_id) ?? null]));
      const uniformBySlot = new Map(
        (allSlotsRes.data ?? []).map((s) => [`${s.match_id}:${s.slot_order}`, s.uniform_color as string | null]),
      );

      const playerName = new Map((playersRes.data ?? []).map((p) => [p.registration_id, p.player_name]));
      const playerPhoto = new Map((playersRes.data ?? []).map((p) => [p.registration_id, p.photo_url as string | null]));

      // Resolve o time de um slot (direto ou via group_position/match_winner)
      const resolveTeam = (matchId: string, slotOrder: number): LiveTeam => {
        const ctId = resolveCtId(matchId, slotOrder, ctx);
        const team = ctId ? ctToTeam.get(ctId) : null;
        return {
          championshipTeamId: ctId,
          name: team?.name ?? "A definir",
          logoUrl: team?.logo_url ?? null,
          uniformColor: uniformBySlot.get(`${matchId}:${slotOrder}`) ?? null,
        };
      };

      const build = (m: typeof current): LiveMatchInfo | null => {
        if (!m) return null;
        const home = resolveTeam(m.id, 1);
        const away = resolveTeam(m.id, 2);
        const events: LiveEvent[] = (eventsRes.data ?? [])
          .filter((e) => e.knockout_match_id === m.id)
          .map((e) => ({
            id: e.id,
            eventType: e.event_type,
            eventTimeS: e.event_time_s,
            period: e.period,
            teamId: e.team_id,
            playerId: e.player_id,
            playerName: e.player_id ? playerName.get(e.player_id) ?? null : null,
            assistName: e.assist_player_id ? playerName.get(e.assist_player_id) ?? null : null,
          }));

        // Placar ao vivo derivado dos eventos (mesma regra do useGroupStandings)
        let homeScore = m.home_score ?? 0;
        let awayScore = m.away_score ?? 0;
        if (m.status === "IN_PROGRESS" && home.championshipTeamId && away.championshipTeamId) {
          homeScore = events.filter(
            (e) =>
              (e.eventType === "GOAL" && e.teamId === home.championshipTeamId) ||
              (e.eventType === "OWN_GOAL" && e.teamId === away.championshipTeamId),
          ).length;
          awayScore = events.filter(
            (e) =>
              (e.eventType === "GOAL" && e.teamId === away.championshipTeamId) ||
              (e.eventType === "OWN_GOAL" && e.teamId === home.championshipTeamId),
          ).length;
        }

        // Vencedor nos pênaltis: usa penalty_winner_team_id; se ausente, deriva do placar de pênaltis
        const penaltyHomeScore = m.penalty_home_score ?? 0;
        const penaltyAwayScore = m.penalty_away_score ?? 0;
        let penaltyWinner: "home" | "away" | null = null;
        if (m.penalty_winner_team_id) {
          penaltyWinner = m.penalty_winner_team_id === home.championshipTeamId ? "home" : "away";
        } else if (penaltyHomeScore !== penaltyAwayScore) {
          penaltyWinner = penaltyHomeScore > penaltyAwayScore ? "home" : "away";
        }

        return {
          id: m.id,
          name: m.name,
          phaseName: phaseName.get(m.phase_id ?? "") ?? null,
          status: m.status as LiveMatchInfo["status"],
          currentPeriod: m.current_period,
          periodStartedAt: m.period_started_at,
          scheduledAt: m.scheduled_at,
          home, away, homeScore, awayScore,
          penaltyHomeScore,
          penaltyAwayScore,
          penaltyWinner,
          events,
        };
      };

      const builtCurrent = build(current);

      // Detecta gols novos do jogo atual (depois da carga inicial)
      const goalEvents = (builtCurrent?.events ?? []).filter(
        (e) => e.eventType === "GOAL" || e.eventType === "OWN_GOAL",
      );
      if (knownGoalIdsRef.current === null) {
        knownGoalIdsRef.current = new Set(goalEvents.map((e) => e.id));
      } else {
        for (const g of goalEvents) {
          if (!knownGoalIdsRef.current.has(g.id)) {
            knownGoalIdsRef.current.add(g.id);
            const scoringTeam =
              g.eventType === "OWN_GOAL"
                ? (g.teamId === builtCurrent!.home.championshipTeamId ? builtCurrent!.away : builtCurrent!.home)
                : (g.teamId === builtCurrent!.home.championshipTeamId ? builtCurrent!.home : builtCurrent!.away);
            onGoalRef.current?.({
              eventId: g.id,
              playerName: g.playerName,
              playerPhotoUrl: g.playerId ? playerPhoto.get(g.playerId) ?? null : null,
              assistName: g.assistName,
              teamName: scoringTeam.name,
              teamLogoUrl: scoringTeam.logoUrl,
            });
          }
        }
      }

      setData({ current: builtCurrent, last: build(last), next: build(next) });
    } finally {
      setLoading(false);
    }
  }, [championshipId]);

  useEffect(() => {
    knownGoalIdsRef.current = null;
    queueMicrotask(() => { void load(); });
    if (!championshipId) return;

    // Sem filtro por championship_id (é nulo no schema); reload em qualquer
    // mudança de jogo/evento — volume baixo para um telão de 1 campeonato.
    const channel = supabase
      .channel(`public-live-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "knockout_matches" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void load(); })
      .subscribe();

    pollingRef.current = setInterval(() => { void load(); }, 15_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [load, championshipId]);

  return { ...data, loading, reload: load };
}
