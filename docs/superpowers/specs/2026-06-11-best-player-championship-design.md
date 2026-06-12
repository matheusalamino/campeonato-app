# Craque do Campeonato — Design Spec

**Date:** 2026-06-11
**Branch:** feature/best-player-championship
**Status:** Approved

---

## Overview

At the end of each match, the admin records three "best player" votes on behalf of the participants:

- **Cartola da Casa** — home team manager picks one player from the away team
- **Cartola Visitante** — away team manager picks one player from the home team
- **Árbitro** — referee picks any player from either team

Points are weighted by phase importance. The player with the most accumulated points at the end of the championship wins the **Craque do Campeonato** award. A new tab in the standings page tracks the live leaderboard.

---

## Voting Rules

| Phase type | Points per vote |
|------------|----------------|
| Fase de Grupos / Repescagem | 1 |
| Semifinal | 2 |
| Final | 3 |

Each match yields at most 3 votes (one per voter role). Votes can be submitted partially or skipped and filled in retroactively. Retroactive edits replace the previous vote (upsert).

All votes are submitted by the admin — no separate login is required for managers or the referee.

---

## Database Schema

### 1. New column on `phases`

```sql
ALTER TABLE phases ADD COLUMN vote_weight INTEGER NOT NULL DEFAULT 1;
```

Values: `1`, `2`, `3`. Defaults to `1` so existing phases are unaffected.

### 2. New table `best_player_votes`

```sql
CREATE TABLE best_player_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  voter_role      TEXT NOT NULL CHECK (voter_role IN ('home_manager', 'away_manager', 'referee')),
  points          INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, voter_role)
);
```

- `championship_id` is denormalized for efficient leaderboard queries.
- `UNIQUE(match_id, voter_role)` enforces one vote per role per match; retroactive edits are upserts.
- `points` is stored at insert time from `phases.vote_weight` (no recalculation needed if weight changes later).

---

## Phase Configuration

### `PhaseConfigDrawer` changes

A new "Peso de Voto (Craque do Campeonato)" selector is added to the phase form for all phase types:

```
Peso de Voto (Craque do Campeonato)
[ 1 — Fase de Grupos / Repescagem ▾ ]
  1 — Fase de Grupos / Repescagem
  2 — Semifinal
  3 — Final
```

### Type changes — `types/championship.ts`

```typescript
export type Phase = {
  // ... existing fields ...
  vote_weight: number; // 1 | 2 | 3
};

export type CreatePhaseDTO = {
  // ... existing fields ...
  vote_weight?: number; // defaults to 1 server-side
};

export type UpdatePhaseDTO = {
  // ... existing fields ...
  vote_weight?: number;
};
```

### `usePhases` hook

Add `vote_weight` to the Supabase select query so it's available when the voting modal resolves the weight for a given match.

---

## Voting Modal — `BestPlayerVoteModal`

**File:** `components/BestPlayerVoteModal.tsx`

### Props

```typescript
type BestPlayerVoteModalProps = {
  matchId: string;
  championshipId: string;
  homeTeam: { championshipTeamId: string; name: string };
  awayTeam: { championshipTeamId: string; name: string };
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  voteWeight: number;
  existingVotes: { voterRole: VoterRole; registrationId: string }[];
  onClose: () => void;
  onSaved: () => void;
};
```

### Flow (4 steps)

| Step | Label | Voter | Picks from |
|------|-------|-------|-----------|
| 1 | Cartola da Casa | Home manager | Away team players |
| 2 | Cartola Visitante | Away manager | Home team players |
| 3 | Árbitro | Referee | Both teams' players |
| 4 | Confirmar | — | Summary + submit |

- Each step shows a scrollable player list (photo, name, position) matching the `AddEventSheet` style.
- A **"Pular"** button on each step allows skipping that vote.
- **Step 4 (summary):** Shows all 3 selections side-by-side. Skipped votes display as "—". A "Confirmar" button submits non-skipped votes as upserts.
- **Retroactive state:** If `existingVotes` is non-empty, pre-select those players and mark each step as "Já votado". The admin may change or keep them.

### Submission

For each non-skipped vote, upsert into `best_player_votes`:
```typescript
{
  match_id: matchId,
  championship_id,       // resolved from match
  registration_id,       // selected player
  voter_role,            // 'home_manager' | 'away_manager' | 'referee'
  points: voteWeight,    // from phase.vote_weight
}
```

Uses Supabase `upsert` with `onConflict: 'match_id,voter_role'`.

---

## Match Page Integration

**File:** `app/(protected)/games/[id]/page.tsx`

### Auto-trigger on completion

```typescript
const prevStatusRef = useRef<string | undefined>();

useEffect(() => {
  if (prevStatusRef.current !== "COMPLETED" && detail?.match.status === "COMPLETED") {
    setShowVoteModal(true);
  }
  prevStatusRef.current = detail?.match.status;
}, [detail?.match.status]);
```

Fires when the match transitions to COMPLETED — covers both normal period end and penalty shootout completion.

### Retroactive "Votar Craque" button

Shown when `isCompleted`. Displays vote count:

- Incomplete: `⭐ Votar Craque  (1/3 votos)`
- Complete: `✅ Craque Votado  (3/3 votos)`

The button remains clickable in both states to allow corrections. Vote count is derived from the `existingVotes` state fetched on match page load (see "Existing votes fetch" below).

### Vote weight resolution

`useMatchDetail` is extended to include `phases.vote_weight` in its existing phase fetch (the hook already has `match.phase_id`). It exposes `voteWeight: number` alongside `detail`.

### Existing votes fetch

The match page fetches existing votes for the match on load (alongside `useMatchDetail`) via a small `useEffect` that queries `best_player_votes WHERE match_id = ?`. This populates `existingVotes` passed to the modal, and also drives the `(X/3 votos)` count on the retroactive button. The fetch re-runs whenever `onSaved` fires.

---

## Hook — `useBestPlayer`

**File:** `features/hooks/useBestPlayer.ts`

### Signature

```typescript
export function useBestPlayer(championshipId: string | null): {
  leaderboard: PlayerScore[];
  loading: boolean;
  reload: () => Promise<void>;
}
```

### Public types

```typescript
export type VoteDetail = {
  matchId: string;
  matchName: string;
  phaseName: string;
  voterRole: 'home_manager' | 'away_manager' | 'referee';
  points: number;
};

export type PlayerScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  totalPoints: number;
  votes: VoteDetail[];
};
```

### Data fetching (parallel)

```
1. best_player_votes WHERE championship_id = ?
2. knockout_matches  WHERE championship_id = ? (id → name, phase_id)
3. phases            WHERE championship_id = ? (id → name)
4. championship_registrations + championship_team_players (reuse useDisciplinary pattern)
```

### Computation

- Group votes by `registration_id`
- Sum `points` → `totalPoints`
- Build `votes[]` with match/phase name resolution
- Sort descending by `totalPoints`

No phase/team filters — the leaderboard always covers the full championship.

---

## Standings Page — "Craque" Tab

**File:** `app/(protected)/championship/standings/page.tsx`

### Tab switcher

```typescript
type ActiveTab = "standings" | "disciplinary" | "best_player";
```

New button added to the existing tab switcher row:
```
[ Classificação ]  [ Disciplina ]  [ Craque ]
```

### Tab content

Ranked leaderboard with expandable vote history:

```
🏅  #   Player          Team         Points
─────────────────────────────────────────────
🥇  1   João Silva      Flamengo     9 pts   ▾  (expanded)
        └─ Final vs Palmeiras         Árbitro            +3pts
        └─ Semifinal vs Grêmio        Cartola Visitante  +2pts
        └─ Fase de Grupos vs Santos   Cartola da Casa    +1pts
🥈  2   Pedro Costa     Palmeiras    5 pts   ▶
🥉  3   Lucas Melo      Grêmio       3 pts   ▶
    4   ...
```

- Ranks 1/2/3 receive gold/silver/bronze badges (same style as standings table).
- Voter role labels: "Cartola da Casa", "Cartola Visitante", "Árbitro".
- Header title: `⭐ Craque do Campeonato` when active.
- Empty state: star icon + "Nenhum voto registrado ainda."
- Lazy-loaded: `useBestPlayer` is only instantiated when the tab is first opened.

---

## File Checklist

| File | Change |
|------|--------|
| `supabase/migrations/20260611000000_best_player.sql` | New migration |
| `types/championship.ts` | Add `vote_weight` to `Phase`, `CreatePhaseDTO`, `UpdatePhaseDTO` |
| `components/PhaseConfigDrawer.tsx` | Add vote weight selector |
| `features/hooks/usePhases.ts` | Add `vote_weight` to select |
| `features/hooks/useBestPlayer.ts` | New hook |
| `features/hooks/useMatchDetail.ts` | Expose `voteWeight` from phase |
| `components/BestPlayerVoteModal.tsx` | New component |
| `app/(protected)/games/[id]/page.tsx` | Auto-trigger + retroactive button |
| `app/(protected)/championship/standings/page.tsx` | Add Craque tab |
