-- =============================================================================
-- Migration: a reserva sabe em que balde entrou
--
-- `registration_slot_reservations` guarda `is_waitlist` e nao guarda posicao.
-- Sem ela a RPC nao consegue contar os goleiros RESERVADOS, e duas reservas de
-- goleiro simultaneas passariam pela mesma ultima vaga: cada uma enxerga so as
-- inscricoes ja confirmadas, e nenhuma enxerga a outra.
--
-- `is_goalkeeper` em vez de guardar a posicao inteira. O balde e binario -- a
-- cota separa goleiro de todo o resto -- e o balde e a unica coisa que a
-- contagem precisa. Guardar o texto convidaria a contar por ENUMERACAO das
-- posicoes de linha, e enumeracao quebra a cada posicao nova; contra "e goleiro
-- ou nao e" nao ha o que enumerar.
--
-- De quebra, o balde nao depende do VOCABULARIO. O valor que representa goleiro
-- em `preferred_position` esta em transicao (a palavra por extenso hoje, codigo
-- na branch refactor/position-vocabulary-codes, que traz uma CHECK recusando a
-- palavra): um boolean atravessa a virada intacto, enquanto uma copia do texto
-- envelheceria junto com ela. Por isso nem o COMMENT abaixo nem este cabecalho
-- citam o literal -- migration aplicada nao se edita, e prosa que fixa a grafia
-- de hoje vira registro falso amanha.
--
-- NOT NULL DEFAULT false e load-bearing, nao enfeite. A RPC que esta no ar
-- insere com a lista explicita `(championship_id, cpf, is_waitlist, expires_at)`
-- e nao conhece esta coluna: sem DEFAULT, a primeira reserva depois do deploy
-- estouraria com not-null violation. O `false` tambem e a direcao certa para as
-- reservas VIVAS no instante do deploy, cuja posicao ninguem registrou -- linha
-- e o balde grande, e reserva mal classificada morre sozinha em ate um TTL.
--
-- Nenhum codigo le esta coluna ainda: quem passa a grava-la e a task seguinte.
-- Esta migration so abre espaco no banco.
-- =============================================================================
BEGIN;

ALTER TABLE public.registration_slot_reservations
  ADD COLUMN IF NOT EXISTS is_goalkeeper boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.registration_slot_reservations.is_goalkeeper IS
  'Em que balde a reserva entrou: true quando a posicao declarada na inscricao e a de goleiro, false para qualquer posicao de linha. Guarda o BALDE, e nao a posicao: o balde e binario, e e a unica coisa que a contagem por cota precisa. O criterio e a posicao em si, nao a grafia dela -- o valor que representa goleiro em preferred_position muda de vocabulario com o tempo, e este campo continua significando o mesmo.';

-- A contagem por balde roda em TODA reserva, e roda sob o `FOR UPDATE` do
-- campeonato, que serializa as inscricoes concorrentes: o que este indice
-- encurta e a secao critica, nao uma consulta de relatorio. A ordem das colunas
-- e a de sempre -- a igualdade primeiro, os dois baldes depois -- e deixa a
-- agregacao sair por index-only scan.
CREATE INDEX IF NOT EXISTS registration_slot_reservations_champ_bucket
  ON public.registration_slot_reservations (championship_id, is_goalkeeper, is_waitlist);

COMMIT;
