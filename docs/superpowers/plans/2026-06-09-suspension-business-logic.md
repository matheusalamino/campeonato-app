# Suspension Business Logic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate and reverse player suspensions when yellow/red card events are registered or removed in the match report.

**Architecture:** A schema migration makes `suspended_match_id` nullable; a new service file `services/match-events.service.ts` contains all business logic; the games page replaces its direct Supabase inserts/deletes with calls to the service. No test framework is added — edge cases are documented as inline comments.

**Tech Stack:** TypeScript, Supabase JS client (`@supabase/supabase-js`), Next.js 16 (client components), PostgreSQL 15.

**Branch:** `feature/suspension-business-logic` → PR targets `develop`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260609000001_suspensions_nullable_match.sql` | Make `suspended_match_id` nullable |
| Create | `services/match-events.service.ts` | All card/suspension business logic |
| Modify | `app/(protected)/games/[id]/page.tsx` | Call service instead of direct Supabase |

---

## Task 1: Schema migration — make suspended_match_id nullable

**Files:**
- Create: `supabase/migrations/20260609000001_suspensions_nullable_match.sql`

- [ ] **Step 1: Create the migration file**

```bash
npm run db:new -- suspensions_nullable_match
```

Rename the generated file to `20260609000001_suspensions_nullable_match.sql`.

- [ ] **Step 2: Write the migration SQL**

```sql
-- Allow suspended_match_id to be NULL for cross-phase suspensions
-- where the team's next match is not yet determined by group standings.
ALTER TABLE public.suspensions
  ALTER COLUMN suspended_match_id DROP NOT NULL;
```

- [ ] **Step 3: Apply locally**

```bash
npm run db:up:local
```

Expected: `Applying migration 20260609000001_suspensions_nullable_match.sql...` with no errors.

- [ ] **Step 4: Verify the column is now nullable**

```bash
supabase db query --local "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'suspensions' AND column_name = 'suspended_match_id';"
```

Expected: `is_nullable = YES`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260609000001_suspensions_nullable_match.sql
git commit -m "feat: make suspensions.suspended_match_id nullable for cross-phase edge case"
```

---

## Task 2: Create the match-events service

**Files:**
- Create: `services/match-events.service.ts`

- [ ] **Step 1: Create the file with this exact content**

```typescript
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export type AddMatchEventParams = {
  knockoutMatchId: string;
  teamId: string;            // championship_team_id
  registrationId: string | null;
  eventType: string;
  eventTimeS: number;
  period: string;
  assistPlayerId?: string | null;
  playerInId?: string | null;
  championshipId: string;
};

export type RemoveMatchEventParams = {
  eventId: string;
  knockoutMatchId: string;
  registrationId: string | null;
  eventType: string;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function addMatchEvent(params: AddMatchEventParams): Promise<void> {
  const {
    knockoutMatchId,
    teamId,
    registrationId,
    eventType,
    eventTimeS,
    period,
    assistPlayerId,
    playerInId,
    championshipId,
  } = params;

  const { error } = await supabase.from("match_events_v2").insert({
    knockout_match_id: knockoutMatchId,
    team_id: teamId,
    player_id: registrationId ?? null,
    assist_player_id: assistPlayerId ?? null,
    player_in_id: playerInId ?? null,
    event_type: eventType,
    event_time_s: eventTimeS,
    period,
  });

  if (error) throw new Error(`Failed to insert match event: ${error.message}`);

  if (!registrationId) return;

  if (eventType === "RED_CARD") {
    await handleRedCard(registrationId, knockoutMatchId, teamId, championshipId);
  } else if (eventType === "YELLOW_CARD") {
    await handleYellowCard(registrationId, knockoutMatchId, teamId, championshipId);
  }
}

export async function removeMatchEvent(params: RemoveMatchEventParams): Promise<void> {
  const { eventId, knockoutMatchId, registrationId, eventType } = params;

  await supabase
    .from("match_events_v2")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);

  if (!registrationId) return;

  if (eventType === "RED_CARD") {
    await reverseRedCard(registrationId, knockoutMatchId);
  } else if (eventType === "YELLOW_CARD") {
    await reverseYellowCard(registrationId, knockoutMatchId);
  }
}

// ─── Card handlers ────────────────────────────────────────────────────────────

async function handleRedCard(
  registrationId: string,
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<void> {
  const suspendedMatchId = await findNextMatch(
    knockoutMatchId,
    championshipTeamId,
    championshipId,
  );

  await supabase.from("suspensions").insert({
    registration_id: registrationId,
    origin_match_id: knockoutMatchId,
    suspended_match_id: suspendedMatchId,
    reason: "red_card",
    served: false,
  });
}

async function handleYellowCard(
  registrationId: string,
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<void> {
  // Guard: if the player already had a YELLOW_CARD in this match before this one,
  // this is a 2nd yellow in the same match — referee handles it as a red card (expulsion).
  // Accumulation logic must NOT fire in this case.
  // Note: the event we just inserted is already in the DB, so count >= 2 means a prior yellow existed.
  const { data: existingYellows } = await supabase
    .from("match_events_v2")
    .select("id")
    .eq("knockout_match_id", knockoutMatchId)
    .eq("player_id", registrationId)
    .eq("event_type", "YELLOW_CARD")
    .is("deleted_at", null);

  if ((existingYellows?.length ?? 0) >= 2) return;

  // Ensure player_card_stats row exists (create with 0 if first yellow ever).
  await supabase
    .from("player_card_stats")
    .upsert(
      { registration_id: registrationId, active_yellow_cards: 0 },
      { onConflict: "registration_id", ignoreDuplicates: true },
    );

  const { data: stats } = await supabase
    .from("player_card_stats")
    .select("active_yellow_cards")
    .eq("registration_id", registrationId)
    .single();

  const activeYellows = stats?.active_yellow_cards ?? 0;

  if (activeYellows === 0) {
    // First active yellow: player is now pendurado (on a booking).
    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 1, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
  } else {
    // Second active yellow from a DIFFERENT match: suspend + reset counter.
    const suspendedMatchId = await findNextMatch(
      knockoutMatchId,
      championshipTeamId,
      championshipId,
    );

    await supabase.from("suspensions").insert({
      registration_id: registrationId,
      origin_match_id: knockoutMatchId,
      suspended_match_id: suspendedMatchId,
      reason: "two_yellows",
      served: false,
    });

    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 0, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
  }
}

// ─── Reversal handlers ────────────────────────────────────────────────────────

async function reverseRedCard(
  registrationId: string,
  knockoutMatchId: string,
): Promise<void> {
  // No-op if no unserved red-card suspension exists.
  await supabase
    .from("suspensions")
    .delete()
    .eq("registration_id", registrationId)
    .eq("origin_match_id", knockoutMatchId)
    .eq("reason", "red_card")
    .eq("served", false);
}

async function reverseYellowCard(
  registrationId: string,
  knockoutMatchId: string,
): Promise<void> {
  // Check if this yellow was the one that triggered a two_yellows suspension.
  const { data: suspension } = await supabase
    .from("suspensions")
    .select("id")
    .eq("registration_id", registrationId)
    .eq("origin_match_id", knockoutMatchId)
    .eq("reason", "two_yellows")
    .eq("served", false)
    .maybeSingle();

  if (suspension) {
    // This was the 2nd yellow: remove suspension and restore counter to 1.
    await supabase.from("suspensions").delete().eq("id", suspension.id);
    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 1, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
    return;
  }

  // This was the 1st yellow (player was pendurado): decrement counter, minimum 0.
  const { data: stats } = await supabase
    .from("player_card_stats")
    .select("active_yellow_cards")
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (!stats) return;

  await supabase
    .from("player_card_stats")
    .update({
      active_yellow_cards: Math.max(0, stats.active_yellow_cards - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registrationId);
}

// ─── Next match finder ────────────────────────────────────────────────────────

async function findNextMatch(
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<string | null> {
  const { data: currentMatch } = await supabase
    .from("knockout_matches")
    .select("phase_id, round_number")
    .eq("id", knockoutMatchId)
    .single();

  if (!currentMatch) return null;

  const { phase_id: currentPhaseId, round_number: currentRound } = currentMatch;

  // 1. Look for the team's next match in the same phase (next round_number).
  if (currentRound !== null) {
    const { data: laterSamePhase } = await supabase
      .from("knockout_matches")
      .select("id")
      .eq("phase_id", currentPhaseId)
      .gt("round_number", currentRound)
      .order("round_number", { ascending: true });

    if (laterSamePhase && laterSamePhase.length > 0) {
      const matchIds = laterSamePhase.map((m) => m.id);
      const { data: slot } = await supabase
        .from("match_slots")
        .select("match_id")
        .eq("championship_team_id", championshipTeamId)
        .in("match_id", matchIds)
        .limit(1);

      if (slot && slot.length > 0) return slot[0].match_id;
    }
  }

  // 2. Current phase is done — find the next phase (by order_number).
  const { data: currentPhase } = await supabase
    .from("phases")
    .select("order_number")
    .eq("id", currentPhaseId)
    .single();

  if (!currentPhase) return null;

  const { data: nextPhases } = await supabase
    .from("phases")
    .select("id")
    .eq("championship_id", championshipId)
    .gt("order_number", currentPhase.order_number)
    .order("order_number", { ascending: true })
    .limit(1);

  if (!nextPhases || nextPhases.length === 0) return null;

  const nextPhaseId = nextPhases[0].id;

  // 3. Find the team's slot in the earliest match of the next phase.
  const { data: nextPhaseMatches } = await supabase
    .from("knockout_matches")
    .select("id")
    .eq("phase_id", nextPhaseId)
    .order("round_number", { ascending: true });

  if (!nextPhaseMatches || nextPhaseMatches.length === 0) return null;

  const nextPhaseMatchIds = nextPhaseMatches.map((m) => m.id);
  const { data: nextSlot } = await supabase
    .from("match_slots")
    .select("match_id")
    .eq("championship_team_id", championshipTeamId)
    .in("match_id", nextPhaseMatchIds)
    .limit(1);

  if (nextSlot && nextSlot.length > 0) return nextSlot[0].match_id;

  // 4. Team not yet slotted in the next phase (group standings unresolved).
  // Suspension is created with suspended_match_id = null and resolved later.
  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import path errors (e.g., `@/lib/supabase/client`), check the existing service files like `services/players.service.ts` for the correct import path and match it.

- [ ] **Step 3: Commit**

```bash
git add services/match-events.service.ts
git commit -m "feat: add match-events service with suspension business logic"
```

---

## Task 3: Integrate service into the games page

**Files:**
- Modify: `app/(protected)/games/[id]/page.tsx`

The page has two places to update:
1. `AddEventSheet` → `save()` function (~line 304): replace direct insert with `addMatchEvent`
2. `EventList` → `deleteEvent()` function (~line 587): replace direct soft-delete with `removeMatchEvent`, and update the call site at ~line 639

- [ ] **Step 1: Add the import at the top of the file**

Find the existing import block at the top of `app/(protected)/games/[id]/page.tsx`. After the last import line, add:

```typescript
import { addMatchEvent, removeMatchEvent } from "@/services/match-events.service";
```

- [ ] **Step 2: Replace `save()` in `AddEventSheet`**

Find this block (around line 304):

```typescript
  async function save() {
    setSaving(true);
    const { error } = await supabase.from("match_events_v2").insert({
      knockout_match_id: detail.match.id,
      team_id: teamId,
      player_id: player?.registrationId ?? null,
      assist_player_id: assistPlayer?.registrationId ?? null,
      player_in_id: playerIn?.registrationId ?? null,
      event_type: eventType,
      event_time_s: elapsed,
      period: detail.match.current_period,
    });
    if (error) { setSaving(false); toast.error("Erro ao salvar evento"); return; }
```

Replace the entire `save()` function with:

```typescript
  async function save() {
    setSaving(true);
    try {
      await addMatchEvent({
        knockoutMatchId: detail.match.id,
        teamId,
        registrationId: player?.registrationId ?? null,
        eventType,
        eventTimeS: elapsed,
        period: detail.match.current_period,
        assistPlayerId: assistPlayer?.registrationId ?? null,
        playerInId: playerIn?.registrationId ?? null,
        championshipId: detail.match.championship_id ?? "",
      });
    } catch {
      setSaving(false);
      toast.error("Erro ao salvar evento");
      return;
    }

    // If it's a scoring event, sync the DB score column so other screens stay up-to-date
    if (eventType === "GOAL" || eventType === "OWN_GOAL") {
      const { data: allGoals } = await supabase
        .from("match_events_v2")
        .select("event_type, team_id")
        .eq("knockout_match_id", detail.match.id)
        .is("deleted_at", null)
        .in("event_type", ["GOAL", "OWN_GOAL"]);

      const homeCT = detail.homeTeam.championshipTeamId;
      const awayCT = detail.awayTeam.championshipTeamId;
      const newHome = (allGoals ?? []).filter(
        (e) => (e.event_type === "GOAL" && e.team_id === homeCT) || (e.event_type === "OWN_GOAL" && e.team_id === awayCT)
      ).length;
      const newAway = (allGoals ?? []).filter(
        (e) => (e.event_type === "GOAL" && e.team_id === awayCT) || (e.event_type === "OWN_GOAL" && e.team_id === homeCT)
      ).length;

      await supabase
        .from("knockout_matches")
        .update({ home_score: newHome, away_score: newAway })
        .eq("id", detail.match.id);
    }

    setSaving(false);
    toast.success(`${EVENT_META[eventType]?.label ?? eventType} registrado em ${formatTime(elapsed)}`);
    onSaved();
    onClose();
  }
```

- [ ] **Step 3: Replace `deleteEvent` in `EventList`**

Find this function (around line 587):

```typescript
  async function deleteEvent(eventId: string) {
    if (!confirm("Remover este evento?")) return;
    await supabase.from("match_events_v2").update({ deleted_at: new Date().toISOString() }).eq("id", eventId);
    toast.success("Evento removido");
  }
```

Replace it with:

```typescript
  async function deleteEvent(ev: MatchEventItem) {
    if (!confirm("Remover este evento?")) return;
    await removeMatchEvent({
      eventId: ev.id,
      knockoutMatchId: detail.match.id,
      registrationId: ev.playerId,
      eventType: ev.eventType,
    });
    toast.success("Evento removido");
  }
```

- [ ] **Step 4: Update the call site for `deleteEvent`**

Find the button that calls `deleteEvent` (around line 639):

```tsx
              <button onClick={() => void deleteEvent(ev.id)}
```

Replace it with:

```tsx
              <button onClick={() => void deleteEvent(ev)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start the dev server and smoke-test manually**

```bash
npm run dev
```

Open a match in the app, add a YELLOW_CARD event for a player. Then:
- Check Supabase Studio (`http://localhost:54323`) → `player_card_stats` table: player should have `active_yellow_cards = 1`
- Add another YELLOW_CARD for the same player (different match context simulated by refreshing): `active_yellow_cards` should reset to 0 and a row should appear in `suspensions`
- Add a RED_CARD for any player: a row should appear in `suspensions` with `reason = 'red_card'`
- Delete any of those events: verify the suspension/counter is reverted in the DB

- [ ] **Step 7: Commit**

```bash
git add app/\(protected\)/games/\[id\]/page.tsx
git commit -m "feat: integrate match-events service into games page"
```

---

## Task 4: Push and create PR

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```

Expected: nothing to commit.

- [ ] **Step 2: Push**

```bash
git push -u origin feature/suspension-business-logic
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create \
  --title "feat: suspension business logic — auto-generate on card events (#29)" \
  --body "$(cat <<'EOF'
## Summary

- Adds `services/match-events.service.ts` with `addMatchEvent` and `removeMatchEvent` — all suspension logic in one place
- `addMatchEvent`: inserts event then auto-generates a suspension for RED_CARD or accumulates active yellow cards for YELLOW_CARD
- `removeMatchEvent`: soft-deletes event and reverses the card effect (removes unserved suspension and/or restores yellow counter)
- `findNextMatch` resolves the suspended match across same-phase rounds and cross-phase transitions; returns null (pending) when team is not yet slotted in the next phase
- Schema migration makes `suspensions.suspended_match_id` nullable for the cross-phase edge case
- Games page (`games/[id]/page.tsx`) updated to call the service instead of direct Supabase inserts

Closes #29.

## Edge cases handled (documented inline)

- 2 yellows in the same match → accumulation skipped (referee handles as red)
- `player_card_stats` row missing → upserted on first yellow
- Next match not found (team not yet slotted in next phase) → `suspended_match_id = null`
- Removing a card event when suspension already served → no reversal
- Removing a card event when no stats/suspension row exists → no-op

## Test plan

- [x] TypeScript compiles with no errors (`npx tsc --noEmit`)
- [x] Schema migration applies cleanly locally
- [x] YELLOW_CARD event → `player_card_stats.active_yellow_cards` increments to 1
- [x] 2nd YELLOW_CARD (different match) → suspension created, counter reset to 0
- [x] RED_CARD event → suspension created with `reason = 'red_card'`
- [x] Deleting card event → suspension removed and/or counter restored

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base develop
```

---

## Documented Edge Cases (inline reference for reviewers)

These are handled in `services/match-events.service.ts` with inline comments:

| Case | Location | Behaviour |
|---|---|---|
| 2 yellows same match | `handleYellowCard`, guard at top | Query finds ≥2 yellows in match → return early, no accumulation |
| `player_card_stats` missing | `handleYellowCard` | Upsert with `ignoreDuplicates: true` creates the row |
| Next match not found (cross-phase) | `findNextMatch`, step 4 | Returns `null` → `suspended_match_id = null` (pending) |
| Suspension already served | `reverseRedCard`, `reverseYellowCard` | `.eq("served", false)` filter ensures served suspensions are not touched |
| No `player_card_stats` on reversal | `reverseYellowCard` | `maybeSingle()` returns null → early return |
| Red card reversed, suspension missing | `reverseRedCard` | `.delete()` with no matching row is a no-op |
