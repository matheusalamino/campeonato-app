-- Optional pot context on balance ledger rows (filtro "Pote Atual" + relatórios).
BEGIN;

ALTER TABLE public.draft_balance_transactions
  ADD COLUMN IF NOT EXISTS pot_number integer,
  ADD COLUMN IF NOT EXISTS pot_position text;

COMMENT ON COLUMN public.draft_balance_transactions.pot_number IS
  'Pote ao qual a transação se refere, quando aplicável.';
COMMENT ON COLUMN public.draft_balance_transactions.pot_position IS
  'Posição do pote (rótulo draft_pots.position), quando aplicável.';

COMMIT;
