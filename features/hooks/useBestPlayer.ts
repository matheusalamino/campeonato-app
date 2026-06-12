"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlayerScore, VoteDetail, VoterRole } from "@/types/best-player";

const supabase = createClient();

type RawVote = {
  id: string;
  match_id: string;
  registration_id: string;
  voter_role: string;
  points: number;
};

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

export function useBestPlayer(championshipId: string | null) {
  const [leaderboard, setLeaderboard] = useState<PlayerScore[]>([]);
  const [loading, setLoading] = useState(false);

  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const rawVotesRef = useRef<RawVote[]>([]);
  const matchMapRef = useRef<Map<string, { name: string; phaseId: string }>>(new Map());
  const phaseMapRef = useRef<Map<string, string>>(new Map()); // phaseId → phaseName
  const loadSeqRef = useRef(0);

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const matchMap = matchMapRef.current;
    const phaseMap = phaseMapRef.current;

    // Group votes by registration_id
    const scoreMap = new Map<string, { info: RegInfo; votes: VoteDetail[]; total: number }>();

    for (const vote of rawVotesRef.current) {
      const info = regInfoMap.get(vote.registration_id);
      if (!info) continue;

      const matchInfo = matchMap.get(vote.match_id);
      const voteDetail: VoteDetail = {
        matchId: vote.match_id,
        matchName: matchInfo?.name ?? "—",
        phaseName: matchInfo?.phaseId ? (phaseMap.get(matchInfo.phaseId) ?? "—") : "—",
        voterRole: vote.voter_role as VoterRole,
        points: vote.points,
      };

      const existing = scoreMap.get(vote.registration_id);
      if (existing) {
        existing.votes.push(voteDetail);
        existing.total += vote.points;
      } else {
        scoreMap.set(vote.registration_id, { info, votes: [voteDetail], total: vote.points });
      }
    }

    const result: PlayerScore[] = [];
    for (const [registrationId, { info, votes, total }] of scoreMap.entries()) {
      result.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
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
      regInfoMapRef.current = new Map();
      rawVotesRef.current = [];
      matchMapRef.current = new Map();
      phaseMapRef.current = new Map();
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Parallel fetches
      const [votesRes, matchesRes, phasesRes, regsRes] = await Promise.all([
        supabase
          .from("best_player_votes")
          .select("id, match_id, registration_id, voter_role, points")
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

      // Build regInfoMap (reuse pattern from useDisciplinary)
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

      // Discard if a newer load has started since this one was launched
      if (seq !== loadSeqRef.current) return;

      regInfoMapRef.current = newRegInfoMap;
      rawVotesRef.current = (votesRes.data ?? []) as RawVote[];
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
