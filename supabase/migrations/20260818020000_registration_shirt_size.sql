-- =============================================================================
-- Migration: tamanho de camiseta por inscricao
-- A camiseta e encomendada por edicao do campeonato, entao o tamanho vive na
-- inscricao, e nao no jogador: guardar so o tamanho corrente faria o pedido da
-- edicao passada passar a mentir assim que ele mudasse de tamanho.
-- =============================================================================
BEGIN;

ALTER TABLE public.championship_registrations
  ADD COLUMN IF NOT EXISTS shirt_size text;

-- DROP antes do ADD: `ADD CONSTRAINT IF NOT EXISTS` nao existe no Postgres.
-- E o mesmo padrao que a migration do status do campeonato ja usa.
ALTER TABLE public.championship_registrations
  DROP CONSTRAINT IF EXISTS chk_registration_shirt_size;
ALTER TABLE public.championship_registrations
  ADD CONSTRAINT chk_registration_shirt_size
  CHECK (shirt_size IS NULL OR shirt_size IN ('P','M','G','GG','Personalizado'));

COMMENT ON COLUMN public.championship_registrations.shirt_size IS
  'Tamanho da camiseta escolhido nesta inscricao. Personalizado e acertado individualmente com o jogador.';

COMMIT;
