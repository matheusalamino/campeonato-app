-- =============================================================================
-- organizer_evaluations: CRUD completo para usuários com profile.role = 'evaluator'
-- -----------------------------------------------------------------------------
-- 1. Helper SECURITY DEFINER `is_evaluator()` (mesmo padrão de `is_admin` /
--    `is_staff`) para evitar recursão de RLS ao consultar `public.profiles`.
-- 2. Policy `FOR ALL` em `public.organizer_evaluations` permitindo SELECT /
--    INSERT / UPDATE / DELETE para quem for evaluator.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_evaluator() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'evaluator'
  );
$$;

REVOKE ALL ON FUNCTION public.is_evaluator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_evaluator() TO authenticated;

DROP POLICY IF EXISTS "orgeval evaluator crud" ON public.organizer_evaluations;

CREATE POLICY "orgeval evaluator crud"
  ON public.organizer_evaluations
  FOR ALL
  TO authenticated
  USING (public.is_evaluator())
  WITH CHECK (public.is_evaluator());
