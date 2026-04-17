-- =============================================================================
-- Draft: active auction pot (leilão) — columns + RPC (fiscal/admin sem ampliar RLS)
-- =============================================================================

BEGIN;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS draft_auction_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_auction_pot_number integer,
  ADD COLUMN IF NOT EXISTS draft_auction_pot_position text;

COMMENT ON COLUMN public.championships.draft_auction_open IS
  'When true, the fiscal UI shows balances for the active pot auction.';
COMMENT ON COLUMN public.championships.draft_auction_pot_number IS
  'Active pot number (matches draft_pots / draft_pot_budgets).';
COMMENT ON COLUMN public.championships.draft_auction_pot_position IS
  'Active pot position label (matches draft_pots.position).';

ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS draft_auction_window_consistent;

ALTER TABLE public.championships
  ADD CONSTRAINT draft_auction_window_consistent CHECK (
    (draft_auction_open = false)
    OR (
      draft_auction_pot_number IS NOT NULL
      AND draft_auction_pot_position IS NOT NULL
      AND length(trim(draft_auction_pot_position)) > 0
    )
  );

CREATE OR REPLACE FUNCTION public.set_draft_auction_state(
  p_championship_id uuid,
  p_open boolean,
  p_pot_number integer,
  p_pot_position text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pos text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'auction_fiscal')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  pos := NULLIF(trim(COALESCE(p_pot_position, '')), '');

  IF p_open THEN
    IF p_pot_number IS NULL OR pos IS NULL THEN
      RAISE EXCEPTION 'invalid_pot' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.championships
  SET
    draft_auction_open = p_open,
    draft_auction_pot_number = CASE WHEN p_open THEN p_pot_number ELSE NULL END,
    draft_auction_pot_position = CASE WHEN p_open THEN pos ELSE NULL END
  WHERE id = p_championship_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'championship_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_draft_auction_state(uuid, boolean, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_draft_auction_state(uuid, boolean, integer, text) TO authenticated;

COMMIT;
