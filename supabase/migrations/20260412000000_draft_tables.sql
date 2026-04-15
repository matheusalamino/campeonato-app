-- =============================================================================
-- Migration: Draft Tables for Copa do Mundo Sorocaba 2026
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ALTER championship_managers — add draft-state columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.championship_managers
  ADD COLUMN IF NOT EXISTS initial_balance integer NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS current_balance integer NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS draft_sort_order integer;

-- ---------------------------------------------------------------------------
-- 2. draft_balance_transactions — general balance audit ledger
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_balance_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  reference_id uuid,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_balance_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT draft_balance_transactions_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_balance_transactions_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_balance_transactions_type_check CHECK (
    type IN (
      'INITIAL_BALANCE',
      'POT_BID_RESERVE',
      'POT_BID_REFUND',
      'GOALKEEPER_PURCHASE',
      'FINE_NO_BID_GOALKEEPER',
      'FINE_NO_BID_PLAYER',
      'FINE_REMAINING_BUDGET',
      'FINE_OVER_BUDGET',
      'FINE_MANUAL',
      'POT_BUDGET_RETURN',
      'ADDITIONAL_ROUND_PURCHASE'
    )
  )
);

CREATE INDEX idx_dbt_cm ON public.draft_balance_transactions (championship_manager_id);
CREATE INDEX idx_dbt_championship ON public.draft_balance_transactions (championship_id);

-- ---------------------------------------------------------------------------
-- 3. draft_qualification_bids — blind bids for pot habilitacao
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_qualification_bids (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  pot_number integer NOT NULL,
  pot_position text NOT NULL,
  bid_amount integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  qualified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_qualification_bids_pkey PRIMARY KEY (id),
  CONSTRAINT draft_qualification_bids_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_qualification_bids_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_qualification_bids_min_amount CHECK (bid_amount >= 1000),
  CONSTRAINT draft_qualification_bids_unique
    UNIQUE (championship_manager_id, championship_id, pot_number, pot_position)
);

CREATE INDEX idx_dqb_championship ON public.draft_qualification_bids (championship_id);

-- ---------------------------------------------------------------------------
-- 4. draft_pot_budgets — per-pot budget tracking for qualified cartolas
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_pot_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  pot_number integer NOT NULL,
  pot_position text NOT NULL,
  initial_budget integer NOT NULL,
  remaining_budget integer NOT NULL,
  fine_amount integer NOT NULL DEFAULT 0,
  returned_amount integer NOT NULL DEFAULT 0,
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_pot_budgets_pkey PRIMARY KEY (id),
  CONSTRAINT draft_pot_budgets_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_pot_budgets_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_pot_budgets_unique
    UNIQUE (championship_manager_id, championship_id, pot_number, pot_position)
);

CREATE INDEX idx_dpb_championship ON public.draft_pot_budgets (championship_id);

-- ---------------------------------------------------------------------------
-- 5. draft_special_card_uses — special card activations
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_special_card_uses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  activated_by_cm_id uuid NOT NULL,
  pot_number integer NOT NULL,
  pot_position text NOT NULL,
  target_registration_id uuid NOT NULL,
  won_by_cm_id uuid,
  winning_bid_amount integer,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_special_card_uses_pkey PRIMARY KEY (id),
  CONSTRAINT draft_special_card_uses_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_special_card_uses_activated_by_fkey
    FOREIGN KEY (activated_by_cm_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_special_card_uses_won_by_fkey
    FOREIGN KEY (won_by_cm_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_special_card_uses_registration_fkey
    FOREIGN KEY (target_registration_id) REFERENCES public.championship_registrations(id),
  CONSTRAINT draft_special_card_uses_result_check CHECK (
    result IN ('purchased', 'returned_to_auction')
  ),
  CONSTRAINT draft_special_card_uses_unique_activation
    UNIQUE (activated_by_cm_id, championship_id)
);

-- ---------------------------------------------------------------------------
-- 6. draft_special_card_bids — blind bids during special card auction
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_special_card_bids (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  special_card_use_id uuid NOT NULL,
  bid_amount integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_special_card_bids_pkey PRIMARY KEY (id),
  CONSTRAINT draft_special_card_bids_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_special_card_bids_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_special_card_bids_use_fkey
    FOREIGN KEY (special_card_use_id) REFERENCES public.draft_special_card_uses(id),
  CONSTRAINT draft_special_card_bids_min_amount CHECK (bid_amount >= 0),
  CONSTRAINT draft_special_card_bids_unique
    UNIQUE (special_card_use_id, championship_manager_id)
);

-- ---------------------------------------------------------------------------
-- 7. draft_player_purchases — player purchase records with prices
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_player_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  pot_number integer NOT NULL,
  pot_position text NOT NULL,
  purchase_price integer NOT NULL,
  purchase_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_player_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT draft_player_purchases_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_player_purchases_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_player_purchases_registration_fkey
    FOREIGN KEY (registration_id) REFERENCES public.championship_registrations(id),
  CONSTRAINT draft_player_purchases_type_check CHECK (
    purchase_type IN ('open_auction', 'special_card', 'additional_round')
  ),
  CONSTRAINT draft_player_purchases_min_price CHECK (purchase_price >= 0)
);

CREATE INDEX idx_dpp_cm ON public.draft_player_purchases (championship_manager_id);
CREATE INDEX idx_dpp_championship ON public.draft_player_purchases (championship_id);

-- ---------------------------------------------------------------------------
-- 8. draft_fines — all fine types (automatic and manual)
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_fines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  championship_manager_id uuid NOT NULL,
  type text NOT NULL,
  amount integer NOT NULL,
  pot_number integer,
  pot_position text,
  description text,
  is_automatic boolean NOT NULL DEFAULT true,
  occurrence_number integer,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_fines_pkey PRIMARY KEY (id),
  CONSTRAINT draft_fines_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_fines_cm_fkey
    FOREIGN KEY (championship_manager_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_fines_applied_by_fkey
    FOREIGN KEY (applied_by) REFERENCES public.profiles(id),
  CONSTRAINT draft_fines_type_check CHECK (
    type IN (
      'no_bid_goalkeeper',
      'no_bid_player',
      'remaining_budget',
      'over_budget',
      'manual'
    )
  ),
  CONSTRAINT draft_fines_positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_df_cm ON public.draft_fines (championship_manager_id);
CREATE INDEX idx_df_championship ON public.draft_fines (championship_id);

-- ---------------------------------------------------------------------------
-- 9. draft_transfers — transfer window 1:1 swaps
-- ---------------------------------------------------------------------------
CREATE TABLE public.draft_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  manager_a_cm_id uuid NOT NULL,
  manager_b_cm_id uuid NOT NULL,
  player_a_registration_id uuid NOT NULL,
  player_b_registration_id uuid NOT NULL,
  registered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT draft_transfers_championship_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT draft_transfers_manager_a_fkey
    FOREIGN KEY (manager_a_cm_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_transfers_manager_b_fkey
    FOREIGN KEY (manager_b_cm_id) REFERENCES public.championship_managers(id),
  CONSTRAINT draft_transfers_player_a_fkey
    FOREIGN KEY (player_a_registration_id) REFERENCES public.championship_registrations(id),
  CONSTRAINT draft_transfers_player_b_fkey
    FOREIGN KEY (player_b_registration_id) REFERENCES public.championship_registrations(id),
  CONSTRAINT draft_transfers_registered_by_fkey
    FOREIGN KEY (registered_by) REFERENCES public.profiles(id)
);

CREATE INDEX idx_dt_championship ON public.draft_transfers (championship_id);

COMMIT;
