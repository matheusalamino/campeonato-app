BEGIN;

-- Configuração do carrossel do telão por campeonato.
-- NULL = usar o padrão do código (resolveCarouselConfig).
-- Formato: array ordenado de { id, durationMs, enabled }.
ALTER TABLE public.championships ADD COLUMN IF NOT EXISTS carousel_config JSONB;

COMMIT;
