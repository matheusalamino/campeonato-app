# Suspensions & Card Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `suspensions` table, a `player_card_stats` table, and two read-only views (`v_suspended_players`, `v_booked_players`) to support yellow card accumulation tracking and automatic player suspensions.

**Architecture:** Single Supabase migration file that creates both tables with RLS policies and two views that join them with `championship_registrations`. No TypeScript types or service files are in scope — only the data model.

**Tech Stack:** PostgreSQL 15 (via Supabase), Supabase CLI, `npm run db:up:local` for local application.

**Branch:** `feature/suspensions-card-stats` → PR targets `develop`

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/20260609000000_suspensions_and_card_stats.sql` |

---

## Task 1: Start the local Supabase environment

- [ ] **Step 1: Start local Supabase**

```bash
npm run local:start
```

Expected: Supabase services start and Studio is available at `http://localhost:54323`.

- [ ] **Step 2: Sync local env vars**

```bash
npm run local:env
```

Expected: `.env.local` is written with the local Supabase credentials.

- [ ] **Step 3: Confirm tables do NOT exist yet (failing pre-check)**

Open Supabase Studio at `http://localhost:54323` → Table Editor, and confirm that `suspensions` and `player_card_stats` do not appear. Alternatively, run:

```bash
supabase db query --local "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('suspensions', 'player_card_stats');"
```

Expected output: 0 rows.

---

## Task 2: Create the migration file

- [ ] **Step 1: Generate migration stub**

```bash
npm run db:new -- suspensions_and_card_stats
```

Expected: A new file appears in `supabase/migrations/` named `<timestamp>_suspensions_and_card_stats.sql`. Rename it if needed so the timestamp prefix is `20260609000000`.

- [ ] **Step 2: Write the migration SQL**

Replace the generated file contents with:

```sql
-- =============================================================================
-- Migration: Suspensions and Player Card Stats
-- Creates suspensions table, player_card_stats table, and read-only views.
-- No business logic — data model only.
-- =============================================================================

BEGIN;

-- ── TABLE: suspensions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suspensions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  origin_match_id     UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  suspended_match_id  UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL CHECK (reason IN ('red_card', 'two_yellows')),
  served              BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suspensions_registration_id ON public.suspensions(registration_id);
CREATE INDEX idx_suspensions_suspended_match  ON public.suspensions(suspended_match_id);

ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public suspensions are viewable by everyone"
  ON public.suspensions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage suspensions"
  ON public.suspensions FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── TABLE: player_card_stats ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_card_stats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id      UUID NOT NULL UNIQUE REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  active_yellow_cards  INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_player_card_stats_registration ON public.player_card_stats(registration_id);

ALTER TABLE public.player_card_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public player card stats are viewable by everyone"
  ON public.player_card_stats FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage player card stats"
  ON public.player_card_stats FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── VIEW: v_suspended_players ────────────────────────────────────────────────
-- Unserved suspensions enriched with championship and player context.
-- Query pattern: WHERE registration_id = ? AND suspended_match_id = ?

CREATE OR REPLACE VIEW public.v_suspended_players AS
SELECT
  s.id                AS suspension_id,
  s.registration_id,
  s.suspended_match_id,
  s.reason,
  s.served,
  cr.championship_id,
  cr.player_id
FROM public.suspensions s
JOIN public.championship_registrations cr ON cr.id = s.registration_id
WHERE s.served = false;

-- ── VIEW: v_booked_players ───────────────────────────────────────────────────
-- Players with at least 1 active yellow card (one away from suspension).
-- Query pattern: WHERE registration_id = ? or WHERE championship_id = ?

CREATE OR REPLACE VIEW public.v_booked_players AS
SELECT
  pcs.registration_id,
  pcs.active_yellow_cards,
  cr.championship_id,
  cr.player_id
FROM public.player_card_stats pcs
JOIN public.championship_registrations cr ON cr.id = pcs.registration_id
WHERE pcs.active_yellow_cards >= 1;

COMMIT;
```

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260609000000_suspensions_and_card_stats.sql
git commit -m "feat: add suspensions and player_card_stats migration"
```

---

## Task 3: Apply and verify the migration locally

- [ ] **Step 1: Apply the migration**

```bash
npm run db:up:local
```

Expected output includes something like:
```
Applying migration 20260609000000_suspensions_and_card_stats.sql...
```
No errors.

- [ ] **Step 2: Verify both tables exist**

```bash
supabase db query --local "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('suspensions', 'player_card_stats') ORDER BY table_name;"
```

Expected:
```
 table_name
-------------------
 player_card_stats
 suspensions
(2 rows)
```

- [ ] **Step 3: Verify suspensions columns**

```bash
supabase db query --local "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suspensions' ORDER BY ordinal_position;"
```

Expected columns: `id`, `registration_id`, `origin_match_id`, `suspended_match_id`, `reason`, `served`, `created_at`.

- [ ] **Step 4: Verify player_card_stats columns**

```bash
supabase db query --local "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'player_card_stats' ORDER BY ordinal_position;"
```

Expected columns: `id`, `registration_id`, `active_yellow_cards`, `updated_at`.

- [ ] **Step 5: Verify CHECK constraint on reason**

```bash
supabase db query --local "INSERT INTO public.suspensions (registration_id, origin_match_id, suspended_match_id, reason) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'invalid_reason');"
```

Expected: Error containing `violates check constraint`. The insert must be rejected.

- [ ] **Step 6: Verify UNIQUE constraint exists on player_card_stats.registration_id**

```bash
supabase db query --local "
SELECT tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'player_card_stats'
  AND tc.constraint_type = 'UNIQUE'
  AND kcu.column_name = 'registration_id';
"
```

Expected: 1 row with `constraint_type = UNIQUE` and `column_name = registration_id`.

- [ ] **Step 7: Verify both views exist**

```bash
supabase db query --local "SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('v_suspended_players', 'v_booked_players') ORDER BY table_name;"
```

Expected:
```
    table_name
-------------------
 v_booked_players
 v_suspended_players
(2 rows)
```

- [ ] **Step 8: Verify views are queryable**

```bash
supabase db query --local "SELECT * FROM public.v_suspended_players LIMIT 5;"
supabase db query --local "SELECT * FROM public.v_booked_players LIMIT 5;"
```

Expected: Both return 0 rows (no data yet) without errors.

- [ ] **Step 9: Verify RLS is enabled on both tables**

```bash
supabase db query --local "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('suspensions', 'player_card_stats');"
```

Expected: `rowsecurity = true` for both.

---

## Task 4: Final commit and push

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```

Expected: nothing to commit (migration was committed in Task 2, Step 3).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/suspensions-card-stats
```

- [ ] **Step 3: Open the PR targeting develop**

```bash
gh pr create \
  --title "feat: add suspensions and player_card_stats data model (#25)" \
  --body "$(cat <<'EOF'
## Summary

- Adds `suspensions` table to track player suspensions (red card or two yellows), pointing to the specific match the player must sit out
- Adds `player_card_stats` table with a per-registration active yellow card counter (UNIQUE per registration, resets on phase change)
- Adds `v_suspended_players` view for efficient suspension lookup by match or registration
- Adds `v_booked_players` view for efficient booked-player (pendurado) lookup by championship

No business logic. No TypeScript types. Data model only — closes #25.

## Test plan

- [x] Migration applies cleanly via `npm run db:up:local`
- [x] `suspensions.reason` CHECK constraint rejects invalid values
- [x] `player_card_stats.registration_id` UNIQUE constraint enforced
- [x] Both views return correct columns and are queryable
- [x] RLS enabled on both tables (public SELECT, authenticated ALL)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base develop
```

---

## Query Reference (for future business logic iteration)

These are the exact Supabase client queries the app will use, documented here for the engineer implementing the next iteration.

**Is player suspended for a specific match?**
```typescript
const { data } = await supabase
  .from('v_suspended_players')
  .select('suspension_id, reason')
  .eq('registration_id', registrationId)
  .eq('suspended_match_id', matchId)
  .maybeSingle()
// data !== null → player is suspended
```

**Is player booked (pendurado)?**
```typescript
const { data } = await supabase
  .from('v_booked_players')
  .select('active_yellow_cards')
  .eq('registration_id', registrationId)
  .maybeSingle()
// data !== null → player is booked
```

**All suspended players in a match:**
```typescript
const { data } = await supabase
  .from('v_suspended_players')
  .select('registration_id, reason, player_id')
  .eq('suspended_match_id', matchId)
```

**All booked players in a championship:**
```typescript
const { data } = await supabase
  .from('v_booked_players')
  .select('registration_id, player_id, active_yellow_cards')
  .eq('championship_id', championshipId)
```

**Reset active yellows for a new phase (run as authenticated):**
```typescript
// Get all registration IDs for the championship first
const { data: regs } = await supabase
  .from('championship_registrations')
  .select('id')
  .eq('championship_id', championshipId)

const registrationIds = regs.map(r => r.id)

await supabase
  .from('player_card_stats')
  .update({ active_yellow_cards: 0, updated_at: new Date().toISOString() })
  .in('registration_id', registrationIds)
```
