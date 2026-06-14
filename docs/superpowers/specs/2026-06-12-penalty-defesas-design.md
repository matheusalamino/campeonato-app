# Penalty Events & Defesas Counter — Design Spec

## Goal

Add two new match events to the súmula:

1. **Penalty (Normal Time):** Register a penalty kick with one of three outcomes (Goal / Out / Defended). Penalty goals count toward score and stats; defended penalties auto-credit the goalkeeper's defesas count.
2. **Defesas Counter:** Every player on the field view is tappable — each tap adds 1 defesa to that player for that game. Long-press removes the last save (undo). Saves are tracked per game and per championship in a new `Defesas` standings tab.

---

## Scope

**In scope:**
- `PENALTY` event type in the súmula modal (replaces `SAVE`)
- Three sub-outcomes: `PENALTY_GOAL`, `PENALTY_OUT`, `PENALTY_SAVED`
- Tap-to-save on `MatchFieldView` with optimistic UI and long-press undo
- `player_saves` table for per-row save storage
- `useDefesas` hook (same load/derive/refs/loadSeqRef pattern)
- New "Defesas" tab (4th) in the standings page
- `SAVE` removed from the súmula event grid (existing DB rows kept for legacy data)

**Out of scope:**
- Penalty shootout (already implemented separately)
- SAVE event type retroactive migration
- Push stats to external APIs

---

## Data Model

### New table: `player_saves`

```sql
CREATE TABLE IF NOT EXISTS player_saves (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id  UUID        NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id  UUID        NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  is_penalty       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_saves_match_idx          ON player_saves(match_id);
CREATE INDEX IF NOT EXISTS player_saves_championship_idx   ON player_saves(championship_id);
CREATE INDEX IF NOT EXISTS player_saves_registration_idx   ON player_saves(registration_id);
```

One row = one save. Delete the most-recent row to undo. `is_penalty = true` when auto-inserted from a `PENALTY_SAVED` event; `false` for tap-inserted saves.

### `match_events_v2` — new event_type values (no schema change)

| event_type | Score | Meaning |
|---|---|---|
| `PENALTY_GOAL` | +1 to kicking team | Penalty converted; counts as goal in all stats |
| `PENALTY_OUT` | none | Penalty missed (over the bar / wide) |
| `PENALTY_SAVED` | none | Goalkeeper saved; `player_in_id` = goalkeeper's registration_id |

Existing `SAVE` rows in the DB are preserved (read-only legacy). `SAVE` is removed from the event grid UI.

---

## Feature 1: Penalty Event

### Event grid

Replace the `SAVE` button with `PENALTY` (Target/🎯 icon). Grid stays 7 types:  
GOL · G. CONTRA · AMARELO · VERMELHO · PÊNALTI · FALTA · SUBSTITUIÇÃO

### Modal flow

```
Step 1 (existing)  → Select event type = PENALTY
Step 2 (existing)  → Select team (who took the penalty)
Step 3 (existing)  → Select player who kicked
Step 3.5 (NEW)     → Outcome picker: Gol / Fora / Defendido
Step 3.6 (NEW, only if Defendido) → Select goalkeeper from opposing team's current lineup
Step 4 (existing)  → Confirm summary
```

**Step 3.5 — outcome picker:**
- Three large buttons: ⚽ Gol (green) · ↗ Fora (zinc) · 🧤 Defendido (violet)
- "Gol" description: "Conta no placar"
- "Fora" description: "Sem alteração"
- "Defendido" description: "Selecionar goleiro"

**Step 3.6 — goalkeeper selector:**
- Shows only players from the opposing team's current lineup
- Search by name
- Footer note: "Defesa será contabilizada automaticamente"

**Step 4 — confirm summary:**
- Shows outcome label, kicker name + team, time
- If PENALTY_GOAL: shows amber "P" badge
- If PENALTY_SAVED: shows goalkeeper name below kicker

### What is written on confirm

| Outcome | match_events_v2 insert | Score | player_saves insert |
|---|---|---|---|
| Gol | event_type=PENALTY_GOAL, player_id=kicker, team_id=kicking team | kicking team +1 | — |
| Fora | event_type=PENALTY_OUT, player_id=kicker, team_id=kicking team | none | — |
| Defendido | event_type=PENALTY_SAVED, player_id=kicker, team_id=kicking team, player_in_id=goalkeeper | none | is_penalty=true, registration_id=goalkeeper |

### Event history display

| event_type | Icon | Label | Notes |
|---|---|---|---|
| PENALTY_GOAL | ⚽ (same as GOAL) | "GOL" | Player name has small amber "P" badge |
| PENALTY_OUT | ↗ (ArrowUpRight icon) | "PÊNALTI" | Zinc/muted label |
| PENALTY_SAVED | 🛡 (ShieldCheck icon) | "PÊNALTI DEF." | Second line shows goalkeeper name in small text |

### `addMatchEvent` changes

`addMatchEvent` in `services/match-events.service.ts` needs to handle `PENALTY_GOAL` identically to `GOAL` for score increment side-effects. `PENALTY_OUT` and `PENALTY_SAVED` require no score side-effects.

A new `addPenaltyEvent` function (or extended `addMatchEvent` with `penaltyOutcome` param) will:
1. Insert the `match_events_v2` row
2. If PENALTY_GOAL: increment `knockout_matches.home_score` or `away_score` (same as GOAL)
3. If PENALTY_SAVED: insert one row to `player_saves` (is_penalty=true, registration_id=goalkeeper)

---

## Feature 2: Defesas Tap-to-Save

### `MatchFieldView` changes

**New props:**
```typescript
saveCountsByPlayer: Map<string, number>   // registrationId → save count for this match
onSaveAdd: (registrationId: string) => void
onSaveRemove: (registrationId: string) => void
```

**Player circle interaction:**
- Wrap each player in a `<button>` (replaces the current non-interactive `<div>`)
- `onClick` → calls `onSaveAdd(registrationId)`
- Long-press (600ms `setTimeout` on `onMouseDown`/`onTouchStart`, cleared on `onMouseUp`/`onTouchEnd`) → calls `onSaveRemove(registrationId)`

**Save count badge (Option A — purple circle top-right):**
```tsx
{saveCount > 0 && (
  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center 
                   rounded-full bg-violet-700 text-[9px] font-black text-white 
                   border border-zinc-950 z-10">
    {saveCount}
  </span>
)}
```
Hidden when `saveCount === 0`.

### `page.tsx` additions

**State:**
```typescript
const [savesByPlayer, setSavesByPlayer] = useState<Map<string, number>>(new Map());
```

**Load on mount:**
```typescript
// Fetch player_saves for this match, build map: registrationId → count
```

**Handlers:**
```typescript
async function handleSaveAdd(registrationId: string) {
  setSavesByPlayer(prev => new Map(prev).set(registrationId, (prev.get(registrationId) ?? 0) + 1));
  await supabase.from("player_saves").insert({ match_id, championship_id, registration_id: registrationId, is_penalty: false });
}

async function handleSaveRemove(registrationId: string) {
  // Only removes tap-added saves (is_penalty=false).
  // Penalty auto-saves can only be undone by deleting the PENALTY_SAVED event.
  const { data } = await supabase.from("player_saves")
    .select("id").eq("match_id", match_id).eq("registration_id", registrationId)
    .eq("is_penalty", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return; // no tap-added saves to undo
  await supabase.from("player_saves").delete().eq("id", data.id);
  setSavesByPlayer(prev => {
    const next = new Map(prev);
    next.set(registrationId, Math.max(0, (prev.get(registrationId) ?? 0) - 1));
    return next;
  });
}
```

Both handlers use optimistic UI — the count updates immediately, DB syncs after.

### `useDefesas` hook (`features/hooks/useDefesas.ts`)

Same load/derive/refs/loadSeqRef pattern as `useBestPlayer`.

**Returns:**
```typescript
type DefesaScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  totalSaves: number;
  penaltySaves: number;
  regularSaves: number;
  byMatch: { matchId: string; matchName: string; phaseName: string; count: number; penaltyCount: number }[];
};
```

**Fetches in parallel:**
- `player_saves` filtered by `championship_id`
- `knockout_matches` (id, name, phase_id)
- `phases` (id, name)
- `championship_registrations` (id, profile_photo_link, players(name))
- `championship_team_players` (for team name lookup)

### Standings page — new "Defesas" tab

**4th tab button** after "Craque", same pill style.

**Tab label:** "Defesas" (or "🧤 Defesas")

**Leaderboard row:**
- Rank number badge
- Player photo (or User icon fallback)
- Player name + team name
- Total saves count (bold, violet)
- Small breakdown: "(N pênaltis)" if penaltySaves > 0
- Expand/collapse chevron → per-match history

**Per-match expanded row:**
- Match name + phase name
- Save count for that match
- Penalty saves count in parentheses if > 0

**Lazy loading:** `useDefesas(activeTab === "defesas" ? championshipId : null)`

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260614000000_player_saves.sql` | Create `player_saves` table + indexes |
| `services/match-events.service.ts` | Handle PENALTY_GOAL/OUT/SAVED; `addPenaltyEvent` function |
| `types/best-player.ts` or new `types/defesas.ts` | Add `DefesaScore` type |
| `features/hooks/useDefesas.ts` | New hook |
| `components/MatchFieldView.tsx` | Player circles → buttons, save badge, new props |
| `app/(protected)/games/[id]/page.tsx` | PENALTY modal steps 3.5/3.6, saves state, handlers, remove SAVE from grid |
| `app/(protected)/championship/standings/page.tsx` | 4th "Defesas" tab + leaderboard |
