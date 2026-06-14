"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicPlayer, PublicPlayerStats, RankingEntry } from "@/lib/public/types";
import {
  sumVotePoints,
  buildStatRanking,
  buildVoteRanking,
  groupRankingByPosition,
} from "@/lib/public/match-stats";

const supabase = createClient();

type IogRow = {
  registration_id: string;
  matches_played: number;
  goals_conceded: number;
  penalty_saves: number;
  decisive_saves: number;
  iog: number;
};

type RevelationRow = {
  registration_id: string;
  goals: number;
  assists: number;
  matches_played: number;
  participations_per_match: number;
  final_overall: number;
};

export type PublicRankings = {
  players: PublicPlayer[];
  stats: PublicPlayerStats[];
  topScorers: RankingEntry[];
  topAssists: RankingEntry[];
  craque: RankingEntry[];
  craqueByPosition: Record<string, RankingEntry[]>;
  goalkeepers: RankingEntry[];
  revelations: RankingEntry[];
};

const EMPTY: PublicRankings = {
  players: [], stats: [], topScorers: [], topAssists: [],
  craque: [], craqueByPosition: {}, goalkeepers: [], revelations: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPlayer(r: any): PublicPlayer {
  return {
    registrationId: r.registration_id,
    championshipId: r.championship_id,
    playerName: r.player_name,
    officialName: r.official_name,
    position: r.position,
    photoUrl: r.photo_url,
    finalOverall: r.final_overall === null ? null : Number(r.final_overall),
    championshipTeamId: r.championship_team_id,
    teamName: r.team_name,
    teamLogoUrl: r.team_logo_url,
  };
}

function mapStats(r: any): PublicPlayerStats {
  return {
    registrationId: r.registration_id,
    goals: r.goals, assists: r.assists,
    yellowCards: r.yellow_cards, redCards: r.red_cards,
    decisiveSaves: r.decisive_saves, penaltySaves: r.penalty_saves,
    fouls: r.fouls, matchesPlayed: r.matches_played,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Rankings públicos do campeonato — Realtime (eventos) + polling 15s
export function usePublicRankings(championshipId: string | null, topN = 3) {
  const [rankings, setRankings] = useState<PublicRankings>(EMPTY);
  // Inicia true para a /stats mostrar skeleton já no primeiro render (o consumidor
  // guarda com players.length===0, então polls subsequentes não re-exibem skeleton)
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!championshipId) { setRankings(EMPTY); setLoading(false); return; }
    setLoading(true);
    try {
      const [playersRes, statsRes, votesRes, iogRes, revRes] = await Promise.all([
        supabase.from("public_players").select("*").eq("championship_id", championshipId),
        supabase.from("public_player_stats").select("*").eq("championship_id", championshipId),
        supabase.from("best_player_votes").select("registration_id, points").eq("championship_id", championshipId),
        supabase.rpc("public_goalkeeper_iog", { p_championship_id: championshipId }),
        supabase.rpc("public_revelation_candidates", { p_championship_id: championshipId }),
      ]);

      const players = (playersRes.data ?? []).map(mapPlayer);
      const stats = (statsRes.data ?? []).map(mapStats);
      const byId = new Map(players.map((p) => [p.registrationId, p]));
      const voteTotals = sumVotePoints(votesRes.data ?? []);

      const goalkeepers: RankingEntry[] = ((iogRes.data ?? []) as IogRow[])
        .filter((r) => byId.has(r.registration_id))
        .slice(0, topN)
        .map((r) => {
          const p = byId.get(r.registration_id)!;
          return {
            registrationId: p.registrationId, playerName: p.playerName,
            teamName: p.teamName, photoUrl: p.photoUrl, position: p.position,
            value: Number(r.iog),
            detail: `${r.decisive_saves} defesas · ${r.goals_conceded} GS`,
          };
        });

      const revelations: RankingEntry[] = ((revRes.data ?? []) as RevelationRow[])
        .filter((r) => byId.has(r.registration_id))
        .slice(0, topN)
        .map((r) => {
          const p = byId.get(r.registration_id)!;
          return {
            registrationId: p.registrationId, playerName: p.playerName,
            teamName: p.teamName, photoUrl: p.photoUrl, position: p.position,
            value: Number(r.participations_per_match),
            detail: `OVR ${r.final_overall}`,
          };
        });

      setRankings({
        players, stats,
        topScorers: buildStatRanking(stats, players, (s) => s.goals, topN),
        topAssists: buildStatRanking(stats, players, (s) => s.assists, topN),
        craque: buildVoteRanking(voteTotals, players, topN),
        craqueByPosition: groupRankingByPosition(voteTotals, players, topN),
        goalkeepers, revelations,
      });
    } finally {
      setLoading(false);
    }
  }, [championshipId, topN]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
    if (!championshipId) return;

    // Realtime nos eventos (gol muda artilharia) + polling de segurança
    const channel = supabase
      .channel(`public-rankings-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "best_player_votes", filter: `championship_id=eq.${championshipId}` }, () => { void load(); })
      .subscribe();

    pollingRef.current = setInterval(() => { void load(); }, 15_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [load, championshipId]);

  return { rankings, loading, reload: load };
}
