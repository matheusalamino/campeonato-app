-- =============================================================================
-- Migration: a capacidade passa a ser derivada do formato
--
-- `max_players` e `max_waitlist_players` CONTINUAM existindo, e continuam sendo
-- a fonte que as duas RPCs leem. O que muda e quem os escreve: a formula, e nao
-- a mao. Trocar as colunas agora cascatearia nas quatro PRs abertas em cima
-- delas (#67 -> #69 -> #70 -> #71).
--
-- `teams_count` e CONFIGURACAO, nao a contagem de `championship_teams`. Os times
-- sao formados no draft, DEPOIS da inscricao: contar linhas daria zero vagas no
-- dia em que a inscricao abre.
--
-- Nenhuma coluna criada aqui e lida por codigo ainda: quem as liga ao admin e a
-- T3. Esta migration so abre espaco no banco e destrava o zero.
-- =============================================================================
BEGIN;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS teams_count          int,
  ADD COLUMN IF NOT EXISTS players_per_team     int,
  ADD COLUMN IF NOT EXISTS goalkeepers_per_team int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS waitlist_goalkeepers int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waitlist_outfield    int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.championships.teams_count IS
  'Numero de times do formato. CONFIGURACAO, nao a contagem de championship_teams: os times nascem no draft, depois da inscricao.';
COMMENT ON COLUMN public.championships.players_per_team IS
  'Jogadores por time, INCLUINDO o goleiro. 8 x 10 = 80 vagas no formato de 2026.';
COMMENT ON COLUMN public.championships.goalkeepers_per_team IS
  'Cota de goleiro por time. teams_count x este numero = vagas de goleiro; o resto e linha.';
COMMENT ON COLUMN public.championships.waitlist_goalkeepers IS
  'Vagas de espera para goleiro. Configuravel; 1 no formato de 2026.';
COMMENT ON COLUMN public.championships.waitlist_outfield IS
  'Vagas de espera para jogador de linha. Configuravel; 4 no formato de 2026. Somada a de goleiro, alimenta max_waitlist_players.';

-- `max_players = 0` passa a ser GRAVAVEL, e significa FECHADO.
--
-- O CHECK de 20260731000000 era `max_players IS NULL OR max_players > 0`, e por
-- isso `total: 0` — o desfecho seguro que derivedCapacity devolve para formato
-- nao configurado — era IMPOSSIVEL de gravar. Sobrava `NULL`, que hoje significa
-- ILIMITADO: exatamente a raiz do bug que este bloco existe para matar.
--
-- A RPC ja se comporta certo com zero: `(confirmados + reservados) < 0` e falso,
-- logo recusa todo mundo. Zero fecha, e falhar fechado e a direcao certa.
--
-- NULL continua aceito de proposito: `scripts/test-registration-slots.sh` grava
-- `max_players = NULL` para provar que o nulo da vaga principal, e essa
-- assertiva e o que documenta o bug enquanto a T3 nao chega.
ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS chk_max_players_positive;
ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS chk_max_players_non_negative;
ALTER TABLE public.championships
  ADD CONSTRAINT chk_max_players_non_negative
    CHECK (max_players IS NULL OR max_players >= 0);

-- Sanidade minima, para o admin nao gravar formato que inverte a trava.
--
-- `coalesce(coluna, 0) >= 0` aceita NULL: `teams_count` e `players_per_team`
-- nascem nulos nas linhas que ja existem, e formato nao configurado e um estado
-- legitimo — quem o traduz em `total: 0` e derivedCapacity, na T3. As outras tres
-- sao NOT NULL DEFAULT, entao ali o coalesce nunca dispara.
--
-- DROP antes do ADD: `ADD CONSTRAINT IF NOT EXISTS` nao existe no Postgres. E o
-- mesmo padrao de 20260818020000.
ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS championships_capacity_nonneg;
ALTER TABLE public.championships
  ADD CONSTRAINT championships_capacity_nonneg
  CHECK (
    coalesce(teams_count, 0) >= 0
    AND coalesce(players_per_team, 0) >= 0
    AND goalkeepers_per_team >= 0
    AND waitlist_goalkeepers >= 0
    AND waitlist_outfield >= 0
  );

-- A posicao declarada na inscricao, pinada no vocabulario que o Zod da inscricao
-- ja usa (`features/registration/schema.ts`: z.enum dos mesmos quatro valores).
--
-- DADO REAL (medido em 2026-08-21): producao tem 80 jogadores e staging 82, e em
-- AMBOS os 100% estao nos quatro canonicos. Zero futsal, zero `Lateral`, zero
-- `Volante`, zero codigo, zero nulo. Este CHECK passaria limpo nos dois, e daria
-- para VALIDATE.
--
-- A versao anterior deste comentario dizia que 56 dos 64 jogadores estavam em
-- vocabulario de futsal. Aquilo era o SEED local, e nao o mundo: fixture lida
-- como se fosse producao. O seed foi alinhado aos quatro canonicos no mesmo
-- bloco, e producao nunca teve outra coisa.
--
-- NOT VALID fica, e por um motivo melhor do que o que eu tinha escrito: este
-- repo restaura dump de producao para local (`scripts/pull-prod.sh`,
-- `scripts/restore-last-production.sh`), e dump antigo pode trazer vocabulario
-- que ninguem mediu. VALIDATE ali quebraria a migration no meio da restauracao.
-- NOT VALID nao afrouxa nada para quem ESCREVE: todo INSERT e UPDATE e checado.
--
-- A cota conta `Goleiro` contra tudo que nao e `Goleiro`, entao ela conta certo
-- em qualquer um dos tres vocabularios, inclusive num dump legado.
--
-- NULL passa, e isso e LOAD-BEARING, nao descuido: `preferred_position` e
-- nullable desde 20260411000000, `scripts/test-registration-slots.sh` insere
-- jogador so com (cpf, name), e `app/api/import-players/route.ts` grava
-- `safeString(...)`, que devolve NULL para celula vazia. Recusar NULL aqui
-- quebraria a suite do banco. Para a cota, NULL cai no lado "nao e Goleiro",
-- ou seja conta como linha. A forma explicita `IS NULL OR` e a de
-- 20260818020000, e nao muda nada: `NULL IN (...)` ja daria NULL, que o CHECK
-- aceita.
ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_preferred_position_known;
ALTER TABLE public.players
  ADD CONSTRAINT players_preferred_position_known
  CHECK (
    preferred_position IS NULL
    OR preferred_position IN ('Zagueiro', 'Meia', 'Atacante', 'Goleiro')
  )
  NOT VALID;

COMMIT;
