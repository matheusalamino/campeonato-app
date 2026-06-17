BEGIN;

-- override_value stores registration_id for player prizes (craque, goleiro, revelacao)
-- and championship_team_id for the tecnico prize.
-- No FK constraint intentionally — allows storing either entity type.
CREATE TABLE public.championship_prize_overrides (
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  prize_key       text NOT NULL CHECK (prize_key IN ('craque', 'goleiro', 'revelacao', 'tecnico')),
  override_value  uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (championship_id, prize_key)
);

ALTER TABLE public.championship_prize_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON public.championship_prize_overrides
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "auth_write" ON public.championship_prize_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.championship_prize_overrides TO anon, authenticated;

COMMIT;
