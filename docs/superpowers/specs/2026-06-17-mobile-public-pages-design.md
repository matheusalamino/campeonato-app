# Design: Mobile Public Pages

**Date:** 2026-06-17
**Status:** Approved

---

## Goal

Deliver purpose-built mobile layouts for the three main public-facing page groups:
- Tournament pages: `/copa-do-mundo`, `/champions-league`, `/historico`
- Public stats: `/stats/[championshipId]`
- Live screen: `/live/[championshipId]`

Desktop versions remain pixel-for-pixel unchanged. Same URL serves both experiences — CSS breakpoints decide which layout renders.

---

## Architecture

Each page file wraps the existing desktop content in `hidden md:block` and adds a new `md:hidden` mobile subtree alongside it:

```tsx
<>
  <div className="hidden md:block">
    <TournamentPageShell ... />   {/* untouched */}
  </div>
  <div className="md:hidden">
    <MobileTournamentShell ... /> {/* new */}
  </div>
</>
```

No user-agent detection. No separate routes. No redirects. The Tailwind `md:` breakpoint (768px) controls which tree renders. Mobile components live in `components/mobile/` and are entirely independent of the desktop tree.

No new npm dependencies.

---

## Tournament Pages Mobile (`/copa-do-mundo`, `/champions-league`, `/historico`)

### Root component: `components/mobile/MobileTournamentShell.tsx`

Receives the same props as the existing `TournamentPageShell`: `tournamentTitle`, `editions`, `initialPodium`. Uses `usePublicRankings` and `useState<TabId>` for the active tab.

### Screen structure (top to bottom)

```
┌─ header sticky ──────────────────────────────┐
│  ⚽ LIFAS logo                    [Entrar]    │
├─ edition chips sticky (scrollable) ──────────┤
│  [2025] [2024] [2023] [Todos]                │
├─ champion strip (not scrollable) ────────────┤
│  [crest]  🏆 Campeão · Copa 2025             │
│           Falcões Negros                      │
│  [🥈 Eagles A.]   [🥉 Lions B.]             │
├─ active tab content (scrollable) ────────────┤
│  ...                                         │
└─ bottom nav sticky ──────────────────────────┘
  🗂️Class.  🗓️Bracket  📊Stats  🟨Discipl.  🏅Prêmios
```

### Champion strip rules
- Visible only when a specific edition is selected (hides for "Todos os anos")
- Shows champion team crest + name prominently; 2nd and 3rd place as small chips to the right
- If no champion yet: "A definir" placeholder in the champion slot

### Edition chip row
- Reuses the same `onSelect` / `selectedId` logic from `TournamentSidebar`
- Horizontal scroll, `whitespace-nowrap` chips, same gold active style

### Bottom navigation
Five tabs matching the existing `TournamentTabs` tab IDs: `classificacao`, `bracket`, `estatisticas`, `disciplina`, `premios`. Icon + short label per tab. Active tab highlighted in gold.

### Tab content components

| Tab | Component | Notes |
|-----|-----------|-------|
| Classificação | `components/mobile/tabs/MobileStandingsTab.tsx` | New — see Standings section |
| Bracket | reuse `BracketSection` | Already mobile-friendly (`MatchRow` uses flex + truncate) |
| Estatísticas | `components/mobile/tabs/MobileFilteredRankingsTab.tsx` | New — see Filters section |
| Disciplina | reuse `DisciplineTab` | Has `overflow-x-auto`, acceptable as-is |
| Prêmios | reuse `PremiosTab` | Award cards scale well on mobile |

---

## Stats Page Mobile (`/stats/[championshipId]`)

### Root component: `components/mobile/MobileStatsPage.tsx`

No champion strip (edition is fixed by URL). No login button (not a landing page). Three-tab bottom nav.

```
┌─ championship name + subtitle ───────────────┐
├─ active tab content (scrollable) ────────────┤
│  ...                                         │
└─ bottom nav sticky ──────────────────────────┘
        🏆 Rankings   📊 Classificação   👤 Jogadores
```

### Tab content components

| Tab | Component | Notes |
|-----|-----------|-------|
| Rankings | reuse `RankingsTab` | `RankCard` grid is already `grid-cols-1` on mobile; only padding adjusted |
| Classificação | reuse `MobileStandingsTab` | Same component as tournament pages |
| Jogadores | `components/mobile/tabs/MobilePlayersTab.tsx` | New — see Filters section |

---

## Mobile Standings Table (`MobileStandingsTab`)

Used in both tournament pages and stats page.

**Default view** — 5 columns only:

| # | Time | P | J | SG |
|---|------|---|---|----|

**Expanded view** — toggled by tapping the expand row:

Adds V, E, D, GP, GC inline below the existing rows (or expands into extra columns — implementation detail left to the plan). Expand state is per-group.

```
[ ↕ Ver V · E · D · GP · GC ]   ← tap to toggle
```

Top 2 teams highlighted in gold (qualification zone). Groups sorted alphabetically by label (A, B, C…). Group phase match results section below the tables is kept as-is (already flex-based, mobile-friendly).

---

## Filter Sheet Pattern

Used in `MobileFilteredRankingsTab` (Estatísticas tab) and `MobilePlayersTab` (Jogadores tab).

### Trigger
A pill button at the top-right of the tab content:

```
[🎛 Filtrar ▾]   (shows active filter count: [🎛 Filtrar · 2])
```

### Sheet
Opens from the bottom with a slide-up animation. `position: fixed`, `z-50`, backdrop `bg-black/50`. Closes on backdrop tap, on "Aplicar", or on swipe-down.

```
┌─────────────────────────────────────────────┐
│  ━━━  (drag handle)                          │
│                                              │
│  Posição                                     │
│  [Todas] [GOL] [ZAG] [LAT] [MEI] [ATA]     │
│                                              │
│  Estatística  (FilteredRankings only)        │
│  [Gols ✓] [Assistências] [Defesas] ...      │
│                                              │
│  Time  (PlayersTab only)                    │
│  [Todos] [Falcões N.] [Eagles A.] ...       │
│                                              │
│  [Limpar]                 [Aplicar (2) →]   │
└─────────────────────────────────────────────┘
```

Implemented with `useState` + Tailwind transition classes (`translate-y-full` → `translate-y-0`). No new library.

**`MobilePlayersTab`** additionally keeps the search bar always visible above the filter button (search is the primary action, filters are secondary).

---

## Live Page Mobile (`/live/[championshipId]`)

### No new component — modifies existing files

**`components/public/LiveMatchCard.tsx`** — replace all `vw`-based sizing with responsive Tailwind classes:

| Element | Mobile value | Desktop (md:) value |
|---------|-------------|---------------------|
| Team name | `text-sm` | `text-[1.6vw]` |
| Team crest | `size-16` | `size-[6.8vw] max-w-[88px]` |
| Score digits | `text-5xl` | `text-[7vw]` |
| Score separator × | `text-2xl` | `text-[2.4vw]` |
| Events list | `text-xs` | `text-[1vw]` |
| Championship eyebrow | `text-xs` | `text-[1.2vw]` |
| Period pill | `text-sm` | `text-[1.1vw]` |
| Team column width | `w-[36vw]` already flex, use `flex-1` | keep `w-[26vw]` at md: |

Desktop TV behavior (all `vw` units, cursor-hide, wake-lock) is preserved unchanged at `md:` breakpoint.

**`components/public/LiveCarousel.tsx`** — add swipe gesture support:

```tsx
onTouchStart: record startX
onTouchEnd: if deltaX > 50px → prev(); if deltaX < -50px → next()
```

Auto-advance continues as today. Pauses for 5s after a manual swipe (same behavior as mouse interaction). Progress bars in the footer remain unchanged.

---

## Out of Scope

- Landing home (`/`) — informational page, lower priority, separate task
- Admin / protected pages
- `AllTimePanel`, `DisciplineTab`, `PremiosTab` — reused as-is
- Visual identity changes (dark theme, gold palette, typography)
- `BracketSection` — already mobile-friendly, reused directly

---

## Files Changed

**New files:**
```
components/mobile/MobileTournamentShell.tsx
components/mobile/MobileStatsPage.tsx
components/mobile/tabs/MobileStandingsTab.tsx
components/mobile/tabs/MobileFilteredRankingsTab.tsx
components/mobile/tabs/MobilePlayersTab.tsx
```

**Modified files:**
```
app/(landing)/copa-do-mundo/page.tsx       ← add md:hidden / hidden md:block wrappers
app/(landing)/champions-league/page.tsx
app/(landing)/historico/page.tsx
app/(public)/stats/[championshipId]/page.tsx
components/public/LiveMatchCard.tsx         ← vw → responsive px values
components/public/LiveCarousel.tsx          ← touch swipe support
```
