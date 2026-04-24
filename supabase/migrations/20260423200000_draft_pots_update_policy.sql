-- Fix: finalize-pot was silently failing to move unsold players to the "Pote Extra".
--
-- Root cause: draft_pots had RLS enabled but only SELECT, INSERT and DELETE
-- policies were defined. UPDATE operations issued by the finalize-pot API
-- (run as an authenticated admin user) were silently dropped by RLS —
-- no error raised, just 0 rows affected — so unsold players kept their
-- original pot_number/position.
--
-- This migration adds the missing UPDATE policy, restricted to staff
-- (admin + auction_fiscal) via the existing is_staff() helper, to match
-- the security model used across the rest of the draft_* tables.

DROP POLICY IF EXISTS "draft_pots staff update" ON public.draft_pots;

CREATE POLICY "draft_pots staff update"
  ON public.draft_pots
  FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
