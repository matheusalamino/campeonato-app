-- =============================================================================
-- Draft: qualification bid window (which pot is accepting blind bids)
-- =============================================================================

BEGIN;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS draft_qualification_window_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_qualification_pot_number integer,
  ADD COLUMN IF NOT EXISTS draft_qualification_pot_position text;

COMMENT ON COLUMN public.championships.draft_qualification_window_open IS
  'When true, team managers may submit one qualification bid for the active pot.';
COMMENT ON COLUMN public.championships.draft_qualification_pot_number IS
  'Pot number from draft_pots; must be set when window is open.';
COMMENT ON COLUMN public.championships.draft_qualification_pot_position IS
  'Position label from draft_pots.position; must match draft_pots when window is open.';

ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS draft_qualification_window_consistent;

ALTER TABLE public.championships
  ADD CONSTRAINT draft_qualification_window_consistent CHECK (
    (draft_qualification_window_open = false)
    OR (
      draft_qualification_pot_number IS NOT NULL
      AND draft_qualification_pot_position IS NOT NULL
      AND length(trim(draft_qualification_pot_position)) > 0
    )
  );

-- Admins can update championship rows (e.g. draft presentation controls).
CREATE POLICY "admin update championships"
  ON public.championships
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

COMMIT;
