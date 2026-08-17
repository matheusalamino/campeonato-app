# Design: Súmula Edit-in-Place, Prize Overrides, Responsive Public Pages

**Date:** 2026-06-17  
**Status:** Approved

---

## Feature 1: Súmula Edit-in-Place (completed matches)

### Problem
After a match reaches `COMPLETED` status, the event list becomes read-only (`readonly={isCompleted}`). The Add Event button is also hidden. There is no way to correct a wrong assist or misattributed event without accessing the DB directly.

### Solution
Add an edit (pencil) button to every event row in `EventList`, visible regardless of match status. Clicking opens a new `EditEventModal` component pre-populated with the event's current data.

### UI Changes — `app/(protected)/games/[id]/page.tsx`

- **`EventList`**: Remove the `readonly` prop-based guard on the trash button. Instead show:
  - Trash button: always visible (not just when not completed)
  - Pencil button: always visible
- **Add Event button**: Change guard from `isInProgress` to `!isCompleted` — admins can add events to completed matches too.
- **`EditEventModal`** (new component, same file or extracted): Reuses the same step-by-step wizard structure as `AddEventSheet`:
  1. Event type (pre-selected, changeable)
  2. Team (pre-selected, changeable)
  3. Player (pre-selected, changeable)
  4. Assist player picker — only for GOAL events (pre-selected if present)
  5. Confirm

### Data Flow
Edit = soft-delete old event + insert new event:
1. Call `removeMatchEvent({ eventId, ... })` — handles suspension reversal for cards
2. Call `addMatchEvent({ ..., eventTimeS: originalEvent.eventTimeS })` — timestamp preserved from original
3. If event type is a goal type, call `resyncScore()`

Card side-effects (suspension create/reverse) fire automatically via the existing service functions.

### Scope Boundary
- The modal does not allow changing which match or which team the event belongs to. Wrong-team events must be deleted and re-added.
- Event timestamp is pre-filled and read-only in the edit modal (keeps the timeline accurate).

---

## Feature 2: Admin Prize Overrides

### Problem
The Revelação (and other individual prizes) are determined algorithmically. When the group votes for prizes after the tournament, the result may differ from the algorithm. There is no way to record the voted winner so public pages reflect accurate data.

### Solution
A `championship_prize_overrides` table lets admins set a manual winner per prize. Public pages check overrides first and fall back to the algorithm.

### Database Migration
New table:

```sql
CREATE TABLE championship_prize_overrides (
  championship_id  uuid  NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  prize_key        text  NOT NULL CHECK (prize_key IN ('craque', 'goleiro', 'revelacao', 'tecnico')),
  registration_id  uuid  REFERENCES championship_registrations(id) ON DELETE SET NULL,
  PRIMARY KEY (championship_id, prize_key)
);

-- RLS: anon can read, authenticated can write
ALTER TABLE championship_prize_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON championship_prize_overrides FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "auth write" ON championship_prize_overrides FOR ALL TO authenticated USING (true);
```

### Admin UI
Location: new section inside `/championship/settings` page (or sub-page `/championship/settings/prizes`).

For each of the 4 prizes (`craque`, `goleiro`, `revelacao`, `tecnico`):
- Row showing: prize label + emoji + current algorithmic top player (greyed out)
- Override picker: searchable dropdown of all players registered in the championship
- "Clear" button to remove the override (sets row to null / deletes row)
- Save is immediate (upsert on select, no separate submit button)

### Public Pages
`usePublicRankings` fetches `championship_prize_overrides` alongside existing data. If an override row exists for a prize key:
- The overridden player is injected at rank 1 in the relevant ranking array; algorithmic results fill ranks 2+ (deduped so the override player doesn't also appear lower if they were already in the list)
- Displayed in `RankingsTab`, `PremiosTab`, and `PodiumBlock` with an optional "★ Premiado" badge to indicate it's a voted result

Algorithmic data is never modified — it's always preserved and visible if the override is cleared.

---

## Feature 3: Responsive Public Pages

### Problem
Public pages (landing, stats, live) were built primarily for desktop. On mobile (375px baseline) many components overflow horizontally, paddings are too wide, and multi-column layouts don't stack.

### Solution
Systematic Tailwind responsive pass across all public-facing components. Mobile baseline: 375px (iPhone SE). No new dependencies.

### Scope
**Landing group:**
- `LandingShell`, `LandingHeader`
- `HeroCarousel`, `HeroSection`
- `HomeNumbersBar`, `HomeTournamentCards`, `TopScorersPreview`
- `TournamentPageShell`, `TournamentSidebar`, `TournamentTabs`
- `PodiumBlock`, `BracketSection`
- `PremiosTab`, `FilteredRankingsTab`, `AllTimePanel`, `DisciplineTab`

**Public stats:** `PublicStatsPage`, `RankingsTab`, `StandingsTab`, `PlayersTab`, `RankingPodiumCard`, `StandingsCard`

**Public live:** `/live/[championshipId]/page.tsx`, `LiveCarousel`, `LiveMatchCard`

### Common Fixes Pattern
| Issue | Fix |
|-------|-----|
| Wide fixed paddings | `px-4 sm:px-8 md:px-14` |
| Multi-column grid that doesn't stack | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Horizontal overflow | `overflow-x-auto` wrapper |
| `TournamentSidebar` on mobile | Collapses to top dropdown/tab selector |
| `BracketSection` bracket tree | Horizontal scroll container |
| `HeroCarousel` images | `w-full object-cover` |

### What We Don't Change
- Admin/protected pages (not public-facing)
- Visual design language (dark theme, gold palette, typography choices)
- Tiny decorative labels (`text-[9px]`) — structural overflow only

---

## Out of Scope
- Editing match timestamps or match period assignments
- Bulk event import/export
- Prize history across multiple championships
- Admin pages responsive design
