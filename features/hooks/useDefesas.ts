"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DefesaScore } from "@/types/defesas";

const supabase = createClient();

type RawSave = {
  match_id: string;
  registration_id: string;
  is_penalty: boolean;
};

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

export function useDefesas(championshipId: string | null) {
  const [leaderboard, setLeaderboard] = useState<DefesaScore[]>([]);
  const [loading, setLoading] = useState(false);

  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const rawSavesRef = useRef<RawSave[]>([]);
  const matchMapRef = useRef<Map<string, { name: string; phaseId: string }>>(new Map());
  const phaseMapRef = useRef<Map<string, string>>(new Map());
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const matchMap = matchMapRef.current;
    const phaseMap = phaseMapRef.current;

    const scoreMap = new Map<string, {
      info: RegInfo;
      totalSaves: number;
      penaltySaves: number;
      byMatchMap: Map<string, { count: number; penaltyCount: number }>;
    }>();

    for (const save of rawSavesRef.current) {
      const info = regInfoMap.get(save.registration_id);
      if (!info) continue;

      const existing = scoreMap.get(save.registration_id);
      const entry = existing ?? {
        info,
        totalSaves: 0,
        penaltySaves: 0,
        byMatchMap: new Map<string, { count: number; penaltyCount: number }>(),
      };

      entry.totalSaves++;
      if (save.is_penalty) entry.penaltySaves++;

      const matchEntry = entry.byMatchMap.get(save.match_id) ?? { count: 0, penaltyCount: 0 };
      matchEntry.count++;
      if (save.is_penalty) matchEntry.penaltyCount++;
      entry.byMatchMap.set(save.match_id, matchEntry);

      scoreMap.set(save.registration_id, entry);
    }

    const result: DefesaScore[] = [];
    for (const [registrationId, { info, totalSaves, penaltySaves, byMatchMap }] of scoreMap.entries()) {
      const byMatch = [];
      for (const [matchId, { count, penaltyCount }] of byMatchMap.entries()) {
        const matchInfo = matchMap.get(matchId);
        byMatch.push({
          matchId,
          matchName: matchInfo?.name ?? "—",
          phaseName: matchInfo?.phaseId ? (phaseMap.get(matchInfo.phaseId) ?? "—") : "—",
          count,
          penaltyCount,
        });
      }
      result.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
        totalSaves,
        penaltySaves,
        regularSaves: totalSaves - penaltySaves,
        byMatch,
      });
    }

    result.sort((a, b) => b.totalSaves - a.totalSaves);
    setLeaderboard(result);
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    if (!championshipId) {
      regInfoMapRef.current = new Map();
      rawSavesRef.current = [];
      matchMapRef.current = new Map();
      phaseMapRef.current = new Map();
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [savesRes, matchesRes, phasesRes, regsRes] = await Promise.all([
        supabase
          .from("player_saves")
          .select("match_id, registration_id, is_penalty")
          .eq("championship_id", championshipId),
        supabase
          .from("knockout_matches")
          .select("id, name, phase_id")
          .eq("championship_id", championshipId),
        supabase
          .from("phases")
          .select("id, name")
          .eq("championship_id", championshipId),
        supabase
          .from("championship_registrations")
          .select("id, profile_photo_link, players(id, name)")
          .eq("championship_id", championshipId),
      ]);

      const newMatchMap = new Map<string, { name: string; phaseId: string }>();
      for (const m of matchesRes.data ?? []) {
        newMatchMap.set(m.id, { name: m.name ?? "—", phaseId: m.phase_id ?? "" });
      }

      const newPhaseMap = new Map<string, string>();
      for (const p of phasesRes.data ?? []) {
        newPhaseMap.set(p.id, p.name);
      }

      const regIds = (regsRes.data ?? []).map(r => r.id);
      const { data: ctpRows } = await supabase
        .from("championship_team_players")
        .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
        .in("registration_id", regIds.length ? regIds : ["__none__"]);

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
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
        const teamInfo = ctpMap.get(reg.id);
        newRegInfoMap.set(reg.id, {
          playerName,
          playerPhoto: reg.profile_photo_link ?? null,
          teamId: teamInfo?.teamId ?? "",
          teamName: teamInfo?.teamName ?? "—",
        });
      }

      if (seq !== loadSeqRef.current) return;

      regInfoMapRef.current = newRegInfoMap;
      rawSavesRef.current = (savesRes.data ?? []) as RawSave[];
      matchMapRef.current = newMatchMap;
      phaseMapRef.current = newPhaseMap;
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [championshipId]);

  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => { void load().then(() => deriveRef.current()); }, [load]);

  return {
    leaderboard,
    loading,
    reload: async () => { await load(); derive(); },
  };
}
