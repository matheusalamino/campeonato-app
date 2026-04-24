BEGIN;

DROP POLICY IF EXISTS "dtf admin write" ON public.draft_transfers;
DROP POLICY IF EXISTS "dtf staff write" ON public.draft_transfers;

CREATE POLICY "dtf staff write"
  ON public.draft_transfers
  FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

COMMIT;

