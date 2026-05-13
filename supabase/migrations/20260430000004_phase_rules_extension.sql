-- ── MÓDULO 3: CONFIGURAÇÕES DE FASE (MATA-MATA) ─────────────────────────────
-- Adiciona opções de prorrogação e pênaltis às configurações de fases knockout

-- 1. Estender phase_knockout_settings
ALTER TABLE public.phase_knockout_settings 
ADD COLUMN IF NOT EXISTS has_extra_time BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_penalties BOOLEAN DEFAULT true;

-- 2. Estender phases (opcional, mas útil para visualização rápida)
ALTER TABLE public.phases
ADD COLUMN IF NOT EXISTS points_win INTEGER,
ADD COLUMN IF NOT EXISTS points_draw INTEGER,
ADD COLUMN IF NOT EXISTS points_loss INTEGER;

COMMENT ON COLUMN public.phase_knockout_settings.has_extra_time IS 'Se a fase tem prorrogação em caso de empate';
COMMENT ON COLUMN public.phase_knockout_settings.has_penalties IS 'Se a fase tem disputa de pênaltis em caso de empate';
