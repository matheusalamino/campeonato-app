"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ManagerScore, ManagerVoteDetail } from "@/types/best-player";

const supabase = createClient();

type RawVote = {
  match_id: string;
  championship_team_id: string;
  points: number;
};

type TeamInfo = {
  teamName: string;
  baseTeamId: string; // teams.id — used to join championship_managers
};

type ManagerInfo = {
  managerName: string | null;
  managerPhoto: string | null;
};

export function useBestManager(championshipId: string | null) {
  const [leaderboard, setLeaderboard] = useState<ManagerScore[]>([]);
  const [loading, setLoading] = useState(false);

  const teamInfoMapRef = useRef<Map<string, TeamInfo>>(new Map());   // championshipTeamId → TeamInfo
  const managerMapRef = useRef<Map<string, ManagerInfo>>(new Map()); // baseTeamId → ManagerInfo
  const rawVotesRef = useRef<RawVote[]>([]);
  const matchMapRef = useRef<Map<string, { name: string; phaseId: string }>>(new Map());
  const phaseMapRef = useRef<Map<string, string>>(new Map());
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const teamInfoMap = teamInfoMapRef.current;
    const managerMap = managerMapRef.current;
    const matchMap = matchMapRef.current;
    const phaseMap = phaseMapRef.current;

    const scoreMap = new Map<string, { info: TeamInfo; mgr: ManagerInfo; votes: ManagerVoteDetail[]; total: number }>();

    for (const vote of rawVotesRef.current) {
      const info = teamInfoMap.get(vote.championship_team_id);
      if (!info) continue;

      const mgr = managerMap.get(info.baseTeamId) ?? { managerName: null, managerPhoto: null };
      const matchInfo = matchMap.get(vote.match_id);
      const voteDetail: ManagerVoteDetail = {
        matchId: vote.match_id,
        matchName: matchInfo?.name ?? "—",
        phaseName: matchInfo?.phaseId ? (phaseMap.get(matchInfo.phaseId) ?? "—") : "—",
        points: vote.points,
      };

      const existing = scoreMap.get(vote.championship_team_id);
      if (existing) {
        existing.votes.push(voteDetail);
        existing.total += vote.points;
      } else {
        scoreMap.set(vote.championship_team_id, { info, mgr, votes: [voteDetail], total: vote.points });
      }
    }

    const result: ManagerScore[] = [];
    for (const [championshipTeamId, { info, mgr, votes, total }] of scoreMap.entries()) {
      result.push({
        championshipTeamId,
        teamName: info.teamName,
        managerName: mgr.managerName,
        managerPhoto: mgr.managerPhoto,
        totalPoints: total,
        votes,
      });
    }

    result.sort((a, b) => b.totalPoints - a.totalPoints);
    setLeaderboard(result);
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    if (!championshipId) {
      teamInfoMapRef.current = new Map();
      managerMapRef.current = new Map();
      rawVotesRef.current = [];
      matchMapRef.current = new Map();
      phaseMapRef.current = new Map();
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [votesRes, matchesRes, phasesRes, ctRes, cmRes] = await Promise.all([
        supabase
          .from("best_manager_votes")
          .select("match_id, championship_team_id, points")
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
          .from("championship_teams")
          .select("id, team_id, teams(name)")
          .eq("championship_id", championshipId),
        supabase
          .from("championship_managers")
          .select("team_id, managers(name, photo_url)")
          .eq("championship_id", championshipId),
      ]);

      if (seq !== loadSeqRef.current) return;

      // Build match map
      const newMatchMap = new Map<string, { name: string; phaseId: string }>();
      for (const m of matchesRes.data ?? []) {
        newMatchMap.set(m.id, { name: m.name ?? "—", phaseId: m.phase_id ?? "" });
      }

      // Build phase map
      const newPhaseMap = new Map<string, string>();
      for (const p of phasesRes.data ?? []) {
        newPhaseMap.set(p.id, p.name);
      }

      // Build teamInfoMap: championshipTeamId → { teamName, baseTeamId }
      const newTeamInfoMap = new Map<string, TeamInfo>();
      for (const ct of ctRes.data ?? []) {
        const teamsRel = ct.teams as { name: string } | { name: string }[] | null;
        const teamName = (Array.isArray(teamsRel) ? teamsRel[0]?.name : teamsRel?.name) ?? "—";
        newTeamInfoMap.set(ct.id, { teamName, baseTeamId: ct.team_id });
      }

      // Build managerMap: baseTeamId → { managerName, managerPhoto }
      const newManagerMap = new Map<string, ManagerInfo>();
      for (const cm of cmRes.data ?? []) {
        if (!cm.team_id) continue;
        const mgr = cm.managers as { name: string; photo_url: string | null } | { name: string; photo_url: string | null }[] | null;
        const mgrRow = Array.isArray(mgr) ? mgr[0] : mgr;
        if (!mgrRow) continue;
        newManagerMap.set(cm.team_id, { managerName: mgrRow.name, managerPhoto: mgrRow.photo_url ?? null });
      }

      rawVotesRef.current = (votesRes.data ?? []) as RawVote[];
      matchMapRef.current = newMatchMap;
      phaseMapRef.current = newPhaseMap;
      teamInfoMapRef.current = newTeamInfoMap;
      managerMapRef.current = newManagerMap;
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
