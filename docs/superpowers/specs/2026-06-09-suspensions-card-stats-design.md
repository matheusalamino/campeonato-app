# Suspensions & Yellow Card Stats — Data Model Design

**Issue:** #25  
**Date:** 2026-06-09  
**Branch target:** develop  
**Scope:** Data model only — no business logic

---

## Context

The app needs to support automatic player suspensions driven by yellow card accumulation and red cards. This spec covers only the database schema and data-access layer (views + TypeScript queries). Business logic (auto-triggering suspensions when events are saved) is out of scope for this iteration.

---

## Tables

### `suspensions`

Stores each suspension event for a player in a championship context.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `registration_id` | UUID FK → `championship_registrations.id` | Player in championship context |
| `origin_match_id` | UUID FK → `knockout_matches.id` | Match where the card event occurred |
| `suspended_match_id` | UUID FK → `knockout_matches.id` | Match the player must sit out |
| `reason` | TEXT | `'red_card'` or `'two_yellows'`; enforced via CHECK constraint |
| `served` | BOOLEAN | Default `false`; set to `true` once the suspended match is played |
| `created_at` | TIMESTAMPTZ | Default `now()` |

**Indexes:** `registration_id`, `suspended_match_id`

### `player_card_stats`

Tracks the active yellow card counter per player per championship. One row per `registration_id` (UNIQUE constraint).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `registration_id` | UUID FK → `championship_registrations.id` UNIQUE | |
| `active_yellow_cards` | INTEGER | Default `0`; reset to `0` on phase change |
| `updated_at` | TIMESTAMPTZ | Default `now()` |

- A player with `active_yellow_cards = 1` is **booked** (pendurado).
- A player reaching `active_yellow_cards = 2` is suspended for the next match; the counter is then reset to `0` (historical records in `match_events_v2` remain untouched).

---

## Views

### `v_suspended_players`

Unserved suspensions, enriched with championship and player context. Used to check whether a player is suspended for a given match.

```sql
SELECT
  s.id            AS suspension_id,
  s.registration_id,
  s.suspended_match_id,
  s.reason,
  cr.championship_id,
  cr.player_id
FROM public.suspensions s
JOIN public.championship_registrations cr ON cr.id = s.registration_id
WHERE s.served = false;
```

### `v_booked_players`

Players with at least one active yellow card (one away from suspension).

```sql
SELECT
  pcs.registration_id,
  pcs.active_yellow_cards,
  cr.championship_id,
  cr.player_id
FROM public.player_card_stats pcs
JOIN public.championship_registrations cr ON cr.id = pcs.registration_id
WHERE pcs.active_yellow_cards >= 1;
```

---

## App-layer Queries (TypeScript / Supabase client)

All queries run against the Supabase client — no RPC functions needed.

| Use case | Query target | Filter |
|---|---|---|
| Is player suspended for match X? | `v_suspended_players` | `registration_id = ? AND suspended_match_id = ?` |
| Is player booked (pendurado)? | `v_booked_players` | `registration_id = ?` |
| All suspended players in a match | `v_suspended_players` | `suspended_match_id = ?` |
| All booked players in a championship | `v_booked_players` | `championship_id = ?` |
| Reset active yellows (new phase) | `player_card_stats` (UPDATE) | `registration_id IN (SELECT id FROM championship_registrations WHERE championship_id = ?)` |

---

## RLS Policies

Follows the existing project pattern:

- **SELECT:** public (no auth required)
- **INSERT / UPDATE / DELETE:** authenticated users only

Applied to both `suspensions` and `player_card_stats`.

---

## Delivery

Single migration file: `supabase/migrations/TIMESTAMP_suspensions_and_card_stats.sql`

Contents:
1. Create `suspensions` table + indexes + RLS
2. Create `player_card_stats` table + index + RLS
3. Create views `v_suspended_players` and `v_booked_players`

No TypeScript types or service files are part of this spec — those follow in the business logic iteration.
