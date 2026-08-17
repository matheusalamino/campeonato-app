-- =============================================================================
-- Migration: Championship Management
-- Adiciona campos de datas, capacidade e lista de espera aos campeonatos,
-- restringe o status a um conjunto fixo e limita a escrita a administradores.
-- =============================================================================

BEGIN;

-- 1. Novas colunas
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS description               text,
  ADD COLUMN IF NOT EXISTS registration_start_date   timestamptz,
  ADD COLUMN IF NOT EXISTS registration_end_date     timestamptz,
  ADD COLUMN IF NOT EXISTS gala_night_date           timestamptz,
  ADD COLUMN IF NOT EXISTS tournament_start_date     timestamptz,
  ADD COLUMN IF NOT EXISTS max_players               int,
  ADD COLUMN IF NOT EXISTS max_waitlist_players      int NOT NULL DEFAULT 0;

-- 2. Constraints numéricas
ALTER TABLE public.championships
  ADD CONSTRAINT chk_max_players_positive
    CHECK (max_players IS NULL OR max_players > 0),
  ADD CONSTRAINT chk_max_waitlist_non_negative
    CHECK (max_waitlist_players >= 0);

-- 3. Normaliza status legados e adiciona o CHECK do conjunto permitido
UPDATE public.championships
  SET status = 'draft'
  WHERE status IS NULL
     OR status NOT IN ('draft','active','subscribing','subscribed','in_progress','completed');

ALTER TABLE public.championships
  ADD CONSTRAINT chk_championship_status
    CHECK (status IN ('draft','active','subscribing','subscribed','in_progress','completed'));

-- 4. RLS: escrita apenas para administradores (substitui a política de staff)
DROP POLICY IF EXISTS "championships staff write" ON public.championships;
CREATE POLICY "championships admin write"
  ON public.championships FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
