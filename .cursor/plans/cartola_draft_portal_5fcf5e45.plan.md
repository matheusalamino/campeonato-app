---
name: Team Manager Draft Portal
overview: Build a mobile-first team manager portal with 4 screens (dashboard hub, balance/extract, team field view, player search/favorites) plus modals for blind bids and special card, backed by polling for real-time updates and an atomic RPC for special card race conditions.
todos:
  - id: db-migration
    content: "Create SQL migration: add user_id to managers, create draft_player_favorites, create activate_special_card RPC"
    status: pending
  - id: install-shadcn
    content: "Install shadcn components: slider, tabs, sheet"
    status: pending
  - id: team-manager-layout
    content: Create (team-manager) route group with layout.tsx (auth + manager check + context provider)
    status: pending
  - id: draft-session-hook
    content: Create useDraftSession polling hook and TeamManagerDraftContext
    status: pending
  - id: dashboard-page
    content: Build /team-manager dashboard page with action cards grid and balance display
    status: pending
  - id: join-bid-modal
    content: Build Join Bid modal (pot qualification) with slider + API route
    status: pending
  - id: special-card-flow
    content: Build special card activation button + bid modal + atomic RPC call + API route
    status: pending
  - id: balance-page
    content: Build /team-manager/balance page with balance cards and transaction extract
    status: pending
  - id: team-page
    content: Build /team-manager/squad page with football field layout and player cards
    status: pending
  - id: players-page
    content: Build /team-manager/search-and-favorite-players page with search, filters, tabs, and favorites
    status: pending
isProject: false
---

# Team Manager Draft Portal

## Naming Conventions

- All code identifiers (routes, files, folders, components, hooks, types) are in **English**
- Only user-facing display text (labels, titles, toasts, descriptions) is in **Portuguese**
- "Cartola" in code -> `TeamManager` / `team-manager`
- "Habilitacao" in code -> `Join` / `join`

## Architecture Overview

```mermaid
flowchart TD
    subgraph routeGroup ["(team-manager) Route Group"]
        Layout["layout.tsx — Auth + Manager check"]
        Dashboard["/team-manager — Action Hub"]
        Balance["/team-manager/balance — Balance + Extract"]
        Squad["/team-manager/squad — Team Field View"]
        Players["/team-manager/search-and-favorite-players — Player Search"]
    end

    Layout --> Dashboard
    Dashboard -->|"navigate"| Balance
    Dashboard -->|"navigate"| Squad
    Dashboard -->|"navigate"| Players
    Dashboard -->|"modal"| JoinModal["Join Bid Modal"]
    Dashboard -->|"modal"| SCActivate["Special Card Activation"]
    SCActivate -->|"modal"| SCBid["Special Card Bid Modal"]

    subgraph polling ["Polling Hook (3s interval)"]
        BalanceData["General Balance"]
        PotData["Pot Budget"]
        TeamCount["Team Player Count"]
        CardStatus["Special Card Status"]
        AuctionPlayer["Current Auctioned Player"]
    end

    Dashboard -.->|"useDraftSession"| polling
```

---

## 1. DB Migration

### 1a. Link managers to auth users

Add `user_id` column on `managers` table to connect a Supabase Auth user to their manager identity.

```sql
ALTER TABLE public.managers
  ADD COLUMN user_id uuid UNIQUE REFERENCES auth.users(id);
```

Admin will manually assign Supabase Auth accounts to managers (set `user_id` after creating the user).

### 1b. Player favorites table

```sql
CREATE TABLE public.draft_player_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_manager_id uuid NOT NULL REFERENCES public.championship_managers(id),
  registration_id uuid NOT NULL REFERENCES public.championship_registrations(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (championship_manager_id, registration_id)
);
```

### 1c. Supabase RPC for atomic special card activation

A database function that handles the race condition when two managers press the special card button simultaneously. It enforces **three rules atomically**:

1. The manager has not already used their card in this championship
2. No other manager has already activated a card for the **same player currently being auctioned** (`target_registration_id`)

Uses the existing UNIQUE constraint `(activated_by_cm_id, championship_id)` plus explicit checks with `FOR UPDATE` row locking.

```sql
CREATE OR REPLACE FUNCTION activate_special_card(
  p_championship_id uuid,
  p_cm_id uuid,
  p_pot_number integer,
  p_pot_position text,
  p_target_registration_id uuid
) RETURNS json AS $$
DECLARE
  v_already_used boolean;
  v_player_card_exists boolean;
  v_new_id uuid;
BEGIN
  -- 1. Check if this manager already used their card in this championship
  SELECT EXISTS(
    SELECT 1 FROM draft_special_card_uses
    WHERE championship_id = p_championship_id
      AND activated_by_cm_id = p_cm_id
    FOR UPDATE
  ) INTO v_already_used;

  IF v_already_used THEN
    RETURN json_build_object('success', false, 'reason', 'card_already_used');
  END IF;

  -- 2. Check if another manager already activated a card for this player
  SELECT EXISTS(
    SELECT 1 FROM draft_special_card_uses
    WHERE championship_id = p_championship_id
      AND target_registration_id = p_target_registration_id
    FOR UPDATE
  ) INTO v_player_card_exists;

  IF v_player_card_exists THEN
    RETURN json_build_object('success', false, 'reason', 'player_already_has_card');
  END IF;

  -- 3. Insert (unique constraint is the final safety net)
  INSERT INTO draft_special_card_uses (
    championship_id, activated_by_cm_id, pot_number,
    pot_position, target_registration_id, result
  ) VALUES (
    p_championship_id, p_cm_id, p_pot_number,
    p_pot_position, p_target_registration_id, 'purchased'
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'id', v_new_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'reason', 'card_already_used');
END;
$$ LANGUAGE plpgsql;
```

---

## 2. Install shadcn components

Need to add via CLI: **Slider**, **Tabs**, **Sheet** (mobile-friendly bottom drawer).

```bash
npx shadcn@latest add slider tabs sheet
```

Existing components already available: Dialog, Button, Badge, Card, Input, Select, Label.

---

## 3. Route Group and Layout

### File: `app/(team-manager)/layout.tsx`

Server component layout that:
1. Calls `getUserRole()` from [lib/auth.ts](lib/auth.ts) -- redirect to `/login` if unauthenticated
2. Verifies `role === 'manager'` -- redirect if not a manager
3. Fetches the manager record linked to the user via `managers.user_id`
4. Fetches `championship_managers` to find which championship the manager belongs to
5. Wraps children in a `TeamManagerDraftProvider` context (provides `managerId`, `championshipManagerId`, `championshipId`)

Layout shell: **no sidebar**, full-screen dark background, bottom-safe padding for mobile, a simple top header bar with the manager's name/team and back navigation.

```
(team-manager)/
  layout.tsx
  team-manager/
    page.tsx            -- Dashboard hub
    balance/
      page.tsx          -- Balance + extract
    squad/
      page.tsx          -- Team field view
    search-and-favorite-players/
      page.tsx          -- Player search + favorites
```

All routes render at `/team-manager`, `/team-manager/balance`, `/team-manager/squad`, `/team-manager/search-and-favorite-players`.

---

## 4. Main Dashboard — `/team-manager`

Client component. **Mobile-first grid of action cards** with the current balance prominently displayed at the top.

### Layout (mobile):
- Top: Manager name + team badge + general balance (large number)
- Below: Current pot info badge (e.g., "Pote 2 — ATA em andamento")
- Grid of action cards (2 columns on mobile, 3 on tablet/desktop):
  1. **Saldo e Extrato** — navigates to `/team-manager/balance`
  2. **Lance de Habilitacao** — opens JoinBidModal (inline)
  3. **Carta Especial** — activates card / opens bid modal
  4. **Meu Time** — navigates to `/team-manager/squad` — shows player count badge (e.g., "4/10")
  5. **Jogadores** — navigates to `/team-manager/search-and-favorite-players`

### Polling — `useDraftSession` hook

Custom hook in `features/hooks/useDraftSession.ts`:
- `setInterval` every 3 seconds calling a data-fetching function
- Fetches via browser Supabase client in a single batch:
  - `championship_managers` row (current_balance, initial_balance)
  - `draft_pot_budgets` for the active pot (remaining_budget)
  - `championship_team_players` count for this manager's team
  - `draft_special_card_uses` to check if card has been used **by this manager** (hasUsedSpecialCard)
  - `draft_special_card_uses` to check if a card has been used **for the current auctioned player** (playerHasActiveCard)
  - `draft_player_purchases` count
- Returns: `{ balance, potBudget, teamCount, hasUsedSpecialCard, playerHasActiveCard, isLoading, ... }`
- Cleans up interval on unmount

### JoinBidModal (Pot Qualification)

Uses shadcn **Dialog** component:
- Title: "Lance de Habilitacao — Pote X (ATA)"
- **Slider** component from CC$1,000 to `currentBalance` (step CC$1,000)
- Display of selected amount in large gold text
- "Confirmar Lance" button
- POST to `/api/draft/join-pot-bid` which inserts into `draft_qualification_bids` + creates a `POT_BID_RESERVE` transaction + updates `current_balance`

### Special Card Flow

**Button is DISABLED when any of these conditions is true:**
- Manager has already used their card in this championship (`hasUsedSpecialCard`)
- Another manager already activated a card for the player currently being auctioned (`playerHasActiveCard`)
- No player is currently being auctioned (no active auction context)
- Manager's team is already full (10 players)

**Button is ENABLED only when ALL of these are true:**
- Manager has NOT used their card yet
- A player IS currently being auctioned
- NO other card has been activated for this player
- Manager has available budget in the pot

Two-step UI:
1. **Activate button** on dashboard — calls Supabase RPC `activate_special_card` (atomic, handles race condition)
   - On success: toast "Carta Especial ativada!" and opens the bid modal
   - On failure (card_already_used): toast "Voce ja usou sua Carta Especial"
   - On failure (player_already_has_card): toast "Outro cartola ja ativou a Carta Especial para este jogador"
2. **SpecialCardBidModal** (Dialog):
   - Slider from CC$0 to `potBudget.remaining_budget` (step CC$1,000)
   - 20-second countdown timer displayed prominently
   - "Confirmar Lance" button
   - POST to `/api/draft/special-card-bid`

---

## 5. Balance Page — `/team-manager/balance`

Client component with two sections:

### Top section: Balance cards
- **General Balance**: large number card showing `current_balance` / `initial_balance`
- **Pot Budget** (if active): remaining_budget / initial_budget with a progress bar

### Bottom section: Transaction extract
- Fetches `draft_balance_transactions` ordered by `created_at DESC`
- Each row: icon by type + description + amount (green for credit, red for debit) + timestamp
- Filter tabs: "Todos" | "Pote Atual"

Uses existing pattern: `useEffect` + Supabase browser client, similar to [features/hooks/useManagers.ts](features/hooks/useManagers.ts).

---

## 6. Squad Page — `/team-manager/squad`

Client component with a **football field SVG/CSS layout**.

### Field layout:
```
           [  GOL  ]         <-- 1 slot
        [ ZAG ][ ZAG ]       <-- flexible row
     [ MEI ][ MEI ][ MEI ]   <-- flexible row
        [ ATA ][ ATA ]       <-- flexible row
```

- Fetch `championship_team_players` joined with `championship_registrations` -> `players` for this manager's championship_team
- Also fetch `draft_player_purchases` to show purchase price on each card
- Each player: circular avatar/initials + name + overall + position badge + purchase price
- Empty slots shown as dashed circles with "?"
- Counter: "4/10 jogadores" with position breakdown

The field background uses CSS gradients (green pitch with white lines), responsive sizing via `aspect-ratio` and viewport units.

---

## 7. Players Page — `/team-manager/search-and-favorite-players`

Client component with search, filters, and favorites.

### Top: Search + Filters
- **Input** for name search (debounced 300ms)
- **Select** dropdown for position filter (Todos, GOL, ZAG, MEIA, ATA)
- Overall range display

### Content area: **Tabs** (shadcn)
- **Tab "Todos"**: Full player list from `championship_registrations` + `players`
- **Tab "Favoritos"**: Only favorited players

### Player card:
- Name, position badge (colored), overall number
- Star/heart button to toggle favorite
- Favorites persisted to `draft_player_favorites` table

Data fetching: single load of all registrations for the championship, filtered client-side for search/position. Favorites loaded separately and merged.

---

## 8. API Routes

New API routes following the existing pattern in [app/api/draft/](app/api/draft/):

- **`POST /api/draft/join-pot-bid`** — submit pot qualification bid, reserve balance
- **`POST /api/draft/special-card-bid`** — submit special card blind bid
- **`GET /api/draft/session`** — single endpoint for polling (returns balance, pot budget, team count, card status, current auctioned player card status in one response)

All use `createClient()` from [lib/supabase/server.ts](lib/supabase/server.ts) following the existing API route pattern.

---

## 9. New Hooks and Context

- **`features/hooks/useDraftSession.ts`** — polling hook (3s interval) for dashboard real-time data
- **`components/TeamManagerDraftContext.tsx`** — context providing `championshipManager`, `championship`, `manager` data from the server layout down to all client components

---

## 10. File Structure Summary

```
app/(team-manager)/
  layout.tsx
  team-manager/
    page.tsx
    balance/
      page.tsx
    squad/
      page.tsx
    search-and-favorite-players/
      page.tsx
components/
  team-manager/
    DashboardCard.tsx
    BalanceDisplay.tsx
    JoinBidModal.tsx
    SpecialCardButton.tsx
    SpecialCardBidModal.tsx
    FootballField.tsx
    PlayerSearchCard.tsx
    TransactionItem.tsx
  TeamManagerDraftContext.tsx
features/hooks/
  useDraftSession.ts
app/api/draft/
  join-pot-bid/route.ts
  special-card-bid/route.ts
  session/route.ts
types/
  draft-favorites.ts
supabase/migrations/
  20260412_team_manager_portal.sql
```
