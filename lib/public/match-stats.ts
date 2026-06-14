// Funções puras de ranking — alimentadas pelos hooks públicos
import type { PublicPlayer, PublicPlayerStats, RankingEntry } from "./types";

export type VoteRow = { registration_id: string; points: number };

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

// Uma linha por voto de melhor cartola (vinda da view public_best_manager_votes)
export type ManagerVoteRow = {
  championship_team_id: string;
  team_name: string | null;
  manager_name: string | null;
  manager_photo: string | null;
  points: number;
};

// Ranking de Melhor Cartola: soma pontos por time e monta o pódio.
// O cartola não tem registration_id — usamos championship_team_id como chave.
export function buildManagerRanking(rows: ManagerVoteRow[], topN: number): RankingEntry[] {
  const byTeam = new Map<string, { row: ManagerVoteRow; total: number }>();
  for (const r of rows) {
    const existing = byTeam.get(r.championship_team_id);
    if (existing) existing.total += r.points;
    else byTeam.set(r.championship_team_id, { row: r, total: r.points });
  }
  return [...byTeam.values()]
    .filter(({ total }) => total > 0)
    .map(({ row, total }) => ({
      registrationId: row.championship_team_id,
      playerName: row.manager_name ?? "—",
      teamName: row.team_name,
      photoUrl: row.manager_photo,
      position: null,
      value: total,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}
