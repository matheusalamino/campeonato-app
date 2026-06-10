# Suspension Business Logic — Design Spec

**Issue:** #29  
**Date:** 2026-06-09  
**Branch target:** develop  
**Depends on:** Issue #25 (suspensions & player_card_stats data model, merged in PR #33)

---

## Context

With the `suspensions` and `player_card_stats` tables in place, this spec covers the business logic that automatically generates and reverses suspensions when events are registered in the match report (súmula). The logic lives entirely on the client side in TypeScript, consistent with the existing Supabase-direct pattern in `services/`.

---

## Schema Change

The `suspended_match_id` column in `suspensions` must become nullable to support the edge case where a player's next match is not yet determined (cross-phase suspension before group standings are resolved).

**New migration:** `supabase/migrations/20260609000001_suspensions_nullable_match.sql`

```sql
ALTER TABLE public.suspensions
  ALTER COLUMN suspended_match_id DROP NOT NULL;
```

The view `v_suspended_players` requires no change — it already returns rows regardless of `suspended_match_id` nullability. Queries that filter by `suspended_match_id = ?` still work for match-specific lookups; pending suspensions (`suspended_match_id IS NULL`) appear as unserved and can be resolved by an admin later.

---

## Service File

**New file:** `services/match-events.service.ts`

### Exported functions

#### `addMatchEvent(params)`

Inserts an event into `match_events_v2`, then applies suspension logic based on event type.

**Parameters:**
```ts
{
  knockoutMatchId: string
  teamId: string                // championship_team_id
  registrationId: string | null // championship_registrations.id
  eventType: string
  eventTimeS: number
  period: string
  assistPlayerId?: string | null
  playerInId?: string | null
  championshipId: string
}
```

**Flow:**
1. Insert into `match_events_v2`
2. If `eventType === 'RED_CARD'` and `registrationId` is set → call `handleRedCard()`
3. If `eventType === 'YELLOW_CARD'` and `registrationId` is set → call `handleYellowCard()`
4. Return the inserted event row or throw on error

---

#### `removeMatchEvent(params)`

Soft-deletes an event and reverses its card effect.

**Parameters:**
```ts
{
  eventId: string
  knockoutMatchId: string
  registrationId: string | null
  eventType: string
}
```

**Flow:**
1. Set `deleted_at = now()` on `match_events_v2` row
2. If `eventType === 'RED_CARD'` and `registrationId` is set → remove unserved red card suspension
3. If `eventType === 'YELLOW_CARD'` and `registrationId` is set → reverse yellow card effect (see edge cases)

---

#### `handleRedCard(registrationId, knockoutMatchId, championshipTeamId, championshipId)` *(internal)*

1. Call `findNextMatch(knockoutMatchId, championshipTeamId)` → `suspendedMatchId` (may be null)
2. Insert into `suspensions`:
   - `registration_id = registrationId`
   - `origin_match_id = knockoutMatchId`
   - `suspended_match_id = suspendedMatchId` (nullable)
   - `reason = 'red_card'`
   - `served = false`

---

#### `handleYellowCard(registrationId, knockoutMatchId, championshipTeamId, championshipId)` *(internal)*

1. Query `match_events_v2` for existing `YELLOW_CARD` events with `player_id = registrationId` and `knockout_match_id = knockoutMatchId` and `deleted_at IS NULL` → if found, **stop** (same-match duplicate yellow = referee handles as red card, not accumulation)
2. Upsert `player_card_stats` for `registrationId` (create with `active_yellow_cards = 0` if not exists)
3. Read `active_yellow_cards`:
   - **If 0:** increment to 1 (player is now pendurado)
   - **If 1:** call `findNextMatch()`, insert suspension with `reason = 'two_yellows'`, reset `active_yellow_cards = 0`

---

#### `findNextMatch(knockoutMatchId, championshipTeamId)` *(internal)*

Returns `string | null` — the `knockout_match_id` of the next match the team will play.

**Algorithm:**
1. Fetch current match: `phase_id`, `round_number`
2. Fetch all matches in same phase ordered by `round_number` with the team in a slot (`match_slots.championship_team_id = championshipTeamId`) where `round_number > current` → take the first
3. If found → return that match id
4. If not found → fetch next phase (same championship, `order_number` greater than current phase's `order_number`, ascending) → find the first match in that phase where the team has a slot
5. If found → return that match id
6. If not found (team not yet slotted in next phase) → return `null`

---

### Reversal logic on `removeMatchEvent`

**Removing a RED_CARD:**
- Delete from `suspensions` where `registration_id = registrationId AND origin_match_id = knockoutMatchId AND reason = 'red_card' AND served = false`
- If no row found: no-op (idempotent)

**Removing a YELLOW_CARD:**
1. Check if a suspension exists with `origin_match_id = knockoutMatchId AND registration_id = registrationId AND reason = 'two_yellows' AND served = false`
   - **If yes** (this yellow was the 2nd one that triggered suspension): delete the suspension, restore `player_card_stats.active_yellow_cards = 1`
   - **If no** (this yellow was the 1st one, player was pendurado): decrement `player_card_stats.active_yellow_cards` by 1 (minimum 0)
2. If `player_card_stats` row doesn't exist: no-op

---

## Integration in Games Page

**`app/(protected)/games/[id]/page.tsx`**

The `save()` function inside `AddEventModal` replaces the direct `supabase.from("match_events_v2").insert(...)` call with `addMatchEvent(...)` from the service.

The existing delete handler (soft-delete via `deleted_at`) is replaced with `removeMatchEvent(...)`.

No other changes to the page are needed.

---

## Edge Cases (documented, no automated tests)

| Case | Behaviour |
|---|---|
| 2 yellow cards in the same match (same player) | `handleYellowCard` detects existing YELLOW_CARD in same match → skip, no accumulation |
| `player_card_stats` row doesn't exist yet | Upsert creates it with `active_yellow_cards = 0` before processing |
| Next match not found (cross-phase, team not slotted yet) | `suspended_match_id = null`, suspension created as pending |
| Removing a card event when suspension is already `served = true` | Suspension not reverted — it was already applied |
| Removing a card event when no suspension or card stats exist | No-op, no error thrown |
| Red card removed but matching suspension not found | No-op (idempotent) |
| Yellow card removed but `player_card_stats` doesn't exist | No-op |

---

## Files

| Action | Path |
|---|---|
| Create migration | `supabase/migrations/20260609000001_suspensions_nullable_match.sql` |
| Create service | `services/match-events.service.ts` |
| Modify | `app/(protected)/games/[id]/page.tsx` (replace direct inserts/deletes) |
