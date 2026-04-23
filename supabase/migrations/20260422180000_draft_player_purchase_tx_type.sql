-- Tipo de lançamento para compra de jogador no leilão / draft (ledger + extrato).
BEGIN;

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
      'DRAFT_PLAYER_PURCHASE'
    )
  );

COMMIT;
