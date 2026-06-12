// Funções puras de ranking — alimentadas pelos hooks públicos
import type { PublicPlayer, PublicPlayerStats, RankingEntry } from "./types";

type VoteRow = { registration_id: string; points: number };

// Soma pontos de best_player_votes por inscrição
export function sumVotePoints(votes: VoteRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const v of votes) {
    totals.set(v.registration_id, (totals.get(v.registration_id) ?? 0) + v.points);
  }
  return totals;
}

function toEntry(p: PublicPlayer, value: number): RankingEntry {
  return {
    registrationId: p.registrationId,
    playerName: p.playerName,
    teamName: p.teamName,
    photoUrl: p.photoUrl,
    position: p.position,
    value,
  };
}

// Ranking por uma estatística (gols, assistências...) — exclui valor 0
export function buildStatRanking(
  stats: PublicPlayerStats[],
  players: PublicPlayer[],
  getValue: (s: PublicPlayerStats) => number,
  topN: number,
): RankingEntry[] {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  return stats
    .filter((s) => getValue(s) > 0 && byId.has(s.registrationId))
    .map((s) => toEntry(byId.get(s.registrationId)!, getValue(s)))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Ranking do Craque a partir dos totais de votos
export function buildVoteRanking(
  totals: Map<string, number>,
  players: PublicPlayer[],
  topN: number,
): RankingEntry[] {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  return [...totals.entries()]
    .filter(([id, pts]) => pts > 0 && byId.has(id))
    .map(([id, pts]) => toEntry(byId.get(id)!, pts))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Craque por posição: agrupa os totais de voto pela posição do jogador.
// Jogadores sem posição são omitidos; posições sem votados não aparecem.
export function groupRankingByPosition(
  totals: Map<string, number>,
  players: PublicPlayer[],
  topNPerPosition: number,
): Record<string, RankingEntry[]> {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  const grouped: Record<string, RankingEntry[]> = {};
  for (const [id, pts] of totals.entries()) {
    const p = byId.get(id);
    if (!p || !p.position || pts <= 0) continue;
    (grouped[p.position] ??= []).push(toEntry(p, pts));
  }
  for (const pos of Object.keys(grouped)) {
    grouped[pos].sort((a, b) => b.value - a.value);
    grouped[pos] = grouped[pos].slice(0, topNPerPosition);
  }
  return grouped;
}
