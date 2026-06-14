"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { GoalkeeperScore } from "@/types/goalkeeper";

const supabase = createClient();

const GK_POSITIONS = new Set(["GOL", "Goleiro"]);

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

type RawLineup = {
  player_id: string;
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
  const rawLineupsRef = useRef<RawLineup[]>([]);
  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const rawGoalEvents = rawGoalEventsRef.current;

    // Build match participation per goalkeeper: union of lineup entries and saves entries.
    // This covers goalkeepers who played but had zero saves (lineup-only).
    const gkMatchMap = new Map<string, Set<string>>();

    for (const lineup of rawLineupsRef.current) {
      const set = gkMatchMap.get(lineup.player_id) ?? new Set<string>();
      set.add(lineup.knockout_match_id);
      gkMatchMap.set(lineup.player_id, set);
    }
    for (const save of rawSavesRef.current) {
      const set = gkMatchMap.get(save.registration_id) ?? new Set<string>();
      set.add(save.match_id);
      gkMatchMap.set(save.registration_id, set);
    }

    // Saves per goalkeeper
    const savesMap = new Map<string, { decisiveSaves: number; penaltySaves: number }>();
    for (const save of rawSavesRef.current) {
      const entry = savesMap.get(save.registration_id) ?? { decisiveSaves: 0, penaltySaves: 0 };
      if (save.is_penalty) entry.penaltySaves++;
      else entry.decisiveSaves++;
      savesMap.set(save.registration_id, entry);
    }

    const result: GoalkeeperScore[] = [];

    for (const [registrationId, matchIds] of gkMatchMap.entries()) {
      const info = regInfoMap.get(registrationId);
      if (!info) continue;

      const partidas = matchIds.size;
      const { decisiveSaves, penaltySaves } = savesMap.get(registrationId) ?? { decisiveSaves: 0, penaltySaves: 0 };
      const pd = penaltySaves;
      const mdd = partidas > 0 ? decisiveSaves / partidas : 0;

      // Goals conceded = goals scored by opposing team in the gk's matches.
      // team_id in match_events_v2 is the championship_team_id of the scoring team.
      // OWN_GOAL.team_id = the team that scored own goal (the defending/conceding team).
      let goalsConceded = 0;
      for (const event of rawGoalEvents) {
        if (!matchIds.has(event.knockout_match_id)) continue;
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
        decisiveSaves,
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
      rawLineupsRef.current = [];
      regInfoMapRef.current = new Map();
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Step 1: saves + registrations in parallel
      const [savesRes, regsRes] = await Promise.all([
        supabase
          .from("player_saves")
          .select("registration_id, match_id, is_penalty")
          .eq("championship_id", championshipId),
        supabase
          .from("championship_registrations")
          .select("id, profile_photo_link, players(id, name, position)")
          .eq("championship_id", championshipId),
      ]);

      // Goalkeeper reg ids: position-based (GOL/Goleiro) + anyone with saves
      const gkRegIds = new Set<string>();
      for (const reg of regsRes.data ?? []) {
        const playersRel = reg.players as { position: string | null } | { position: string | null }[] | null;
        const pos = (Array.isArray(playersRel) ? playersRel[0]?.position : playersRel?.position) ?? null;
        if (pos && GK_POSITIONS.has(pos)) gkRegIds.add(reg.id);
      }
      for (const save of savesRes.data ?? []) gkRegIds.add(save.registration_id);

      const gkRegIdsArray = [...gkRegIds];

      if (!gkRegIdsArray.length) {
        if (seq !== loadSeqRef.current) return;
        rawSavesRef.current = [];
        rawGoalEventsRef.current = [];
        rawLineupsRef.current = [];
        regInfoMapRef.current = new Map();
        return;
      }

      // Step 2: lineups (starters) + team info in parallel
      const [lineupsRes, ctpRes] = await Promise.all([
        supabase
          .from("match_lineups")
          .select("player_id, knockout_match_id")
          .in("player_id", gkRegIdsArray)
          .eq("is_starter", true),
        supabase
          .from("championship_team_players")
          .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
          .in("registration_id", gkRegIdsArray),
      ]);

      // All match IDs the goalkeepers were involved in (lineups + saves)
      const allMatchIds = new Set<string>();
      for (const l of lineupsRes.data ?? []) allMatchIds.add(l.knockout_match_id);
      for (const s of savesRes.data ?? []) allMatchIds.add(s.match_id);
      const allMatchIdsArray = [...allMatchIds];

      // Step 3: goal events filtered by match_id — avoids championship_id NULL issue
      // on events recorded before championship_id was added to match_events_v2.
      const eventsRes = allMatchIdsArray.length
        ? await supabase
            .from("match_events_v2")
            .select("event_type, team_id, knockout_match_id")
            .in("knockout_match_id", allMatchIdsArray)
            .is("deleted_at", null)
            .in("event_type", ["GOAL", "OWN_GOAL", "PENALTY_GOAL"])
        : { data: [] as { event_type: string; team_id: string; knockout_match_id: string }[] };

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
        if (!gkRegIds.has(reg.id)) continue;
        const teamInfo = ctpMap.get(reg.id);
        if (!teamInfo) continue;
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
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
      rawLineupsRef.current = (lineupsRes.data ?? []) as RawLineup[];
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
