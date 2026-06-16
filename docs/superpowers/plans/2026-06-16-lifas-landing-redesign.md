# LIFAS Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public LIFAS landing site with full-width layout, tournament-type split pages (/copa-do-mundo, /champions-league), sidebar edition selector, podium + prize strip, and a rebuilt Histórico page.

**Architecture:** Three new public routes replace the single /statistics page. Each tournament type (copa_do_mundo / champions_league) gets its own RSC page that fetches all editions server-side; a client TournamentPageShell manages selected edition state. The home page keeps the carousel and adds tournament entry cards + a wide numbers bar. DB gains a `tournament_type` column plus `runner_up_team_id` / `third_place_team_id` for podium data.

**Tech Stack:** Next.js App Router (RSC + client components), Supabase SSR, Tailwind CSS, Gala design tokens (`--gala-gold-1/2/3`, `--gala-panel`, `--gala-panel-2`, `--gala-line`, `--gala-ink`, `--gala-ink-dim`, `--gala-bg-0/1`), Vitest for query unit tests.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `supabase/migrations/20260619000000_tournament_type.sql` | Add `tournament_type`, `runner_up_team_id`, `third_place_team_id` to championships |
| `app/(landing)/copa-do-mundo/page.tsx` | RSC — Copa do Mundo page |
| `app/(landing)/champions-league/page.tsx` | RSC — Champions League page |
| `app/(landing)/statistics/page.tsx` | Redirect → /champions-league |
| `components/landing/HomeTournamentCards.tsx` | Two-column tournament entry cards for home page |
| `components/landing/HomeNumbersBar.tsx` | Full-width numbers strip |
| `components/landing/TournamentSidebar.tsx` | Sticky edition rail (sidebar) |
| `components/landing/PodiumBlock.tsx` | 1st/2nd/3rd podium + 5-prize strip |
| `components/landing/DisciplineTab.tsx` | Yellow/red card table (extracted from ChampionshipTabs) |
| `components/landing/TournamentTabs.tsx` | Tab bar + content switching for edition view |
| `components/landing/TournamentPageShell.tsx` | Client shell — manages selectedEditionId state |

### Modified files
| File | Change |
|---|---|
| `lib/landing/queries.ts` | Add `TournamentType`, updated `Champion`, new query functions |
| `lib/landing/queries.test.ts` | Tests for new pure functions |
| `app/(landing)/page.tsx` | Add HomeTournamentCards + HomeNumbersBar, keep carousel |
| `app/(landing)/historico/page.tsx` | Rebuild with wider layout + tournament type breakdown |
| `components/landing/LandingHeader.tsx` | New nav: Copa do Mundo, Champions League, Histórico |
| `components/landing/AllTimePanel.tsx` | Extend to accept tournament-type breakdown for mais títulos |
| `app/(protected)/championship/settings/page.tsx` | Add tournament_type selector + podium team fields |

### Deleted (Task 15)
`components/landing/StatisticsShell.tsx`, `components/landing/ChampionshipTabs.tsx`, `components/landing/SeasonStatsPanel.tsx`, `components/landing/StatsChips.tsx`

---

## Task 1: DB Migration — tournament_type + podium columns

**Files:**
- Create: `supabase/migrations/20260619000000_tournament_type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260619000000_tournament_type.sql

-- Tournament type classification
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS tournament_type text
  CHECK (tournament_type IN ('copa_do_mundo', 'champions_league'));

-- Podium positions (runner-up and third place)
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS runner_up_team_id uuid
  REFERENCES public.championship_teams(id) ON DELETE SET NULL;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS third_place_team_id uuid
  REFERENCES public.championship_teams(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
```

Expected: migration applies with no errors.

- [ ] **Step 3: Verify columns exist**

```bash
npx supabase db diff --schema public 2>/dev/null | grep tournament_type || echo "check supabase studio"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000000_tournament_type.sql
git commit -m "feat: add tournament_type and podium columns to championships"
```

---

## Task 2: Query Layer — new types and functions

**Files:**
- Modify: `lib/landing/queries.ts`
- Modify: `lib/landing/queries.test.ts`

- [ ] **Step 1: Write failing tests for new pure functions**

Add to `lib/landing/queries.test.ts`:

```typescript
describe("aggregateMostTitlesByType", () => {
  it("splits title counts by tournament_type", () => {
    const champions: import("./queries").Champion[] = [
      { id: "1", name: "CL 2026", season: "2026", championName: "Time A", tournamentType: "champions_league" },
      { id: "2", name: "CL 2024", season: "2024", championName: "Time A", tournamentType: "champions_league" },
      { id: "3", name: "Copa 2024", season: "2024", championName: "Time B", tournamentType: "copa_do_mundo" },
      { id: "4", name: "CL 2022", season: "2022", championName: "Time B", tournamentType: "champions_league" },
    ];
    const result = aggregateMostTitlesByType(champions, 3);
    expect(result[0]).toMatchObject({ teamName: "Time A", titles: 2, championsLeague: 2, copaDomundo: 0 });
    expect(result[1]).toMatchObject({ teamName: "Time B", titles: 2, championsLeague: 1, copaDomundo: 1 });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run lib/landing/queries.test.ts
```

Expected: FAIL — `aggregateMostTitlesByType` not found, `tournamentType` not on `Champion`.

- [ ] **Step 3: Update queries.ts with new types and functions**

Replace the entire `lib/landing/queries.ts` with:

```typescript
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

const CHAMPION_SELECT = `
  id, name, season,
  tournament_type,
  championship_teams!champion_team_id (
    teams ( name )
  )
`.trim();

function rowToChampion(row: {
  id: string;
  name: string;
  season: string | null;
  tournament_type: string | null;
  championship_teams:
    | { teams: { name: string } | { name: string }[] | null }
    | { teams: { name: string } | { name: string }[] | null }[]
    | null;
}): Champion {
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
  return (data ?? []).map(rowToChampion);
}

export async function getChampionshipsByType(type: TournamentType): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(CHAMPION_SELECT)
    .eq("tournament_type", type)
    .order("season", { ascending: false });
  return (data ?? []).map(rowToChampion);
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
    copaDomundo: copaRes.data ? rowToChampion(copaRes.data) : null,
    championsLeague: clRes.data ? rowToChampion(clRes.data) : null,
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

  const first = extractName(
    Array.isArray(data.championship_teams) ? data.championship_teams[0] : data.championship_teams,
  );
  const second = extractName(
    Array.isArray(data.runner_up) ? data.runner_up[0] : (data.runner_up as typeof data.championship_teams),
  );
  const third = extractName(
    Array.isArray(data.third_place) ? data.third_place[0] : (data.third_place as typeof data.championship_teams),
  );

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
  return (data ?? []).map(rowToChampion);
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/landing/queries.test.ts
```

Expected: all tests PASS (the existing tests still pass, the new `aggregateMostTitlesByType` test passes).

- [ ] **Step 5: Commit**

```bash
git add lib/landing/queries.ts lib/landing/queries.test.ts
git commit -m "feat: add tournament_type queries and aggregateMostTitlesByType"
```

---

## Task 3: Rebuild LandingHeader

**Files:**
- Modify: `components/landing/LandingHeader.tsx`

- [ ] **Step 1: Replace LandingHeader**

```tsx
// components/landing/LandingHeader.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface LandingHeaderProps {
  liveChampionshipId: string | null;
  onLoginClick: () => void;
}

const NAV_LINKS = [
  { href: "/copa-do-mundo", label: "Copa do Mundo" },
  { href: "/champions-league", label: "Champions League" },
  { href: "/historico", label: "Histórico" },
];

export default function LandingHeader({ liveChampionshipId, onLoginClick }: LandingHeaderProps) {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-8 py-3 md:px-14"
      style={{
        background: "rgba(5,5,7,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--gala-line)",
      }}
    >
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <span className="text-xl">⚽</span>
        <span
          className="font-serif font-extrabold tracking-widest text-base uppercase"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS
        </span>
      </Link>

      <nav className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-bold uppercase tracking-widest transition-colors"
              style={{ color: active ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
            >
              {link.label}
            </Link>
          );
        })}
        {liveChampionshipId && (
          <Link
            href={`/live/${liveChampionshipId}`}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            Ao Vivo
          </Link>
        )}
      </nav>

      <button
        onClick={onLoginClick}
        className="rounded-lg px-5 py-2 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90 shrink-0"
        style={{
          background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
        }}
      >
        Entrar
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/landing/LandingHeader.tsx
git commit -m "feat: rebuild LandingHeader with Copa/Champions/Histórico nav"
```

---

## Task 4: HomeNumbersBar + HomeTournamentCards

**Files:**
- Create: `components/landing/HomeNumbersBar.tsx`
- Create: `components/landing/HomeTournamentCards.tsx`

- [ ] **Step 1: Create HomeNumbersBar**

```tsx
// components/landing/HomeNumbersBar.tsx
import type { AggregateStats } from "@/lib/landing/queries";

interface HomeNumbersBarProps {
  stats: AggregateStats;
}

export default function HomeNumbersBar({ stats }: HomeNumbersBarProps) {
  const items = [
    { value: stats.seasons, label: "Temporadas" },
    { value: stats.goals, label: "Gols Marcados" },
    { value: stats.players, label: "Jogadores" },
  ];

  return (
    <div
      className="w-full py-10 px-8 md:px-14"
      style={{ background: "var(--gala-bg-1)", borderTop: "1px solid var(--gala-line)", borderBottom: "1px solid var(--gala-line)" }}
    >
      <div className="flex flex-wrap justify-center gap-12 md:gap-24">
        {items.map(({ value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span
              className="font-serif text-5xl font-extrabold tabular-nums"
              style={{
                background:
                  "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {value.toLocaleString("pt-BR")}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-ink-dim)]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create HomeTournamentCards**

```tsx
// components/landing/HomeTournamentCards.tsx
import Link from "next/link";
import type { Champion } from "@/lib/landing/queries";

interface HomeTournamentCardsProps {
  copaDomundo: Champion | null;
  championsLeague: Champion | null;
}

interface TournamentCardProps {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  latest: Champion | null;
  editionsCount?: number;
}

function TournamentCard({ href, icon, title, subtitle, latest }: TournamentCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex-1 min-w-0 rounded-2xl p-8 flex flex-col gap-4 transition-all hover:scale-[1.01]"
      style={{
        background: "linear-gradient(135deg, rgba(212,160,23,0.06), rgba(5,5,7,0.95))",
        border: "1px solid var(--gala-line)",
      }}
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          {icon} {subtitle}
        </p>
        <h2
          className="mt-2 font-serif text-3xl font-extrabold leading-tight group-hover:text-[var(--gala-gold-1)] transition-colors"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {title}
        </h2>
      </div>

      {latest ? (
        <div
          className="rounded-xl px-5 py-4 flex flex-col gap-1"
          style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
        >
          <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            Última edição · {latest.season ?? latest.name}
          </p>
          {latest.championName ? (
            <>
              <p className="text-lg font-black text-white">{latest.championName}</p>
              <p className="text-xs text-[var(--gala-ink-dim)]">🏆 Campeão</p>
            </>
          ) : (
            <p className="text-sm text-[var(--gala-ink-dim)]">Campeão a definir</p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl px-5 py-4"
          style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
        >
          <p className="text-sm text-[var(--gala-ink-dim)]">Nenhuma edição registrada ainda.</p>
        </div>
      )}

      <span className="text-xs font-bold tracking-widest text-[var(--gala-gold-2)] group-hover:text-[var(--gala-gold-1)] transition-colors">
        Ver campeonato →
      </span>
    </Link>
  );
}

export default function HomeTournamentCards({ copaDomundo, championsLeague }: HomeTournamentCardsProps) {
  return (
    <section className="w-full px-8 py-12 md:px-14">
      <div className="flex flex-col md:flex-row gap-6">
        <TournamentCard
          href="/copa-do-mundo"
          icon="🌍"
          subtitle="Copa do Mundo · Sorocaba"
          title="Copa do Mundo Sorocaba"
          latest={copaDomundo}
        />
        <TournamentCard
          href="/champions-league"
          icon="🏆"
          subtitle="Champions League · Sorocaba"
          title="Champions League Sorocaba"
          latest={championsLeague}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/landing/HomeNumbersBar.tsx components/landing/HomeTournamentCards.tsx
git commit -m "feat: HomeNumbersBar and HomeTournamentCards components"
```

---

## Task 5: Update Home Page (`/`)

**Files:**
- Modify: `app/(landing)/page.tsx`

- [ ] **Step 1: Update the home page RSC**

```tsx
// app/(landing)/page.tsx
import HeroCarousel from "@/components/landing/HeroCarousel";
import HomeNumbersBar from "@/components/landing/HomeNumbersBar";
import HomeTournamentCards from "@/components/landing/HomeTournamentCards";
import TopScorersPreview from "@/components/landing/TopScorersPreview";
import {
  getRecentChampions,
  getAggregateStats,
  getLatestSeasonTopScorers,
  getLatestChampionByType,
} from "@/lib/landing/queries";

export default async function LandingPage() {
  const [recentChampions, stats, { scorers, seasonName, tournamentType }, latest] =
    await Promise.all([
      getRecentChampions(4),
      getAggregateStats(),
      getLatestSeasonTopScorers(5),
      getLatestChampionByType(),
    ]);

  const statsHref =
    tournamentType === "copa_do_mundo" ? "/copa-do-mundo" : "/champions-league";

  return (
    <main>
      <HeroCarousel recentChampions={recentChampions} />
      <HomeTournamentCards
        copaDomundo={latest.copaDomundo}
        championsLeague={latest.championsLeague}
      />
      <HomeNumbersBar stats={stats} />
      <section className="px-8 py-12 md:px-14">
        <TopScorersPreview
          scorers={scorers}
          seasonName={seasonName}
          statsHref={statsHref}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Update TopScorersPreview to accept statsHref prop**

Modify `components/landing/TopScorersPreview.tsx` — change the hardcoded `/statistics` href to a prop:

```tsx
// At the top, update the interface:
interface TopScorersPreviewProps {
  scorers: TopScorer[];
  seasonName: string | null;
  statsHref?: string;  // add this
}

// In the component body, replace:
// href="/statistics"
// with:
// href={statsHref ?? "/champions-league"}
```

Find the `Link href="/statistics"` in the file and change it to `href={statsHref ?? "/champions-league"}`. Also update the function signature to destructure `statsHref`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/\(landing\)/page.tsx components/landing/TopScorersPreview.tsx
git commit -m "feat: update home page with tournament cards, numbers bar, and wider layout"
```

---

## Task 6: TournamentSidebar component

**Files:**
- Create: `components/landing/TournamentSidebar.tsx`

- [ ] **Step 1: Create TournamentSidebar**

```tsx
// components/landing/TournamentSidebar.tsx
"use client";

import type { Champion } from "@/lib/landing/queries";

interface TournamentSidebarProps {
  title: string;
  editions: Champion[];
  selectedId: string | null;          // null = "Todos"
  onSelect: (id: string | null) => void;
}

export default function TournamentSidebar({
  title,
  editions,
  selectedId,
  onSelect,
}: TournamentSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-[53px] self-start overflow-y-auto"
        style={{
          width: "22%",
          maxHeight: "calc(100vh - 53px)",
          background: "var(--gala-bg-1)",
          borderRight: "1px solid var(--gala-line)",
        }}
      >
        <div className="px-5 pt-6 pb-2">
          <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            {title}
          </p>
        </div>

        <nav className="flex flex-col pb-6">
          <SidebarRow
            label="Todos os anos"
            sublabel={`${editions.length} edições`}
            active={selectedId === null}
            onClick={() => onSelect(null)}
          />
          {editions.map((c) => (
            <SidebarRow
              key={c.id}
              label={c.season ?? c.name}
              sublabel={c.championName ?? "Campeão a definir"}
              active={selectedId === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </nav>
      </aside>

      {/* Mobile chip row */}
      <div
        className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 shrink-0 sticky top-[53px] z-40"
        style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}
      >
        <ChipButton label="Todos" active={selectedId === null} onClick={() => onSelect(null)} />
        {editions.map((c) => (
          <ChipButton
            key={c.id}
            label={c.season ?? c.name}
            active={selectedId === c.id}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </>
  );
}

function SidebarRow({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-3 transition-colors"
      style={
        active
          ? {
              background: "rgba(212,160,23,0.08)",
              borderLeft: "3px solid var(--gala-gold-2)",
            }
          : {
              borderLeft: "3px solid transparent",
            }
      }
    >
      <p
        className="text-sm font-bold"
        style={{ color: active ? "var(--gala-gold-1)" : "var(--gala-ink)" }}
      >
        {label}
      </p>
      <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">{sublabel}</p>
    </button>
  );
}

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap"
      style={
        active
          ? {
              background: "rgba(212,160,23,0.12)",
              border: "1px solid var(--gala-gold-2)",
              color: "var(--gala-gold-2)",
            }
          : {
              background: "var(--gala-panel)",
              border: "1px solid var(--gala-line)",
              color: "var(--gala-ink-dim)",
            }
      }
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/TournamentSidebar.tsx
git commit -m "feat: TournamentSidebar with sticky edition rail and mobile chip row"
```

---

## Task 7: PodiumBlock component

**Files:**
- Create: `components/landing/PodiumBlock.tsx`

- [ ] **Step 1: Create PodiumBlock**

```tsx
// components/landing/PodiumBlock.tsx
import type { PodiumEntry } from "@/lib/landing/queries";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

interface PodiumBlockProps {
  championshipName: string;
  podium: PodiumEntry[];
  rankings: PublicRankings;
  isAllEditions: boolean;  // true = "Todos" selected → hide podium, show all-time records in prizes
}

const PLACE_CONFIG = {
  1: { height: "h-28", border: "2px solid var(--gala-gold-2)", bg: "linear-gradient(135deg, rgba(212,160,23,0.15), rgba(5,5,7,0.95))", shadow: "0 0 24px rgba(212,160,23,0.2)", label: "🏆 Campeão", labelColor: "var(--gala-gold-1)" },
  2: { height: "h-20", border: "1px solid var(--gala-line)", bg: "var(--gala-bg-1)", shadow: undefined, label: "🥈 2º Lugar", labelColor: "var(--gala-ink-dim)" },
  3: { height: "h-16", border: "1px solid var(--gala-line)", bg: "var(--gala-bg-1)", shadow: undefined, label: "🥉 3º Lugar", labelColor: "var(--gala-ink-dim)" },
} as const;

export default function PodiumBlock({
  championshipName,
  podium,
  rankings,
  isAllEditions,
}: PodiumBlockProps) {
  const first = podium.find((p) => p.place === 1);
  const second = podium.find((p) => p.place === 2);
  const third = podium.find((p) => p.place === 3);

  const artilheiro = rankings.topScorers[0] ?? null;
  const maestro = rankings.topAssists[0] ?? null;
  const craque = rankings.craque[0] ?? null;
  const goleiro = rankings.goalkeepers[0] ?? null;
  const revelacao = rankings.revelations[0] ?? null;

  const prizes = [
    { label: "Artilheiro", player: artilheiro, detail: artilheiro ? `${artilheiro.value} ⚽` : null },
    { label: "Maestro", player: maestro, detail: maestro ? `${maestro.value} 🎯` : null },
    { label: "Melhor Jogador", player: craque, detail: null },
    { label: "Melhor Goleiro", player: goleiro, detail: goleiro?.detail ?? null },
    { label: "Revelação", player: revelacao, detail: null },
  ];

  return (
    <div
      className="w-full px-8 py-8 md:px-10"
      style={{ borderBottom: "1px solid var(--gala-line)" }}
    >
      <p className="mb-6 text-[9px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
        {championshipName}
      </p>

      {/* Podium — only when a specific edition is selected */}
      {!isAllEditions && (
        <div className="mb-8 flex items-end justify-center gap-4">
          {/* 2nd */}
          {second ? (
            <PodiumCard place={2} teamName={second.teamName} />
          ) : (
            <div className="w-36" />
          )}
          {/* 1st */}
          {first ? (
            <PodiumCard place={1} teamName={first.teamName} />
          ) : (
            <div className="w-44 h-28 rounded-xl flex items-center justify-center" style={{ border: "2px dashed var(--gala-line)" }}>
              <p className="text-xs text-[var(--gala-ink-dim)]">A definir</p>
            </div>
          )}
          {/* 3rd */}
          {third ? (
            <PodiumCard place={3} teamName={third.teamName} />
          ) : (
            <div className="w-32" />
          )}
        </div>
      )}

      {/* Prize strip — always visible */}
      <div className="flex flex-wrap gap-3">
        {prizes.map(({ label, player, detail }) => (
          <div
            key={label}
            className="flex-1 min-w-[140px] rounded-xl p-4 flex flex-col gap-2"
            style={{
              background: "rgba(212,160,23,0.06)",
              border: "1px solid rgba(212,160,23,0.15)",
            }}
          >
            <p className="text-[8px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">
              {label}
            </p>
            {player ? (
              <div className="flex items-center gap-2">
                <PlayerAvatar
                  photoUrl={player.photoUrl ?? null}
                  name={player.playerName}
                  sizeClass="h-8 w-8"
                  textSizeClass="text-[9px]"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{player.playerName}</p>
                  {detail && (
                    <p className="text-[10px] text-[var(--gala-gold-2)] font-black">{detail}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--gala-ink-dim)]">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PodiumCard({ place, teamName }: { place: 1 | 2 | 3; teamName: string }) {
  const cfg = PLACE_CONFIG[place];
  const widthClass = place === 1 ? "w-44" : place === 2 ? "w-36" : "w-32";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${widthClass} ${cfg.height} rounded-xl flex items-center justify-center px-3`}
        style={{ background: cfg.bg, border: cfg.border, boxShadow: cfg.shadow }}
      >
        <p
          className="text-center font-black text-sm leading-tight"
          style={{ color: place === 1 ? "var(--gala-gold-1)" : "var(--gala-ink)" }}
        >
          {teamName}
        </p>
      </div>
      <p className="text-[9px] font-black uppercase tracking-[1px]" style={{ color: cfg.labelColor }}>
        {cfg.label}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/PodiumBlock.tsx
git commit -m "feat: PodiumBlock with 1st/2nd/3rd podium and 5-prize strip"
```

---

## Task 8: DisciplineTab + TournamentTabs + TournamentPageShell

**Files:**
- Create: `components/landing/DisciplineTab.tsx`
- Create: `components/landing/TournamentTabs.tsx`
- Create: `components/landing/TournamentPageShell.tsx`

- [ ] **Step 1: Create DisciplineTab (extracted from ChampionshipTabs)**

```tsx
// components/landing/DisciplineTab.tsx
"use client";

import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

export default function DisciplineTab({ rankings }: { rankings: PublicRankings }) {
  const playerMap = new Map(rankings.players.map((p) => [p.registrationId, p]));
  const byCards = [...rankings.stats]
    .filter((s) => s.yellowCards > 0 || s.redCards > 0)
    .sort((a, b) => b.yellowCards + b.redCards * 2 - (a.yellowCards + a.redCards * 2));

  if (byCards.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--gala-ink-dim)]">
        Nenhum dado de disciplina ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {byCards.slice(0, 25).map((s) => {
        const p = playerMap.get(s.registrationId);
        return (
          <div
            key={s.registrationId}
            className="flex items-center gap-3 rounded-xl border border-[var(--gala-line)] px-5 py-3"
            style={{ background: "var(--gala-bg-1)" }}
          >
            <PlayerAvatar
              photoUrl={p?.photoUrl ?? null}
              name={p?.playerName ?? "?"}
              sizeClass="h-8 w-8"
              textSizeClass="text-[9px]"
            />
            <span className="flex-1 text-sm font-bold text-white">{p?.playerName ?? "Desconhecido"}</span>
            <span className="text-[10px] text-[var(--gala-ink-dim)]">{p?.teamName}</span>
            <span className="flex items-center gap-1">
              {s.yellowCards > 0 && (
                <span className="rounded px-2 py-0.5 text-[10px] font-black" style={{ background: "#ca8a04", color: "#050507" }}>
                  {s.yellowCards} 🟨
                </span>
              )}
              {s.redCards > 0 && (
                <span className="rounded px-2 py-0.5 text-[10px] font-black" style={{ background: "#dc2626", color: "white" }}>
                  {s.redCards} 🟥
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create TournamentTabs**

```tsx
// components/landing/TournamentTabs.tsx
"use client";

import { useState } from "react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import FilteredRankingsTab from "@/components/landing/FilteredRankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import BracketSection from "@/components/landing/BracketSection";
import PremiosTab from "@/components/landing/PremiosTab";
import DisciplineTab from "@/components/landing/DisciplineTab";

type TabId = "classificacao" | "artilheiros" | "disciplina" | "bracket" | "premios";

const TABS: { id: TabId; label: string }[] = [
  { id: "classificacao", label: "🗂️ Classificação" },
  { id: "artilheiros", label: "📊 Artilheiros" },
  { id: "disciplina", label: "🟨 Disciplina" },
  { id: "bracket", label: "🗓️ Bracket" },
  { id: "premios", label: "🏅 Prêmios" },
];

interface TournamentTabsProps {
  championshipId: string;
  rankings: PublicRankings;
  loading: boolean;
}

export default function TournamentTabs({ championshipId, rankings, loading }: TournamentTabsProps) {
  const [tab, setTab] = useState<TabId>("classificacao");

  return (
    <div className="flex flex-col">
      {/* Sticky tab bar */}
      <nav
        className="sticky z-30 flex overflow-x-auto px-6 md:px-10 border-b border-[var(--gala-line)]"
        style={{ background: "rgba(5,5,7,0.92)", backdropFilter: "blur(12px)", top: "53px" }}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="shrink-0 px-5 py-4 text-[11px] font-black uppercase tracking-wide transition-colors"
            style={
              tab === t.id
                ? { color: "var(--gala-gold-1)", borderBottom: "2px solid var(--gala-gold-2)" }
                : { color: "var(--gala-ink-dim)", borderBottom: "2px solid transparent" }
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="px-6 py-8 md:px-10">
        {loading && rankings.players.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-[var(--gala-bg-1)]" />
            ))}
          </div>
        ) : tab === "classificacao" ? (
          <StandingsTab championshipId={championshipId} />
        ) : tab === "artilheiros" ? (
          <FilteredRankingsTab rankings={rankings} />
        ) : tab === "disciplina" ? (
          <DisciplineTab rankings={rankings} />
        ) : tab === "bracket" ? (
          <BracketSection championshipId={championshipId} />
        ) : (
          <PremiosTab rankings={rankings} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TournamentPageShell**

```tsx
// components/landing/TournamentPageShell.tsx
"use client";

import { useState } from "react";
import type { Champion, PodiumEntry } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import TournamentSidebar from "@/components/landing/TournamentSidebar";
import PodiumBlock from "@/components/landing/PodiumBlock";
import TournamentTabs from "@/components/landing/TournamentTabs";

interface TournamentPageShellProps {
  tournamentTitle: string;          // e.g. "Champions League Sorocaba"
  editions: Champion[];             // all editions of this tournament type, newest first
  initialPodium: PodiumEntry[];     // podium for the most recent edition (pre-fetched)
}

export default function TournamentPageShell({
  tournamentTitle,
  editions,
  initialPodium,
}: TournamentPageShellProps) {
  // null = "Todos os anos" view; string = specific edition id
  const [selectedId, setSelectedId] = useState<string | null>(
    editions[0]?.id ?? null,
  );

  const isAllEditions = selectedId === null;
  const selectedEdition = editions.find((e) => e.id === selectedId) ?? null;

  const { rankings, loading } = usePublicRankings(selectedId, 5);

  const podium = isAllEditions ? [] : initialPodium;

  const blockTitle = isAllEditions
    ? `${tournamentTitle} · Todos os anos`
    : selectedEdition
    ? `${selectedEdition.name}${selectedEdition.season ? ` · ${selectedEdition.season}` : ""}`
    : tournamentTitle;

  return (
    <div className="flex min-h-screen">
      <TournamentSidebar
        title={tournamentTitle}
        editions={editions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        <PodiumBlock
          championshipName={blockTitle}
          podium={podium}
          rankings={rankings}
          isAllEditions={isAllEditions}
        />

        {!isAllEditions && selectedId && (
          <TournamentTabs
            championshipId={selectedId}
            rankings={rankings}
            loading={loading}
          />
        )}

        {isAllEditions && (
          <div className="px-6 py-10 md:px-10">
            <p className="text-sm text-[var(--gala-ink-dim)]">
              Selecione uma edição na barra lateral para ver classificação, artilheiros, bracket e prêmios.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/landing/DisciplineTab.tsx components/landing/TournamentTabs.tsx components/landing/TournamentPageShell.tsx
git commit -m "feat: DisciplineTab, TournamentTabs, TournamentPageShell"
```

---

## Task 9: Copa do Mundo page + Champions League page

**Files:**
- Create: `app/(landing)/copa-do-mundo/page.tsx`
- Create: `app/(landing)/champions-league/page.tsx`

- [ ] **Step 1: Create Copa do Mundo page**

```tsx
// app/(landing)/copa-do-mundo/page.tsx
import TournamentPageShell from "@/components/landing/TournamentPageShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function CopaDomundoPage() {
  const editions = await getChampionshipsByType("copa_do_mundo");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <TournamentPageShell
      tournamentTitle="Copa do Mundo Sorocaba"
      editions={editions}
      initialPodium={initialPodium}
    />
  );
}
```

- [ ] **Step 2: Create Champions League page**

```tsx
// app/(landing)/champions-league/page.tsx
import TournamentPageShell from "@/components/landing/TournamentPageShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function ChampionsLeaguePage() {
  const editions = await getChampionshipsByType("champions_league");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <TournamentPageShell
      tournamentTitle="Champions League Sorocaba"
      editions={editions}
      initialPodium={initialPodium}
    />
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```

Expected: build succeeds, two new static routes generated.

- [ ] **Step 4: Commit**

```bash
git add "app/(landing)/copa-do-mundo/page.tsx" "app/(landing)/champions-league/page.tsx"
git commit -m "feat: Copa do Mundo and Champions League tournament pages"
```

---

## Task 10: Redirect /statistics → /champions-league

**Files:**
- Modify: `app/(landing)/statistics/page.tsx`

- [ ] **Step 1: Replace page with redirect**

```tsx
// app/(landing)/statistics/page.tsx
import { redirect } from "next/navigation";

export default function StatisticsPage() {
  redirect("/champions-league");
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(landing)/statistics/page.tsx"
git commit -m "feat: redirect /statistics to /champions-league"
```

---

## Task 11: Rebuild Histórico page

**Files:**
- Modify: `app/(landing)/historico/page.tsx`
- Modify: `components/landing/AllTimePanel.tsx`

- [ ] **Step 1: Update AllTimePanel to accept MostTitlesTeam with breakdown**

`MostTitlesTeam` now has `championsLeague` and `copaDomundo` fields. Update `AllTimePanel.tsx` — in the "Mais Títulos" section, add two small badge columns after the title count:

In `components/landing/AllTimePanel.tsx`, find the `mostTitlesTeams.map(...)` list and change it to:

```tsx
{mostTitlesTeams.map((team, i) => (
  <li key={team.teamName} className="flex items-center gap-3">
    <span className="w-5 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
    <span className="flex-1 text-sm font-bold text-white">{team.teamName}</span>
    <span className="flex items-center gap-2 text-xs font-black text-[var(--gala-gold-2)]">
      {team.titles}× 🏆
    </span>
    <span className="flex gap-1">
      {team.championsLeague > 0 && (
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.2)", color: "var(--gala-gold-2)" }}>
          CL {team.championsLeague}×
        </span>
      )}
      {team.copaDomundo > 0 && (
        <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
          CM {team.copaDomundo}×
        </span>
      )}
    </span>
  </li>
))}
```

- [ ] **Step 2: Update hallOfChampions in AllTimePanel to show tournament badge**

Find the hallOfChampions `<li>` in `AllTimePanel.tsx` and add a tournament badge after the season:

```tsx
{hallOfChampions.map((c) => (
  <li
    key={c.id}
    className="flex items-center gap-3 rounded-xl px-4 py-2.5"
    style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
  >
    <span className="text-xs font-black text-[var(--gala-gold-2)] w-10 shrink-0">
      {c.season ?? "—"}
    </span>
    {c.tournamentType && (
      <span className="text-[8px] font-black rounded px-1.5 py-0.5 shrink-0"
        style={
          c.tournamentType === "champions_league"
            ? { background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.2)", color: "var(--gala-gold-2)" }
            : { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }
        }
      >
        {c.tournamentType === "champions_league" ? "🏆 CL" : "🌍 CM"}
      </span>
    )}
    <span className="flex-1 truncate text-sm font-bold text-white">
      {c.championName ?? <span className="font-normal text-[var(--gala-ink-dim)]">A definir</span>}
    </span>
  </li>
))}
```

Also update the `AllTimePanelProps` interface to use `Champion` from `@/lib/landing/queries` (it already does via `hallOfChampions: Champion[]`). No import change needed.

- [ ] **Step 3: Rebuild historico page**

```tsx
// app/(landing)/historico/page.tsx
import AllTimePanel from "@/components/landing/AllTimePanel";
import {
  getAllChampionships,
  getAggregateStats,
  getAllTimeTopScorers,
  getMostTitlesTeams,
} from "@/lib/landing/queries";

export default async function HistoricoPage() {
  const [championships, aggregateStats, topScorers, mostTitlesTeams] = await Promise.all([
    getAllChampionships(),
    getAggregateStats(),
    getAllTimeTopScorers(),
    getMostTitlesTeams(10),
  ]);

  return (
    <main className="w-full px-8 py-12 md:px-14">
      {/* Header */}
      <header className="mb-10">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Liga de Futebol Adventista de Sorocaba ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-4xl font-extrabold sm:text-5xl"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Histórico LIFAS
        </h1>
        <p className="mt-1 text-sm text-[var(--gala-ink-dim)]">
          Todos os tempos · ambos os torneios
        </p>
      </header>

      {/* Extended numbers bar */}
      <div className="mb-10 flex flex-wrap gap-8">
        {[
          { value: aggregateStats.seasons, label: "Temporadas" },
          { value: aggregateStats.goals, label: "Gols Totais" },
          { value: aggregateStats.players, label: "Jogadores" },
          { value: aggregateStats.copaDomundoEditions, label: "Edições Copa" },
          { value: aggregateStats.championsLeagueEditions, label: "Edições Champions" },
        ].map(({ value, label }) => (
          <div key={label} className="flex flex-col">
            <span
              className="font-serif text-4xl font-extrabold tabular-nums"
              style={{
                background:
                  "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {value}
            </span>
            <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-ink-dim)]">
              {label}
            </span>
          </div>
        ))}
      </div>

      <AllTimePanel
        aggregateStats={aggregateStats}
        topScorers={topScorers}
        mostTitlesTeams={mostTitlesTeams}
        hallOfChampions={championships}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "app/(landing)/historico/page.tsx" components/landing/AllTimePanel.tsx
git commit -m "feat: rebuild Histórico page with tournament type breakdown"
```

---

## Task 12: Admin settings — tournament_type selector

**Files:**
- Modify: `app/(protected)/championship/settings/page.tsx`

- [ ] **Step 1: Add tournament type save function and UI**

Open `app/(protected)/championship/settings/page.tsx`. After the existing `handleSaveGlobal` function, add:

```tsx
async function handleSaveTournamentType(type: string) {
  if (!championship?.id) return;
  const { error } = await supabase
    .from("championships")
    .update({ tournament_type: type || null })
    .eq("id", championship.id);
  if (error) toast.error("Erro ao salvar tipo de torneio");
  else toast.success("Tipo de torneio salvo");
}
```

Then in the JSX, add a new settings section after the existing global settings section. Find the closing `</div>` of the settings form and add before it:

```tsx
{/* Tournament type */}
<section className="rounded-xl border border-[var(--gala-line)] bg-[var(--gala-panel)] p-5">
  <h3 className="mb-4 flex items-center gap-2 text-sm font-black">
    <Trophy className="h-4 w-4 text-[var(--gala-gold-2)]" />
    Tipo de Torneio
  </h3>
  <p className="mb-4 text-xs text-[var(--gala-ink-dim)]">
    Classifica este campeonato para as páginas públicas (Copa do Mundo ou Champions League).
  </p>
  <select
    className="w-full rounded-lg border border-[var(--gala-line)] bg-[var(--gala-bg-0)] px-3 py-2 text-sm"
    defaultValue={championship?.tournament_type ?? ""}
    onChange={async (e) => { await handleSaveTournamentType(e.target.value); }}
  >
    <option value="">— Sem classificação —</option>
    <option value="champions_league">🏆 Champions League Sorocaba</option>
    <option value="copa_do_mundo">🌍 Copa do Mundo Sorocaba</option>
  </select>
</section>
```

Note: `championship?.tournament_type` requires the `useChampionship()` hook to return the new column. The column is now in the DB, but the hook may need to be checked to ensure it selects `tournament_type`. If it uses `select("*")`, the new column is included automatically.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/championship/settings/page.tsx"
git commit -m "feat: add tournament type selector to admin championship settings"
```

---

## Task 13: Cleanup unused components

**Files:**
- Delete: `components/landing/StatisticsShell.tsx`
- Delete: `components/landing/ChampionshipTabs.tsx`
- Delete: `components/landing/SeasonStatsPanel.tsx`
- Delete: `components/landing/StatsChips.tsx`

- [ ] **Step 1: Delete obsolete components**

```bash
rm components/landing/StatisticsShell.tsx
rm components/landing/ChampionshipTabs.tsx
rm components/landing/SeasonStatsPanel.tsx
rm components/landing/StatsChips.tsx
```

- [ ] **Step 2: Verify build is clean**

```bash
npx tsc --noEmit && npx next build 2>&1 | tail -20
```

Expected: build succeeds with no references to deleted files.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete landing components (StatisticsShell, ChampionshipTabs, SeasonStatsPanel, StatsChips)"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| `tournament_type` DB column | Task 1 |
| `runner_up_team_id`, `third_place_team_id` | Task 1 |
| New query functions (`getChampionshipsByType`, `getLatestChampionByType`, `getPodiumByChampionship`) | Task 2 |
| `aggregateMostTitlesByType` with breakdown | Task 2 + tests |
| Updated `AggregateStats` (copaDomundoEditions, championsLeagueEditions) | Task 2 |
| LandingHeader with Copa/Champions/Histórico nav | Task 3 |
| HomeNumbersBar full-width | Task 4 |
| HomeTournamentCards two-column | Task 4 |
| Home page updated with all sections | Task 5 |
| TopScorersPreview links to correct tournament page | Task 5 |
| TournamentSidebar sticky rail + mobile chips | Task 6 |
| PodiumBlock with 1st/2nd/3rd + 5-prize strip (Artilheiro, Maestro, Melhor Jogador, Melhor Goleiro, Revelação) | Task 7 |
| DisciplineTab extracted | Task 8 |
| TournamentTabs sticky tab bar | Task 8 |
| TournamentPageShell managing selectedId | Task 8 |
| `/copa-do-mundo` RSC page | Task 9 |
| `/champions-league` RSC page | Task 9 |
| `/statistics` redirect | Task 10 |
| Histórico page with extended numbers bar + tournament type badges | Task 11 |
| AllTimePanel "Mais Títulos" shows CL/CM breakdown | Task 11 |
| Hall dos Campeões shows tournament type badge | Task 11 |
| Admin settings tournament_type selector | Task 12 |
| Cleanup old components | Task 13 |
