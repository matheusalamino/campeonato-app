-- =============================================================================
-- Draft: melhorias de governança para saldo extra / potes extras
-- NOTE: criado sob demanda do fluxo de leilão; NÃO aplicado automaticamente.
-- =============================================================================

BEGIN;

-- 1) Permitir um tipo explícito para crédito extra geral
ALTER TABLE public.draft_balance_transactions
  DROP CONSTRAINT IF EXISTS draft_balance_transactions_type_check;

ALTER TABLE public.draft_balance_transactions
  ADD CONSTRAINT draft_balance_transactions_type_check CHECK (
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
      'ADDITIONAL_ROUND_PURCHASE',
      'DRAFT_PLAYER_PURCHASE',
      'EXTRA_BALANCE_CREDIT'
    )
  );

-- 2) Marcação explícita de pote extra (sobras)
ALTER TABLE public.draft_pots
  ADD COLUMN IF NOT EXISTS is_extra_pot boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_draft_pots_champ_extra
  ON public.draft_pots (championship_id, is_extra_pot, pot_order);

COMMENT ON COLUMN public.draft_pots.is_extra_pot IS
  'True when this row belongs to an extra pot created from leftovers.';

COMMIT;
