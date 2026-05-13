-- =============================================================================
-- Migration: Championship Global Settings
-- Adiciona configurações globais de pontuação e formato de jogo
-- ao campeonato, consumidas pelas telas de config e pelo cronômetro.
-- =============================================================================

BEGIN;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS points_win       INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS points_draw      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS points_loss      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periods_count    INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS period_duration  INT NOT NULL DEFAULT 7;

-- Constraints de validação
ALTER TABLE public.championships
  ADD CONSTRAINT chk_points_win_positive       CHECK (points_win >= 0),
  ADD CONSTRAINT chk_points_draw_positive      CHECK (points_draw >= 0),
  ADD CONSTRAINT chk_points_loss_positive      CHECK (points_loss >= 0),
  ADD CONSTRAINT chk_points_win_gt_draw        CHECK (points_win >= points_draw),
  ADD CONSTRAINT chk_periods_count_range       CHECK (periods_count BETWEEN 1 AND 4),
  ADD CONSTRAINT chk_period_duration_range     CHECK (period_duration BETWEEN 1 AND 60);

COMMIT;
