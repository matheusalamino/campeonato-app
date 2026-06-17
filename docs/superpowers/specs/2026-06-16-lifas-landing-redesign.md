# LIFAS Landing Page Redesign

**Date:** 2026-06-16  
**Branch:** feat/lifas-public-landing  
**Status:** Approved for implementation

---

## Overview

Complete redesign of the LIFAS public landing site. The current site uses a narrow max-width layout with all stats grouped under a single `/statistics` page. The new design is full-width (no max-width), split across dedicated tournament-type pages, and presents a much larger and bolder visual experience.

---

## Site Structure

### Routes

| Route | Description |
|---|---|
| `/` | Home — hero + tournament cards + numbers bar + artilheiros preview |
| `/copa-do-mundo` | Copa do Mundo Sorocaba — all editions with sidebar selector |
| `/champions-league` | Champions League Sorocaba — all editions with sidebar selector |
| `/historico` | All-time records across both tournament types |
| `/live/[id]` | Live match view (existing, unchanged) |

### Navigation Header (sticky, full-width)

```
⚽ LIFAS  |  Copa do Mundo  Champions League  Histórico  [● Ao Vivo]  [Entrar]
```

- "Ao Vivo" only appears when a match has `status = 'IN_PROGRESS'` in `knockout_matches` (existing gate logic kept)
- "Entrar" opens the login modal (existing)
- `/statistics` redirects to `/champions-league`

---

## Database Migration

The `championships` table requires a new `tournament_type` column to power the Copa do Mundo vs Champions League split.

```sql
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS tournament_type text
  CHECK (tournament_type IN ('copa_do_mundo', 'champions_league'));
```

- Existing championships must be updated manually via the admin panel or a one-time data migration
- The admin championship settings page gets a required selector: "Tipo de Torneio" (Copa do Mundo Sorocaba | Champions League Sorocaba)
- Championships without a `tournament_type` are excluded from the public tournament pages but still appear in Histórico

---

## Layout System

**Full width — no `max-width` container.** All sections use percentage-based columns or CSS grid with viewport-relative sizing. Content fills every pixel at any screen width.

**Color system:** Unchanged — Gala design tokens (`--gala-gold-1/2/3`, `--gala-panel`, `--gala-panel-2`, `--gala-line`, `--gala-ink`, `--gala-ink-dim`, `--gala-bg-0/1`).

---

## Page Designs

### 1. Home Page (`/`)

Sections stacked full-width:

**Carousel** (full-width, kept and restyled wider) — 2 slides at 5-second interval:
- Slide 1: LIFAS history — "O Registro Oficial do Futebol de Sorocaba", recent champions list
- Slide 2: Champions League Sorocaba 2026 "Em Breve" teaser

**Tournament cards** (below carousel, two-column full-width):
- Left card: Copa do Mundo Sorocaba — most recent edition year, champion name, total editions, "Ver campeonato →"
- Right card: Champions League Sorocaba — most recent edition year, champion name, total editions, "Ver campeonato →"
- Both cards use full-bleed background (`gala-beams` atmosphere)

**Numbers bar** — full-width strip, three large gold numbers: Temporadas · Gols Marcados · Jogadores

**Artilheiros preview** — latest season's top 5 scorers
- Player photo/avatar, rank, name, team, horizontal goal bar, goal count
- "Ver estatísticas completas →" links to the appropriate tournament page based on most recent championship's `tournament_type`

**Data fetched (RSC):** `getAggregateStats()`, `getLatestSeasonTopScorers(5)`, `getLatestChampionByType()` (new query — gets most recent championship per tournament type for the two cards)

---

### 2. Copa do Mundo (`/copa-do-mundo`) & Champions League (`/champions-league`)

These two pages share identical structure, filtered by `tournament_type`.

**Layout:** Sidebar + main content, full-width.

#### Left Sidebar (~22% width, sticky)

- Tournament title at top
- "Todos" row at top → aggregate view across all editions of this tournament type
- Editions list, newest → oldest, each row: year · champion name
- Selected row highlighted in gold
- **Mobile:** collapses to a horizontal scrollable chip row pinned below the header

#### Main Content Area (~78% width)

**Top block — Podium + Prizes** (always visible, above tabs):

Podium (when a specific edition is selected):
- Three cards: 1st (tall, gold border, glow), 2nd (medium, left of 1st), 3rd (smaller, right of 1st)
- Each card: team name, optional team crest/icon

Prize strip (5 horizontal cards):
- **Artilheiro** — player name, photo, goal count
- **Maestro** — player name, photo, assist count
- **Melhor Jogador** — player name, photo (vote-based)
- **Melhor Goleiro** — player name, photo (IOG-based)
- **Revelação** — player name, photo (participations-per-match)

When "Todos" is selected: podium is hidden; prize strip shows all-time record holder for that tournament type per award.

**Sticky tab bar** (below the top block, sticks to top when scrolling):
- Classificação · Artilheiros · Disciplina · Bracket · Prêmios

**Tab content:**

| Tab | Content |
|---|---|
| Classificação | Group standings table (`StandingsTab`) |
| Artilheiros | Filtered rankings with position + stat chips (`FilteredRankingsTab`) |
| Disciplina | Yellow/red card table (`DisciplineTab`) |
| Bracket | Knockout bracket with SVG connectors (`BracketSection`) |
| Prêmios | Expanded awards with vote/stat breakdowns (`PremiosTab`) |

**Data fetched (RSC):** all editions of this tournament type from `championships` where `tournament_type = X`, ordered newest → oldest. Edition-specific data loaded client-side via existing hooks when an edition is selected in the sidebar.

---

### 3. Histórico (`/historico`)

Full width, single generous column with wide grids.

**Sections:**

1. **Page header** — gold overline, large serif "Histórico LIFAS", subtext "Todos os tempos · ambos os torneios"

2. **Numbers bar** — 5 stats: Temporadas · Gols Totais · Jogadores · Edições Copa do Mundo · Edições Champions League

3. **All-time artilheiros** — top 10 players across all championships
   - Columns: Rank · Photo · Nome · Time · Gols
   - Aggregated across all `championship_id` values (both tournament types)

4. **Mais títulos** — teams ranked by total titles
   - Columns: Rank · Time · Total · Copa do Mundo × · Champions League ×
   - Shows breakdown per tournament type

5. **Prêmios históricos** — 5-column grid (one per award)
   - Each column: award name header, then list of every edition's winner: year + tournament badge + player name
   - Requires `awards` data per championship — uses existing `usePublicRankings` winners fields

6. **Hall dos Campeões** — chronological list of every edition
   - Columns: Ano · Torneio (badge: 🌍 Copa / 🏆 Champions) · Campeão

**Data fetched (RSC):** `getAllChampionships()`, `getAllTimeTopScorers()`, `getMostTitlesTeams(10)`, `getAggregateStats()`, new `getHistoricoAwards()` query

---

## Components

### New (built from scratch)

| Component | Description |
|---|---|
| `LandingHeader` | Rebuilt with new nav links (Copa do Mundo, Champions League, Histórico) |
| `HomeTournamentCards` | Two-column tournament entry cards (Copa do Mundo + Champions League), below carousel |
| `HomeNumbersBar` | Full-width numbers strip |
| `TournamentSidebar` | Edition rail — sticky left column with "Todos" + edition list |
| `PodiumBlock` | 1st/2nd/3rd podium cards + 5-prize strip |
| `TournamentPageShell` | Client shell for Copa/Champions pages managing selected edition state |
| `TournamentTabs` | Tab bar + tab content switching (replaces ChampionshipTabs) |

### Kept and adapted

| Component | Change |
|---|---|
| `BracketSection` | Restyled for full-width; logic unchanged |
| `FilteredRankingsTab` | Restyled; logic unchanged |
| `StandingsTab` | No change |
| `PremiosTab` | Restyled |
| `DisciplineTab` | Extracted from ChampionshipTabs into its own file |
| `PlayerAvatar` | No change |
| `LoginModal` | No change |
| `LandingShell` | Updated to pass new nav structure |

### Deleted

| Component | Reason |
|---|---|
| `HeroCarousel` | Restyled to full-width; slide logic unchanged |
| `StatsChips` | Replaced by `HomeNumbersBar` |
| `SeasonStatsPanel` | No longer used |
| `StatisticsShell` | Replaced by `TournamentPageShell` |
| `ChampionshipTabs` | Replaced by `TournamentTabs` |
| `AllTimePanel` | Logic absorbed into `HistoricoPage` |

---

## New Queries Needed

| Query | Description |
|---|---|
| `getChampionshipsByType(type)` | All championships where `tournament_type = type`, newest first |
| `getLatestChampionByType()` | Most recent championship per type, for home page cards |
| `getHistoricoAwards()` | Per-championship award winners for the Histórico prêmios grid |
| `getPodiumByChampionship(id)` | 1st, 2nd, 3rd place teams for a given championship. 1st = `champion_team_id` on `championship_teams`. 2nd and 3rd = derived from final knockout bracket (finalists and third-place match losers) — requires querying `knockout_matches` where `is_final = true` and any explicit 3rd-place match, or from final group standings if no bracket exists. If unavailable, podium shows only 1st place. |

---

## Individual Awards (5 total)

Every tournament page and Histórico page uses these 5 awards consistently:

| Award | Portuguese | Data source |
|---|---|---|
| Top Scorer | Artilheiro | `goals` from `public_player_stats` |
| Top Assists | Maestro | `assists` from `public_player_stats` |
| Best Player | Melhor Jogador | Vote-based (`craque` from rankings) |
| Best Goalkeeper | Melhor Goleiro | IOG metric (`goalkeepers` from rankings) |
| Revelation | Revelação | Participations-per-match (`revelations` from rankings) |

---

## Mobile Behavior

- Sidebar collapses to horizontal scrollable chip row pinned below header
- Podium stacks vertically (1st on top, 2nd/3rd below side by side)
- Prize strip scrolls horizontally
- Tab bar remains sticky, scrolls horizontally if needed
- Numbers bar wraps to 2-column grid on small screens
