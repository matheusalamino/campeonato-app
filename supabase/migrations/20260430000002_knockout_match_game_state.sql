-- =============================================================================
-- Migration: Knockout Match Game State
-- Transforma knockout_matches na tabela principal de controle de partidas:
--   - status do jogo (NOT_STARTED / IN_PROGRESS / COMPLETED)
--   - placar (home_score / away_score)
--   - championship_id direto (necessário para o unique index de jogo ativo)
--   - máquina de estados de período (cronômetro)
--   - pênaltis
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. championship_id direto (necessário para o unique index por campeonato)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.knockout_matches
  ADD COLUMN IF NOT EXISTS championship_id UUID
    REFERENCES public.championships(id) ON DELETE CASCADE;

-- Preenche retroativamente via phases
UPDATE public.knockout_matches km
SET championship_id = p.championship_id
FROM public.phases p
WHERE km.phase_id = p.id
  AND km.championship_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_knockout_matches_championship
  ON public.knockout_matches (championship_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Status e placar
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.knockout_matches
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  ADD COLUMN IF NOT EXISTS home_score   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_score   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Índice parcial: garante no máximo 1 jogo IN_PROGRESS por campeonato
CREATE UNIQUE INDEX IF NOT EXISTS one_active_match_per_championship
  ON public.knockout_matches (championship_id)
  WHERE status = 'IN_PROGRESS';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Máquina de estados de período (cronômetro)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.knockout_matches
  ADD COLUMN IF NOT EXISTS current_period     TEXT NOT NULL DEFAULT 'not_started'
    CHECK (current_period IN (
      'not_started',
      'period_1',
      'halftime',
      'period_2',
      'extra_1',
      'extra_halftime',
      'extra_2',
      'penalties',
      'finished'
    )),
  -- Quando o período atual foi iniciado (para cálculo do elapsed = now - period_started_at)
  ADD COLUMN IF NOT EXISTS period_started_at  TIMESTAMPTZ,
  -- Duração real (em segundos) de cada período ao encerrar
  ADD COLUMN IF NOT EXISTS period_1_duration_s  INT,
  ADD COLUMN IF NOT EXISTS period_2_duration_s  INT,
  ADD COLUMN IF NOT EXISTS extra_1_duration_s   INT,
  ADD COLUMN IF NOT EXISTS extra_2_duration_s   INT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pênaltis
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.knockout_matches
  ADD COLUMN IF NOT EXISTS penalty_winner_team_id UUID
    REFERENCES public.championship_teams(id),
  ADD COLUMN IF NOT EXISTS penalty_home_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_away_score INT NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — seguindo padrão do projeto
-- ─────────────────────────────────────────────────────────────────────────────
-- knockout_matches já tem RLS habilitado (migration 20260423123000)
-- As policies existentes de public read e auth write continuam válidas.

COMMIT;
