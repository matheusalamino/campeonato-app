-- =============================================================================
-- Migration: o vocabulario de posicao vira codigo
--
-- `preferred_position` passa a guardar GOL/ZAG/MEI/ATA. A palavra existe so na
-- exibicao, por POSITION_LABELS.
--
-- A CHECK entra VALIDANDO, sem NOT VALID. O NOT VALID da 20260820010000 existia
-- para aplicar a constraint sobre linhas de origem desconhecida; aqui a propria
-- migration normaliza o dado no passo 3, entao validar e de graca -- e abortar
-- no deploy e o desfecho BOM: se sobrou valor que ninguem mapeou, ninguem quer
-- descobrir isso meses depois, num UPDATE que nem toca em posicao.
--
-- Medido em 2026-08-21, nos tres ambientes: 100% dos jogadores nos quatro
-- canonicos, zero fora. local 64, staging 82, producao 80.
--
-- ORDEM DE DEPLOY: APP PRIMEIRO, ESTA MIGRATION DEPOIS. O DROP COLUMN abaixo
-- torna isso obrigatorio -- bundle antigo pedindo `players(...,position)` leva
-- 400 com 42703 e a requisicao INTEIRA falha, nao so o campo. Os dois leitores
-- eram hooks "use client", entao quem esta com a aba aberta perde a pagina de
-- jogo e o ranking de goleiros ate recarregar. Medido no stack local; o detalhe
-- esta em MIGRATIONS.md, secao "Ordem de deploy".
-- =============================================================================
BEGIN;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_preferred_position_known;

-- A coluna `position` era CURATIVO, nao dominio: a 20260504170000 a criou como
-- GENERATED ALWAYS AS (preferred_position) so para nao quebrar consultas que
-- ainda liam o nome antigo. Tinha TRES leitores, nenhum dependente em SQL, e
-- nem entrada no tipo Player. Vem ai `secondary_position`, e uma coluna chamada
-- `position` espelhando a primaria em silencio obrigaria todo leitor futuro a
-- adivinhar qual das tres coisas ela significa.
ALTER TABLE public.players DROP COLUMN IF EXISTS position;

UPDATE public.players SET preferred_position = CASE preferred_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    ELSE preferred_position
  END
 WHERE preferred_position IS NOT NULL;

-- NULL segue aceito, e essa permissividade e load-bearing:
-- scripts/test-registration-slots.sh insere jogador so com (cpf, name).
ALTER TABLE public.players
  ADD CONSTRAINT players_preferred_position_known
  CHECK (preferred_position IS NULL
         OR preferred_position IN ('GOL', 'ZAG', 'MEI', 'ATA'));

COMMIT;
