-- =============================================================================
-- Migration: o vocabulario do POTE vira codigo, e o ultimo residuo em SQL sai
--
-- ── O QUE MUDA ──
--
-- As sete colunas que guardam categoria de pote passam a guardar
-- GOL/ZAG/MEI/ATA/EXT. A palavra por extenso existe so na exibicao.
--
-- ── AS DUAS CHECK SAO DIFERENTES DE PROPOSITO ──
--
-- LEIA ISTO ANTES DE "UNIFORMIZAR": a CHECK de `players.preferred_position`
-- (20260821010000) aceita QUATRO valores; as sete daqui aceitam CINCO.
--
-- Nao e descuido nem sobra. `players.preferred_position` guarda POSICAO. A
-- coluna do pote guarda CATEGORIA DE POTE, que quase sempre e uma posicao — a
-- geracao de potes copia a posicao do jogador — e as vezes e o pote `EXT`,
-- criado por `app/api/draft/finalize-pot/route.ts` para receber quem nao foi
-- vendido no leilao. `EXT` nao e posicao de ninguem, e um jogador nunca deve
-- poder ser cadastrado como tal.
--
-- Tirar o `EXT` daqui em nome da simetria apaga o pote extra: a proxima
-- finalizacao de pote falha na CHECK e os nao vendidos ficam sem destino.
--
-- ── O DADO QUE ISTO CONVERTE E VIVO ──
--
-- O banco LOCAL esta vazio nas sete tabelas, e isso quase fez este plano
-- trata-las como vazias. Medido em STAGING em 2026-08-22:
--
--   draft_balance_transactions  226   (Ata 75, Mei 82, Zag 57, Gol 8, Extra 4)
--   draft_pots                   80   (Ata 21, Mei 27, Zag 20, Gol 8, Extra 4)
--   draft_player_purchases       80   (Ata 21, Mei 27, Zag 20, Gol 8, Extra 4)
--   draft_qualification_bids     62   (Ata 23, Mei 23, Zag 16)
--   draft_pot_budgets            50   (Ata 15, Mei 21, Zag 14)
--   draft_fines                  41   (Ata 11, Mei 20, Zag 10)
--   draft_special_card_uses       0
--
-- Sao 539 linhas, todas em palavra por extenso, e as 12 de `Extra` acima estao
-- em tres das sete colunas. Producao NAO foi medida aqui — o acesso desta
-- sessao so alcancava staging; o numero de 80 linhas em `draft_pots` de
-- producao veio do briefing, e nao de consulta propria.
--
-- ── A CHECK ENTRA VALIDANDO, SEM NOT VALID ──
--
-- A propria migration normaliza o dado no UPDATE logo acima de cada uma, entao
-- validar e de graca. E abortar no deploy e o desfecho BOM: se sobrou valor que
-- ninguem mapeou, ninguem quer descobrir isso meses depois, num UPDATE que nem
-- toca em posicao.
--
-- Sete blocos explicitos, e nao um laco em PL/pgSQL sobre a lista de tabelas.
-- O laco seria mais curto de escrever e ilegivel num diff daqui a seis meses.
--
-- ── ORDEM DE DEPLOY: MIGRATION PRIMEIRO, APP DEPOIS ──
--
-- Mesma escolha da 20260821010000, mas NAO pela mesma razao, e a diferenca
-- importa para quem ler isto sozinho.
--
-- La o motivo era que a CHECK velha recusaria o valor novo, entao com o app na
-- frente NENHUMA INSCRICAO GRAVA. Aqui isso nao existe: ate esta migration,
-- NENHUMA das nove colunas tinha CHECK DE VOCABULARIO. Medido em
-- `pg_constraint`: nas sete so havia as de `type`, `result` e valor minimo, e
-- as duas de `championships` so eram tocadas pelas
-- `draft_*_window_consistent`, que exigem "nao nulo e nao vazio com a janela
-- aberta" e nao olham o CONTEUDO. O banco aceitava qualquer texto, e o app novo
-- na frente gravaria `EXT` sem reclamacao.
--
-- O que decide a ordem e que as duas migrations sobem JUNTAS, na mesma pilha, e
-- a 20260821010000 ja escolheu migration primeiro por uma razao mais dura.
-- Herdamos a janela dela.
--
-- O que ESTA migration ACRESCENTA a essa janela: o bundle velho, no ar contra o
-- banco ja convertido, escreve a PALAVRA — `generate-pots` grava `Goleiro` e
-- `finalize-pot` grava `Extra` — e agora bate na CHECK, virando HTTP 500 em vez
-- de gravar. E aceitavel porque os dois caminhos so rodam na NOITE DE DRAFT, a
-- mao, e nao continuamente. Nao suba isto no meio de uma.
-- =============================================================================
BEGIN;

-- ── 1/7: draft_pots.position ─────────────────────────────────────────────────
-- A origem de todas as outras: as seis colunas `pot_position` copiam daqui.

UPDATE public.draft_pots SET position = CASE position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE position
  END
 WHERE position IS NOT NULL;

ALTER TABLE public.draft_pots
  DROP CONSTRAINT IF EXISTS draft_pots_position_known;

ALTER TABLE public.draft_pots
  ADD CONSTRAINT draft_pots_position_known
  CHECK (position IS NULL
         OR position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 2/7: draft_balance_transactions.pot_position ─────────────────────────────

UPDATE public.draft_balance_transactions SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_balance_transactions
  DROP CONSTRAINT IF EXISTS draft_balance_transactions_pot_position_known;

ALTER TABLE public.draft_balance_transactions
  ADD CONSTRAINT draft_balance_transactions_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 3/7: draft_fines.pot_position ────────────────────────────────────────────

UPDATE public.draft_fines SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_fines
  DROP CONSTRAINT IF EXISTS draft_fines_pot_position_known;

ALTER TABLE public.draft_fines
  ADD CONSTRAINT draft_fines_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 4/7: draft_player_purchases.pot_position ─────────────────────────────────

UPDATE public.draft_player_purchases SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_player_purchases
  DROP CONSTRAINT IF EXISTS draft_player_purchases_pot_position_known;

ALTER TABLE public.draft_player_purchases
  ADD CONSTRAINT draft_player_purchases_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 5/7: draft_pot_budgets.pot_position ──────────────────────────────────────

UPDATE public.draft_pot_budgets SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_pot_budgets
  DROP CONSTRAINT IF EXISTS draft_pot_budgets_pot_position_known;

ALTER TABLE public.draft_pot_budgets
  ADD CONSTRAINT draft_pot_budgets_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 6/7: draft_qualification_bids.pot_position ───────────────────────────────

UPDATE public.draft_qualification_bids SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_qualification_bids
  DROP CONSTRAINT IF EXISTS draft_qualification_bids_pot_position_known;

ALTER TABLE public.draft_qualification_bids
  ADD CONSTRAINT draft_qualification_bids_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 7/7: draft_special_card_uses.pot_position ────────────────────────────────
-- Zero linhas nos tres ambientes medidos. O UPDATE fica assim mesmo: a tabela
-- vazia hoje e a que enche primeiro no dia em que a carta especial for usada, e
-- uma migration que so converte "o que tem dado" nao se le como regra.

UPDATE public.draft_special_card_uses SET pot_position = CASE pot_position
    WHEN 'Goleiro'   THEN 'GOL'
    WHEN 'Zagueiro'  THEN 'ZAG'
    WHEN 'Meia'      THEN 'MEI'
    WHEN 'Atacante'  THEN 'ATA'
    WHEN 'Extra'     THEN 'EXT'
    ELSE pot_position
  END
 WHERE pot_position IS NOT NULL;

ALTER TABLE public.draft_special_card_uses
  DROP CONSTRAINT IF EXISTS draft_special_card_uses_pot_position_known;

ALTER TABLE public.draft_special_card_uses
  ADD CONSTRAINT draft_special_card_uses_pot_position_known
  CHECK (pot_position IS NULL
         OR pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── 8 e 9: o espelho transitorio, em championships ──────────────────────────
--
-- Estas DUAS colunas nao estavam na lista das sete e guardam o mesmo
-- vocabulario: sao o pote com a janela ABERTA agora, copiado de
-- `draft_pots.position`. NULL com a janela fechada, que e o estado dos dois
-- campeonatos de staging e dos dois de local, medido em 2026-08-22.
--
-- Precisam converter junto porque quem le procura o pote com
-- `.eq("position", potPosition)` usando o valor guardado aqui: convertido o
-- `draft_pots` e nao o espelho, uma janela que atravesse o deploy passa a
-- apontar para pote nenhum, e o leilao trava sem dizer por que.
--
-- E LEVAM CHECK, ao contrario do que a primeira versao desta migration dizia.
-- O argumento para dispensa-la era "o produtor valida", e ele NAO SE SUSTENTA
-- quando medido: quem valida e o ROUTE (`auction-window` e
-- `qualification-window` so gravam depois de achar a linha em `draft_pots` com
-- `.eq("position", ...)`), e nao a funcao. `set_draft_auction_state` tem
-- `GRANT EXECUTE ... TO authenticated` desde a 20260415190000 e so faz
-- `NULLIF(trim(...), '')` no argumento — qualquer admin ou fiscal de leilao
-- grava o texto que quiser passando por cima do route. Promessa nao e garantia;
-- a CHECK e.

UPDATE public.championships SET
    draft_auction_pot_position = CASE draft_auction_pot_position
      WHEN 'Goleiro'   THEN 'GOL'
      WHEN 'Zagueiro'  THEN 'ZAG'
      WHEN 'Meia'      THEN 'MEI'
      WHEN 'Atacante'  THEN 'ATA'
      WHEN 'Extra'     THEN 'EXT'
      ELSE draft_auction_pot_position
    END,
    draft_qualification_pot_position = CASE draft_qualification_pot_position
      WHEN 'Goleiro'   THEN 'GOL'
      WHEN 'Zagueiro'  THEN 'ZAG'
      WHEN 'Meia'      THEN 'MEI'
      WHEN 'Atacante'  THEN 'ATA'
      WHEN 'Extra'     THEN 'EXT'
      ELSE draft_qualification_pot_position
    END
 WHERE draft_auction_pot_position IS NOT NULL
    OR draft_qualification_pot_position IS NOT NULL;

ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS championships_draft_auction_pot_position_known;

ALTER TABLE public.championships
  ADD CONSTRAINT championships_draft_auction_pot_position_known
  CHECK (draft_auction_pot_position IS NULL
         OR draft_auction_pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

ALTER TABLE public.championships
  DROP CONSTRAINT IF EXISTS championships_draft_qualification_pot_position_known;

ALTER TABLE public.championships
  ADD CONSTRAINT championships_draft_qualification_pot_position_known
  CHECK (draft_qualification_pot_position IS NULL
         OR draft_qualification_pot_position IN ('GOL', 'ZAG', 'MEI', 'ATA', 'EXT'));

-- ── O ultimo "segundo vocabulario tolerado" vivo, e ele estava em SQL ────────
--
-- `public_goalkeeper_iog` decidia quem e goleiro com
-- `upper(p.preferred_position) LIKE 'GOL%'`, e o comentario que a encimava na
-- 20260616000000 dizia, com todas as letras, "tolerante a formato (GOL ou
-- Goleiro)". Nao quebra hoje — o prefixo casa os dois — mas e a ultima frase do
-- repo que promete suportar dois vocabularios, e a varredura de fonte dos
-- testes nao le SQL, entao ela ficaria viva e invisivel.
--
-- Historico que vale registrar: a 20260615000000 subiu com `= 'GOL'` quando a
-- coluna guardava PALAVRA, e a 20260616000000 "consertou" alargando para o
-- prefixo em vez de converter o dado. O que faltava era a conversao, e ela veio
-- na 20260821010000.
--
-- A 20260616000000 NAO e editada: migration aplicada nao se edita — este
-- projeto mediu que ate comentario dentro da regiao de statements fica gravado
-- em `supabase_migrations.schema_migrations.statements`. Substitui-se a funcao
-- aqui, e o corpo abaixo e o dela, com uma linha diferente.

CREATE OR REPLACE FUNCTION public.public_goalkeeper_iog(p_championship_id uuid)
RETURNS TABLE (
  registration_id uuid,
  matches_played bigint,
  goals_conceded bigint,
  penalty_saves bigint,
  decisive_saves bigint,
  iog numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH gk AS (
    SELECT cr.id
    FROM championship_registrations cr
    JOIN players p ON p.id = cr.player_id
    WHERE cr.championship_id = p_championship_id
      AND p.preferred_position = 'GOL'
  ),
  gk_matches AS (
    SELECT ml.player_id AS registration_id, ml.knockout_match_id, ml.championship_team_id
    FROM match_lineups ml
    JOIN knockout_matches km ON km.id = ml.knockout_match_id
    WHERE ml.player_id IN (SELECT id FROM gk)
      AND km.status = 'COMPLETED'
  ),
  conceded AS (
    -- Gols sofridos = gols do adversário + gols contra do próprio time
    SELECT gm.registration_id,
           COUNT(e.id) AS goals_conceded,
           COUNT(DISTINCT gm.knockout_match_id) AS matches_played
    FROM gk_matches gm
    LEFT JOIN match_events_v2 e
      ON e.knockout_match_id = gm.knockout_match_id
     AND e.deleted_at IS NULL
     AND (
       (e.event_type = 'GOAL'     AND e.team_id <> gm.championship_team_id) OR
       (e.event_type = 'OWN_GOAL' AND e.team_id  = gm.championship_team_id)
     )
    GROUP BY gm.registration_id
  ),
  saves AS (
    SELECT registration_id,
           COUNT(*) FILTER (WHERE is_penalty)     AS penalty_saves,
           COUNT(*) FILTER (WHERE NOT is_penalty) AS decisive_saves
    FROM player_saves
    WHERE championship_id = p_championship_id
      AND registration_id IN (SELECT id FROM gk)
    GROUP BY registration_id
  )
  SELECT
    c.registration_id,
    c.matches_played,
    c.goals_conceded,
    COALESCE(s.penalty_saves, 0)  AS penalty_saves,
    COALESCE(s.decisive_saves, 0) AS decisive_saves,
    ROUND(
      (5 - (c.goals_conceded::numeric / NULLIF(c.matches_played, 0)))
      + 2 * COALESCE(s.penalty_saves, 0)
      + 2 * (COALESCE(s.decisive_saves, 0)::numeric / NULLIF(c.matches_played, 0)),
      2
    ) AS iog
  FROM conceded c
  LEFT JOIN saves s ON s.registration_id = c.registration_id
  WHERE c.matches_played > 0
  ORDER BY iog DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_goalkeeper_iog(uuid) TO anon, authenticated;

COMMIT;
