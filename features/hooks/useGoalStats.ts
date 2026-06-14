"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GoalScore, AssistScore } from "@/types/goal-stats";

const supabase = createClient();

type RawEvent = {
  event_type: string;
  player_id: string | null;
  assist_player_id: string | null;
};

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

export function useGoalStats(championshipId: string | null) {
  const [scorers, setScorers] = useState<GoalScore[]>([]);
  const [assisters, setAssisters] = useState<AssistScore[]>([]);
  const [loading, setLoading] = useState(false);

  const rawEventsRef = useRef<RawEvent[]>([]);
  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;

    const scorerMap = new Map<string, { regularGoals: number; penaltyGoals: number }>();
    const assistMap = new Map<string, number>();

    for (const event of rawEventsRef.current) {
      if (event.player_id) {
        const entry = scorerMap.get(event.player_id) ?? { regularGoals: 0, penaltyGoals: 0 };
        if (event.event_type === "GOAL") entry.regularGoals++;
        else if (event.event_type === "PENALTY_GOAL") entry.penaltyGoals++;
        scorerMap.set(event.player_id, entry);
      }
      if (event.assist_player_id) {
        assistMap.set(event.assist_player_id, (assistMap.get(event.assist_player_id) ?? 0) + 1);
      }
    }

    const newScorers: GoalScore[] = [];
    for (const [registrationId, { regularGoals, penaltyGoals }] of scorerMap.entries()) {
      const info = regInfoMap.get(registrationId);
      if (!info) continue;
      newScorers.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
        goals: regularGoals + penaltyGoals,
        regularGoals,
        penaltyGoals,
      });
    }
    newScorers.sort((a, b) => b.goals - a.goals);
    setScorers(newScorers);

    const newAssisters: AssistScore[] = [];
    for (const [registrationId, assists] of assistMap.entries()) {
      const info = regInfoMap.get(registrationId);
      if (!info) continue;
      newAssisters.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
        assists,
      });
    }
    newAssisters.sort((a, b) => b.assists - a.assists);
    setAssisters(newAssisters);
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    if (!championshipId) {
      rawEventsRef.current = [];
      regInfoMapRef.current = new Map();
      setScorers([]);
      setAssisters([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Round 1: phases + registrations in parallel.
      // phases.championship_id is always reliable; we use it to reach match IDs
      // instead of knockout_matches.championship_id (a backfilled column, not trustworthy).
      const [phasesRes, regsRes] = await Promise.all([
        supabase.from("phases").select("id").eq("championship_id", championshipId),
        supabase
          .from("championship_registrations")
          .select("id, profile_photo_link, players(id, name)")
          .eq("championship_id", championshipId),
      ]);

      const phaseIds = (phasesRes.data ?? []).map(p => p.id);
      const allRegIds = (regsRes.data ?? []).map(r => r.id);

      // Round 2: match IDs (via phase_id, reliable) + team info in parallel.
      const [matchesRes, ctpRes] = await Promise.all([
        phaseIds.length
          ? supabase.from("knockout_matches").select("id").in("phase_id", phaseIds)
          : Promise.resolve({ data: [] as { id: string }[] }),
        supabase
          .from("championship_team_players")
          .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
          .in("registration_id", allRegIds.length ? allRegIds : ["__none__"]),
      ]);

      const matchIds = (matchesRes.data ?? []).map(m => m.id);

      // Round 3: events by knockout_match_id — no championship_id filter needed
      // since championship_id is not reliably set on match_events_v2 rows.
      // This is the same pattern used by useGroupStandings.
      const eventsRes = matchIds.length
        ? await supabase
            .from("match_events_v2")
            .select("event_type, player_id, assist_player_id")
            .in("knockout_match_id", matchIds)
            .is("deleted_at", null)
            .in("event_type", ["GOAL", "PENALTY_GOAL"])
        : { data: [] as RawEvent[] };

      const ctpMap = new Map<string, { teamId: string; teamName: string }>();
      for (const ctp of ctpRes.data ?? []) {
        if (ctpMap.has(ctp.registration_id)) continue;
        const ct = ctp.championship_teams as unknown as { id: string; teams: { name: string } | { name: string }[] | null } | null;
        const teamsRel = ct?.teams;
        const teamName = (Array.isArray(teamsRel) ? teamsRel[0]?.name : teamsRel?.name) ?? "—";
        ctpMap.set(ctp.registration_id, { teamId: ctp.championship_team_id, teamName });
      }

      const newRegInfoMap = new Map<string, RegInfo>();
      for (const reg of regsRes.data ?? []) {
        const teamInfo = ctpMap.get(reg.id);
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
        newRegInfoMap.set(reg.id, {
          playerName,
          playerPhoto: reg.profile_photo_link ?? null,
          teamId: teamInfo?.teamId ?? "",
          teamName: teamInfo?.teamName ?? "—",
        });
      }

      if (seq !== loadSeqRef.current) return;

      rawEventsRef.current = (eventsRes.data ?? []) as RawEvent[];
      regInfoMapRef.current = newRegInfoMap;
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [championshipId]);

  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => { void load().then(() => deriveRef.current()); }, [load]);

  return { scorers, assisters, loading };
}
