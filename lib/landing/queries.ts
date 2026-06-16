import { createClient } from "@/lib/supabase/server";

// ── Pure types ────────────────────────────────────────────────────────────────

export type TournamentType = "copa_do_mundo" | "champions_league";

export type RawPlayerStat = { registration_id: string; goals: number };
export type ChampionRow = {
  id: string;
  name: string;
  season: string | null;
  champion_name: string | null;
  tournament_type: TournamentType | null;
};

export type Champion = {
  id: string;
  name: string;
  season: string | null;
  championName: string | null;
  tournamentType: TournamentType | null;
};

export type AllTimeScorer = { playerName: string; totalGoals: number; photoUrl: string | null };

export type MostTitlesTeam = {
  teamName: string;
  titles: number;
  championsLeague: number;
  copaDomundo: number;
};

export type AggregateStats = {
  seasons: number;
  goals: number;
  players: number;
  copaDomundoEditions: number;
  championsLeagueEditions: number;
};

export type TopScorer = {
  playerName: string;
  teamName: string | null;
  photoUrl: string | null;
  goals: number;
};

export type PodiumEntry = { teamName: string; place: 1 | 2 | 3 };

// ── Pure transformers (exported for tests) ────────────────────────────────────

export function mapChampionRows(rows: ChampionRow[]): Champion[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    season: r.season,
    championName: r.champion_name,
    tournamentType: r.tournament_type,
  }));
}

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
      byName.set(p.player_name, { playerName: p.player_name, totalGoals: goals, photoUrl: p.photo_url });
    }
  }
  return Array.from(byName.values())
    .filter((s) => s.totalGoals > 0)
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 10);
}

export function aggregateMostTitlesByType(
  champions: Champion[],
  limit = 10,
): MostTitlesTeam[] {
  const byTeam = new Map<string, MostTitlesTeam>();
  for (const c of champions) {
    if (!c.championName) continue;
    const existing = byTeam.get(c.championName) ?? {
      teamName: c.championName,
      titles: 0,
      championsLeague: 0,
      copaDomundo: 0,
    };
    existing.titles += 1;
    if (c.tournamentType === "champions_league") existing.championsLeague += 1;
    if (c.tournamentType === "copa_do_mundo") existing.copaDomundo += 1;
    byTeam.set(c.championName, existing);
  }
  return Array.from(byTeam.values())
    .sort((a, b) => b.titles - a.titles)
    .slice(0, limit);
}

// ── Server queries ────────────────────────────────────────────────────────────

const CHAMPION_SELECT =
  "id, name, season, tournament_type, championship_teams!champion_team_id ( teams ( name ) )";

type ChampionSelectRow = {
  id: string;
  name: string;
  season: string | null;
  tournament_type: string | null;
  championship_teams:
    | { teams: { name: string } | { name: string }[] | null }
    | { teams: { name: string } | { name: string }[] | null }[]
    | null;
};

function rowToChampion(row: ChampionSelectRow): Champion {
  const ct = Array.isArray(row.championship_teams)
    ? row.championship_teams[0]
    : row.championship_teams;
  const team = ct ? (Array.isArray(ct.teams) ? ct.teams[0] : ct.teams) : null;
  return {
    id: row.id,
    name: row.name,
    season: row.season,
    championName: (team as { name: string } | null)?.name ?? null,
    tournamentType: (row.tournament_type as TournamentType | null) ?? null,
  };
}

export async function getAllChampionships(): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(CHAMPION_SELECT)
    .order("season", { ascending: false });
  return ((data ?? []) as unknown as ChampionSelectRow[]).map(rowToChampion);
}

export async function getChampionshipsByType(type: TournamentType): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(CHAMPION_SELECT)
    .eq("tournament_type", type)
    .order("season", { ascending: false });
  return ((data ?? []) as unknown as ChampionSelectRow[]).map(rowToChampion);
}

export async function getLatestChampionByType(): Promise<{
  copaDomundo: Champion | null;
  championsLeague: Champion | null;
}> {
  const supabase = await createClient();
  const [copaRes, clRes] = await Promise.all([
    supabase
      .from("championships")
      .select(CHAMPION_SELECT)
      .eq("tournament_type", "copa_do_mundo")
      .order("season", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("championships")
      .select(CHAMPION_SELECT)
      .eq("tournament_type", "champions_league")
      .order("season", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    copaDomundo: copaRes.data ? rowToChampion(copaRes.data as unknown as ChampionSelectRow) : null,
    championsLeague: clRes.data ? rowToChampion(clRes.data as unknown as ChampionSelectRow) : null,
  };
}

export async function getPodiumByChampionship(id: string): Promise<PodiumEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(`
      championship_teams!champion_team_id ( teams ( name ) ),
      runner_up:championship_teams!runner_up_team_id ( teams ( name ) ),
      third_place:championship_teams!third_place_team_id ( teams ( name ) )
    `)
    .eq("id", id)
    .maybeSingle();

  if (!data) return [];

  function extractName(
    rel: { teams: { name: string } | { name: string }[] | null } | null | undefined,
  ): string | null {
    if (!rel) return null;
    const t = Array.isArray(rel.teams) ? rel.teams[0] : rel.teams;
    return (t as { name: string } | null)?.name ?? null;
  }

  type PodiumRel = { teams: { name: string } | { name: string }[] | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyData = data as any;
  const first = extractName(anyData.championship_teams as PodiumRel);
  const second = extractName(anyData.runner_up as PodiumRel);
  const third = extractName(anyData.third_place as PodiumRel);

  const podium: PodiumEntry[] = [];
  if (first) podium.push({ teamName: first, place: 1 });
  if (second) podium.push({ teamName: second, place: 2 });
  if (third) podium.push({ teamName: third, place: 3 });
  return podium;
}

export async function getAggregateStats(): Promise<AggregateStats> {
  const supabase = await createClient();
  const [champRes, statsRes, copaRes, clRes] = await Promise.all([
    supabase.from("championships").select("id", { count: "exact", head: true }),
    supabase.from("public_player_stats").select("registration_id, goals"),
    supabase.from("championships").select("id", { count: "exact", head: true }).eq("tournament_type", "copa_do_mundo"),
    supabase.from("championships").select("id", { count: "exact", head: true }).eq("tournament_type", "champions_league"),
  ]);
  const statsRows = statsRes.data ?? [];
  return {
    seasons: champRes.count ?? 0,
    goals: statsRows.reduce((sum, r) => sum + (r.goals as number), 0),
    players: statsRows.length,
    copaDomundoEditions: copaRes.count ?? 0,
    championsLeagueEditions: clRes.count ?? 0,
  };
}

export async function getRecentChampions(limit = 4): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(CHAMPION_SELECT)
    .order("season", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as ChampionSelectRow[]).map(rowToChampion);
}

export async function getAllTimeTopScorers(): Promise<AllTimeScorer[]> {
  const supabase = await createClient();
  const [playersRes, statsRes] = await Promise.all([
    supabase.from("public_players").select("registration_id, player_name, photo_url"),
    supabase.from("public_player_stats").select("registration_id, goals"),
  ]);
  return aggregateAllTimeScorers(
    playersRes.data ?? [],
    (statsRes.data ?? []) as RawPlayerStat[],
  );
}

export async function getMostTitlesTeams(limit = 10): Promise<MostTitlesTeam[]> {
  const champions = await getAllChampionships();
  return aggregateMostTitlesByType(champions, limit);
}

export async function getLatestSeasonTopScorers(
  limit = 5,
): Promise<{ scorers: TopScorer[]; seasonName: string | null; tournamentType: TournamentType | null }> {
  const supabase = await createClient();
  const { data: champData } = await supabase
    .from("championships")
    .select("id, name, tournament_type")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!champData) return { scorers: [], seasonName: null, tournamentType: null };

  const [playersRes, statsRes] = await Promise.all([
    supabase
      .from("public_players")
      .select("registration_id, player_name, team_name, photo_url")
      .eq("championship_id", champData.id),
    supabase
      .from("public_player_stats")
      .select("registration_id, goals")
      .eq("championship_id", champData.id),
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

  return {
    scorers,
    seasonName: champData.name,
    tournamentType: (champData.tournament_type as TournamentType | null) ?? null,
  };
}
