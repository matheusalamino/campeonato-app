"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GoalkeeperScore } from "@/types/goalkeeper";

const supabase = createClient();

type RawSave = {
  registration_id: string;
  match_id: string;
  is_penalty: boolean;
};

type RawGoalEvent = {
  event_type: string;
  team_id: string;
  knockout_match_id: string;
};

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

export function useGoalkeeper(championshipId: string | null) {
  const [leaderboard, setLeaderboard] = useState<GoalkeeperScore[]>([]);
  const [loading, setLoading] = useState(false);

  const rawSavesRef = useRef<RawSave[]>([]);
  const rawGoalEventsRef = useRef<RawGoalEvent[]>([]);
  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const rawGoalEvents = rawGoalEventsRef.current;

    const gkMap = new Map<string, {
      matchIds: Set<string>;
      decisiveSaves: number;
      penaltySaves: number;
    }>();

    for (const save of rawSavesRef.current) {
      const existing = gkMap.get(save.registration_id);
      const entry = existing ?? { matchIds: new Set<string>(), decisiveSaves: 0, penaltySaves: 0 };
      entry.matchIds.add(save.match_id);
      if (save.is_penalty) entry.penaltySaves++;
      else entry.decisiveSaves++;
      if (!existing) gkMap.set(save.registration_id, entry);
    }

    const result: GoalkeeperScore[] = [];

    for (const [registrationId, stats] of gkMap.entries()) {
      const info = regInfoMap.get(registrationId);
      if (!info) continue;

      const partidas = stats.matchIds.size;
      const pd = stats.penaltySaves;
      const mdd = partidas > 0 ? stats.decisiveSaves / partidas : 0;

      // Goals conceded = goals scored by opposing team in the gk's matches.
      // In match_events_v2, team_id is the championship_team_id of the scoring team.
      // OWN_GOAL.team_id = the team that scored the own goal (i.e. the defending team).
      let goalsConceded = 0;
      for (const event of rawGoalEvents) {
        if (!stats.matchIds.has(event.knockout_match_id)) continue;
        if (
          (event.event_type === "GOAL" || event.event_type === "PENALTY_GOAL") &&
          event.team_id !== info.teamId
        ) {
          goalsConceded++;
        } else if (event.event_type === "OWN_GOAL" && event.team_id === info.teamId) {
          goalsConceded++;
        }
      }

      const mgs = partidas > 0 ? goalsConceded / partidas : 0;
      // IOG = (5 − MGS) + (2 × PD) + (2 × MDD)
      const iog = (5 - mgs) + (2 * pd) + (2 * mdd);

      result.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
        matchesPlayed: partidas,
        goalsConceded,
        decisiveSaves: stats.decisiveSaves,
        penaltySaves: pd,
        mgs,
        mdd,
        pd,
        iog,
      });
    }

    result.sort((a, b) => b.iog - a.iog);
    setLeaderboard(result);
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    if (!championshipId) {
      rawSavesRef.current = [];
      rawGoalEventsRef.current = [];
      regInfoMapRef.current = new Map();
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [savesRes, eventsRes, regsRes] = await Promise.all([
        supabase
          .from("player_saves")
          .select("registration_id, match_id, is_penalty")
          .eq("championship_id", championshipId),
        supabase
          .from("match_events_v2")
          .select("event_type, team_id, knockout_match_id")
          .eq("championship_id", championshipId)
          .is("deleted_at", null)
          .in("event_type", ["GOAL", "OWN_GOAL", "PENALTY_GOAL"]),
        supabase
          .from("championship_registrations")
          .select("id, profile_photo_link, players(id, name)")
          .eq("championship_id", championshipId),
      ]);

      const gkRegIds = [...new Set((savesRes.data ?? []).map(s => s.registration_id))];

      const { data: ctpRows } = await supabase
        .from("championship_team_players")
        .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
        .in("registration_id", gkRegIds.length ? gkRegIds : ["__none__"]);

      const ctpMap = new Map<string, { teamId: string; teamName: string }>();
      for (const ctp of ctpRows ?? []) {
        if (ctpMap.has(ctp.registration_id)) continue;
        const ct = ctp.championship_teams as unknown as { id: string; teams: { name: string } | { name: string }[] | null } | null;
        const teamsRel = ct?.teams;
        const teamName = (Array.isArray(teamsRel) ? teamsRel[0]?.name : teamsRel?.name) ?? "—";
        ctpMap.set(ctp.registration_id, { teamId: ctp.championship_team_id, teamName });
      }

      const newRegInfoMap = new Map<string, RegInfo>();
      for (const reg of regsRes.data ?? []) {
        if (!gkRegIds.includes(reg.id)) continue;
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
        const teamInfo = ctpMap.get(reg.id);
        if (!teamInfo) continue;
        newRegInfoMap.set(reg.id, {
          playerName,
          playerPhoto: reg.profile_photo_link ?? null,
          teamId: teamInfo.teamId,
          teamName: teamInfo.teamName,
        });
      }

      if (seq !== loadSeqRef.current) return;

      rawSavesRef.current = (savesRes.data ?? []) as RawSave[];
      rawGoalEventsRef.current = (eventsRes.data ?? []) as RawGoalEvent[];
      regInfoMapRef.current = newRegInfoMap;
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [championshipId]);

  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => { void load().then(() => deriveRef.current()); }, [load]);

  return { leaderboard, loading };
}
