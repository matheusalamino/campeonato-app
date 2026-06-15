import { createClient } from "@/lib/supabase/server";

// --- Pure data types (exported for tests) ---

export type RawPlayerStat = { registration_id: string; goals: number };
export type ChampionRow = {
  id: string;
  name: string;
  season: string | null;
  champion_name: string | null;
};

// --- Pure data transformers (exported for tests) ---

export type AllTimeScorer = { playerName: string; totalGoals: number; photoUrl: string | null };

export function aggregateAllTimeScorers(
  players: { registration_id: string; player_name: string; photo_url: string | null }[],
  stats: RawPlayerStat[],
): AllTimeScorer[] {
  const statsByReg = new Map(stats.map((s) => [s.registration_id, s.goals]));
  const byName = new Map<string, AllTimeScorer>();

  for (const p of players) {
    const goals = statsByReg.get(p.registration_id) ?? 0;
    const existing = byName.get(p.player_name);
    if (existing) {
      existing.totalGoals += goals;
    } else {
      byName.set(p.player_name, {
        playerName: p.player_name,
        totalGoals: goals,
        photoUrl: p.photo_url,
      });
    }
  }

  return Array.from(byName.values())
    .filter((s) => s.totalGoals > 0)
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 10);
}

export type Champion = { id: string; name: string; season: string | null; championName: string | null };

export function mapChampionRows(rows: ChampionRow[]): Champion[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    season: r.season,
    championName: r.champion_name,
  }));
}

// --- Server query functions ---

export type AggregateStats = {
  seasons: number;
  goals: number;
  players: number;
};

export async function getAggregateStats(): Promise<AggregateStats> {
  const supabase = await createClient();
  const [champRes, statsRes] = await Promise.all([
    supabase.from("championships").select("id", { count: "exact", head: true }),
    supabase.from("public_player_stats").select("registration_id, goals"),
  ]);

  const seasons = champRes.count ?? 0;
  const statsRows = statsRes.data ?? [];
  const goals = statsRows.reduce((sum, r) => sum + (r.goals as number), 0);
  const players = statsRows.length;

  return { seasons, goals, players };
}

export async function getRecentChampions(limit = 4): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(
      `id, name, season,
      championship_teams!champion_team_id (
        teams ( name )
      )`,
    )
    .order("season", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row) => {
    const ct = Array.isArray(row.championship_teams) ? row.championship_teams[0] : row.championship_teams;
    const team = ct ? (Array.isArray(ct.teams) ? ct.teams[0] : ct.teams) : null;
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      championName: (team as { name: string } | null)?.name ?? null,
    };
  });
}

export type TopScorer = {
  playerName: string;
  teamName: string | null;
  photoUrl: string | null;
  goals: number;
};

export async function getLatestSeasonTopScorers(limit = 5): Promise<{ scorers: TopScorer[]; seasonName: string | null }> {
  const supabase = await createClient();
  const { data: champData } = await supabase
    .from("championships")
    .select("id, name")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!champData) return { scorers: [], seasonName: null };

  const [playersRes, statsRes] = await Promise.all([
    supabase.from("public_players").select("registration_id, player_name, team_name, photo_url").eq("championship_id", champData.id),
    supabase.from("public_player_stats").select("registration_id, goals").eq("championship_id", champData.id),
  ]);

  const players = playersRes.data ?? [];
  const stats = statsRes.data ?? [];
  const statsByReg = new Map(stats.map((s) => [s.registration_id, s.goals as number]));
  const playerMap = new Map(players.map((p) => [p.registration_id, p]));

  const scorers: TopScorer[] = stats
    .filter((s) => (s.goals as number) > 0)
    .sort((a, b) => (b.goals as number) - (a.goals as number))
    .slice(0, limit)
    .map((s) => {
      const p = playerMap.get(s.registration_id);
      return {
        playerName: p?.player_name ?? "Unknown",
        teamName: p?.team_name ?? null,
        photoUrl: p?.photo_url ?? null,
        goals: statsByReg.get(s.registration_id) ?? 0,
      };
    });

  return { scorers, seasonName: champData.name };
}

export async function getAllChampionships(): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(
      `id, name, season,
      championship_teams!champion_team_id (
        teams ( name )
      )`,
    )
    .order("season", { ascending: false });

  if (!data) return [];

  return data.map((row) => {
    const ct = Array.isArray(row.championship_teams) ? row.championship_teams[0] : row.championship_teams;
    const team = ct ? (Array.isArray(ct.teams) ? ct.teams[0] : ct.teams) : null;
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      championName: (team as { name: string } | null)?.name ?? null,
    };
  });
}

export async function getAllTimeTopScorers(): Promise<AllTimeScorer[]> {
  const supabase = await createClient();
  const [playersRes, statsRes] = await Promise.all([
    supabase.from("public_players").select("registration_id, player_name, photo_url"),
    supabase.from("public_player_stats").select("registration_id, goals"),
  ]);
  return aggregateAllTimeScorers(playersRes.data ?? [], (statsRes.data ?? []) as RawPlayerStat[]);
}

export type MostTitlesTeam = { teamName: string; titles: number };

export async function getMostTitlesTeams(limit = 5): Promise<MostTitlesTeam[]> {
  const champions = await getAllChampionships();
  const byTeam = new Map<string, number>();
  for (const c of champions) {
    if (!c.championName) continue;
    byTeam.set(c.championName, (byTeam.get(c.championName) ?? 0) + 1);
  }
  return Array.from(byTeam.entries())
    .map(([teamName, titles]) => ({ teamName, titles }))
    .sort((a, b) => b.titles - a.titles)
    .slice(0, limit);
}
