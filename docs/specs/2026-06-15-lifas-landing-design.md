# LIFAS Public Landing Site — Design Spec

**Date:** 2026-06-15
**Status:** Approved

## Overview

Replace the missing public root of the app with a fully public-facing website for LIFAS (Liga de Futebol Adventista de Sorocaba). The site presents championship history, aggregate statistics, and a gateway to per-season data — all in English, using the existing gala dark-gold design system. Admin login moves from a dedicated page to an inline modal.

---

## 1. Architecture & Routing

### New route group: `app/(landing)/`

```
app/
  (landing)/
    layout.tsx          ← sticky header + footer + gala-bg
    page.tsx            ← public home at /
    statistics/
      page.tsx          ← statistics dashboard at /statistics
```

### Protected dashboard moves from `/` to `/dashboard`

`app/(protected)/page.tsx` currently resolves to `/`, which conflicts with the new `app/(landing)/page.tsx`. It must move:

```
app/(protected)/
  dashboard/
    page.tsx    ← was page.tsx at root of (protected), now at /dashboard
```

Two small follow-on changes:
- `useLogin` hook: success redirect for admins changes from `router.replace('/')` to `router.replace('/dashboard')`
- Middleware: add a rule — if an authenticated user lands on `/`, redirect to `/dashboard` (prevents landing page flicker for logged-in admins)

### Unchanged routes
- `app/(public)/live/[championshipId]` — live match view
- `app/(public)/stats/[championshipId]` — per-season stats detail (used as drill-down target)
- `app/(auth)/login` — login page kept as direct-URL fallback
- `app/(team-manager)/` — no changes
- All other protected sub-routes (`/games`, `/players`, `/championship`, etc.) — no changes

### Navigation wiring
- `/` → landing home
- `/statistics` → statistics dashboard
- `/statistics` season pill → updates page state (no URL change per season)
- Per-season "View full stats" → `/stats/[championshipId]` (existing public page)
- Live link in header → `/live/[latestChampionshipId]` resolved server-side

---

## 2. `(landing)/layout.tsx` — Shared Shell

**Background:** `gala-bg` class (existing radial gradient system), `min-h-screen`, `text-[var(--gala-ink)]`

### Sticky Header
- `position: sticky; top: 0; z-index: 50`
- Background: `rgba(5,5,7,0.85)` + `backdrop-filter: blur(12px)` + bottom border `var(--gala-line)`
- **Left:** ⚽ `LIFAS` wordmark in gold (`gala-gold-text`), links to `/`
- **Center:** `Statistics` link → `/statistics` · `Live` link → `/live/[latestId]` (server-resolved)
- **Right:** `Admin Login` gold gradient pill button — `onClick` opens login modal dialog

### Footer Strip
- Single line: `© LIFAS · Liga de Futebol Adventista de Sorocaba · Sorocaba, SP`
- Top border: `var(--gala-line)`, padding `py-6`, text `text-xs text-[var(--gala-ink-dim)]`

### Login Modal (housed in layout)
The layout exports a `"use client"` wrapper component (`LandingShell`) that holds `const [loginOpen, setLoginOpen] = useState(false)`. It renders the `<Header>` (passing `onLoginClick={() => setLoginOpen(true)}`) and `<LoginModal>` (passing `open={loginOpen}` and `onClose={() => setLoginOpen(false)}`). The RSC layout file imports `LandingShell` and passes server-fetched data (latest championship ID) as props.

---

## 3. Landing Page (`/`)

Server component. All data fetched server-side at request time.

### 3a. Hero — Split Layout

Two-column grid, `lg:grid-cols-2`, stacked on mobile.

**Left column:**
- Eyebrow: `Liga de Futebol Adventista de Sorocaba` — `text-[10px] uppercase tracking-[4px] text-[var(--gala-gold-2)]`
- Headline: `The Official Record of Sorocaba Football` — large, `font-serif font-extrabold`, `gala-gold-text`
- Subline: `Every match. Every goal. Every season — preserved.` — `text-sm text-[var(--gala-ink-dim)]`
- CTA button: `View Championships →` gold gradient, links to `/statistics`

**Right column:**
- Panel label: `Recent Champions` — gold uppercase tracking label
- List of past champions: year + champion team name, ordered `season DESC LIMIT 4`
- Each row: gold year badge + team name, `gala-panel` background

**Background:** existing `gala-beams` animated beams + `gala-dust` floating particles

**Data query:**
```sql
SELECT name, season, champion_team_id, teams.name as champion_name
FROM championships
LEFT JOIN championship_teams ON championships.champion_team_id = championship_teams.id
LEFT JOIN teams ON championship_teams.team_id = teams.id
ORDER BY season DESC
LIMIT 4
```

### 3b. Numbers Section

**Aggregate stat chips row (4 chips):**

| Chip | Label | Query |
|---|---|---|
| Total seasons | `Seasons` | `COUNT(*)` from `championships` |
| Total goals | `Goals Scored` | `SUM(goals)` from `match_events` where `event_type = 'goal'` |
| Unique players | `Players` | `COUNT(DISTINCT player_id)` from `championship_registrations` |
| Total matches | `Matches` | `COUNT(*)` from `matches` |

Chips style: `gala-panel` card, large number in white `font-black`, label in `text-[var(--gala-ink-dim)]`.

**Latest Season Top Scorers:**
- Section label: `[Season Name] · Top Scorers`
- Top 5 scorers from the most recent championship
- Each row: rank number, player name, horizontal gold bar proportional to goals, goal count
- `View full statistics →` link to `/statistics`
- Reuses the existing scorer aggregation query (same as `usePublicRankings`)

---

## 4. Statistics Dashboard (`/statistics`)

Mix of server component (shell, right column) + client component (left column tabs).

### Page Header
- Eyebrow: `━ ✦ ━ Official Statistics ━ ✦ ━` — gold, `tracking-[4px]`
- Title: `LIFAS Statistics` — `gala-gold-text font-serif font-extrabold`
- Subtitle: `All-time records and season highlights · updated in real time`

### Season Selector
- Horizontal scrollable pill row: one pill per championship, labeled `[Season name]` (e.g. `2025 — Season V`)
- Active pill: gold border + gold text + subtle gold background tint
- Inactive pill: `gala-panel` style
- Data: all championships ordered by `season DESC`, fetched server-side, passed as props to client component
- Default selection: most recent championship

### Two-Column Layout (`lg:grid-cols-[1fr_360px]`)

**Left column — Selected Season (client component, lazy tabs):**

Four tabs: `Rankings` · `Standings` · `Discipline` · `Players`

- Reuse existing components:
  - `Rankings` → `<RankingsTab>` from `components/public/stats/RankingsTab.tsx`
  - `Standings` → `<StandingsTab>` from `components/public/stats/StandingsTab.tsx`
  - `Players` → `<PlayersTab>` from `components/public/stats/PlayersTab.tsx`
  - `Discipline` → new tab showing yellow/red card leaders for the selected season

Tab data loads when the season pill changes or a tab is clicked (same pattern as existing `/stats/[championshipId]` page).

**Right column — All-Time Records (server component, static on load):**

Sections rendered top to bottom:

1. **Aggregate chips** (same 4 as landing page, reused component)
2. **All-Time Top Scorers** — players ranked by total goals across ALL championships. New query:
   ```sql
   SELECT players.name, SUM(scorer_count) as total_goals
   FROM (per-season scorer aggregation across all championships)
   GROUP BY player_id ORDER BY total_goals DESC LIMIT 10
   ```
3. **Most Championships Won** — teams ranked by title count:
   ```sql
   SELECT teams.name, COUNT(*) as titles
   FROM championships JOIN championship_teams ... JOIN teams ...
   WHERE championship_teams.id = championships.champion_team_id
   GROUP BY team_id ORDER BY titles DESC LIMIT 5
   ```
4. **Hall of Champions** — every season listed: year → champion team name, gold year badge per row

Right column is `gala-panel` styled, scrolls independently on desktop.

---

## 5. Login Modal

**Component:** `LoginModal.tsx` — client component, housed in `(landing)/layout.tsx`

**Trigger:** `Admin Login` button in header sets `open = true` on a `<dialog>` element (native HTML dialog, accessible, closes on Escape and backdrop click).

**Visual design (Top-Accent Flat — option C):**
- Background: `#050507` (near-black)
- Top border: `border-t-2 border-[var(--gala-gold-2)]` + subtle `box-shadow: 0 -4px 20px rgba(212,160,23,0.2)` above the top edge
- `border-left/right/bottom: 1px solid var(--gala-line)`
- `border-radius: 12px`
- Width: `max-w-sm w-full`, centered on backdrop

**Content:**
- `Restricted Area` — `text-[9px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]`
- `Administrator Login` — `text-xl font-black text-white`
- `Only authorized admins may sign in` — `text-xs text-[var(--gala-ink-dim)]`
- Email input: flat underline style (`border-b border-[var(--gala-line)]`, focus `border-[var(--gala-gold-2)]`), no box
- Password input: same style
- Error slot: `text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2` (shown only on failure)
- `Sign In` button: full-width gold gradient, `font-black uppercase tracking-widest`
- `✕` close button: top-right, `text-[var(--gala-ink-dim)]`

**Auth logic** — identical to `app/(auth)/login/page.tsx`:
1. `supabase.auth.signInWithPassword({ email, password })`
2. On error → show error message, stay on modal
3. On success → fetch `profiles.role`:
   - `manager` → `router.replace('/team-manager')`
   - `auction_fiscal` → `router.replace('/auction-fiscal')`
   - anything else → `router.replace('/')` (protected dashboard)

No new auth code — extracted into a shared `useLogin()` hook used by both the modal and the existing `/login` page.

---

## 6. Data Layer

All landing and stats queries are **public Supabase reads** — no auth required, consistent with existing `/stats/[championshipId]` access pattern.

| Data | Component | Fetch strategy |
|---|---|---|
| Recent champions (4) | Landing hero | Server component at request time |
| Aggregate stats | Landing + stats right col | Server component, 4 parallel selects |
| Latest season top 5 scorers | Landing numbers section | Server component |
| All championships list | Stats season pills | Server component, passed as props |
| Per-season tab content | Stats left column | Client component, on pill/tab change |
| All-time top scorers | Stats right column | Server component |
| Most championship titles | Stats right column | Server component |
| Latest championship ID (for Live link) | Layout header | Server component in layout |

**Shared hook:** Extract login logic from `app/(auth)/login/page.tsx` into `features/hooks/useLogin.ts` — used by both the modal and the existing login page.

**No new API routes.** No middleware changes. No schema migrations.

---

## 7. Existing Code Reused

| Existing piece | Used where |
|---|---|
| `gala-bg`, `gala-gold-text`, `gala-panel`, `gala-beams`, `gala-dust` CSS | Landing hero background |
| `RankingsTab`, `StandingsTab`, `PlayersTab` components | Stats dashboard left column tabs |
| `usePublicRankings` hook | Latest season scorers on landing + rankings tab |
| Supabase auth logic from `/login/page.tsx` | Extracted into `useLogin` hook |

---

## 8. Out of Scope

- Sign-up flow (admin accounts created externally)
- Forgot password / password reset
- Social auth
- Internationalization (all new text is English; existing Portuguese in protected pages unchanged)
- Push notifications or live updates on the landing page
- SEO / Open Graph meta tags (can be added later)
