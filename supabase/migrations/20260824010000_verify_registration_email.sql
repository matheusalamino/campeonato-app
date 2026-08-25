-- =============================================================================
-- Migration: a volta do clique no link de verificacao
--
-- A migration 20260823020000 criou as tres colunas (`contact_email`,
-- `email_verification_token_hash`, `email_verified_at`) e disse, com todas as
-- letras, que ninguem escrevia nelas ainda. As tres passaram a ter dono, e esta
-- migration e o ULTIMO dos tres, nao os tres:
--
--   `contact_email`                  -- `commit_registration` (20260823030000)
--   `email_verification_token_hash`  -- o store, ao montar o comprovante
--                                       (`issueVerificationToken`)
--   `email_verified_at`              -- ESTA funcao, na volta do clique
--
-- Alem dela, esta funcao escreve uma coluna de OUTRA tabela: `players.email`.
--
-- ── Por que uma FUNCAO, e nao dois updates do cliente ────────────────────────
--
-- Porque as duas gravacoes precisam cair juntas ou nao cair:
--
--   1. `championship_registrations.email_verified_at = now()` -- a posse da
--      caixa foi provada;
--   2. `players.email = championship_registrations.contact_email` -- e so
--      depois de provada o cadastro pode receber o endereco digitado.
--
-- O cliente do Supabase nao abre transacao: ele fala PostgREST, e cada chamada
-- e a sua propria transacao. Feitas em duas chamadas, uma falha no meio deixa
-- um dos dois estados sem o outro -- e o pior deles e silencioso: inscricao
-- marcada como verificada, cadastro com o endereco velho, e nenhum caminho que
-- tente de novo (a segunda visita ao link responde 'already' e nao grava nada).
--
-- ── O que entra aqui e o HASH, nunca o token ─────────────────────────────────
--
-- O argumento e `p_token_hash`: o sha256 ja calculado do lado do TypeScript
-- (`features/email/verification-token.ts`). O valor em claro nao atravessa esta
-- fronteira, e isso importa por um motivo concreto -- argumento de funcao
-- aparece em `log_statement`, em `pg_stat_statements` e em plano de execucao
-- guardado. Um token em claro num desses e um link valido esperando ser lido.
--
-- ── O hash NAO e apagado na verificacao, e isso e decisao ────────────────────
--
-- Depois do clique a linha continua com o hash e passa a ter o carimbo. E o que
-- faz o SEGUNDO clique no MESMO link responder 'already' em vez de 'unknown':
-- a linha ainda e encontravel, e o carimbo diz que ela ja esta resolvida.
--
-- Apagar o hash pareceria mais limpo e produziria a resposta errada -- clicar
-- duas vezes no mesmo link e o comportamento mais comum que existe (o cliente de
-- e-mail abre, a pessoa volta, clica de novo), e responder "este link nao vale
-- mais" a isso ensina a pessoa a duvidar de uma coisa que deu certo.
--
-- Consequencia para o indice parcial de 20260823020000
-- (`... WHERE email_verification_token_hash IS NOT NULL`): ele passa a conter
-- tambem as linhas ja verificadas. Continua menor que um indice total -- fica
-- de fora toda inscricao que nunca teve token, que e a maioria -- mas o
-- cabecalho daquela migration descreve so a metade pendente. Esta e a metade
-- que faltava.
--
-- ── O ultimo clique vence ────────────────────────────────────────────────────
--
-- `players.email` e uma coluna so, e a mesma pessoa pode ter inscricao em duas
-- edicoes com `contact_email` diferentes. Verificando as duas, o cadastro fica
-- com o da que foi clicada por ultimo. Aceitavel, e nao acidental: o endereco
-- mais recentemente PROVADO e o palpite menos ruim disponivel, e nenhuma das
-- duas verificacoes se perde -- cada inscricao guarda o seu proprio
-- `contact_email` e o seu proprio carimbo.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.verify_registration_email(p_token_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          uuid;
  v_player_id   uuid;
  v_contact     text;
  v_verified_at timestamptz;
BEGIN
  -- Hash ausente NAO pode virar consulta. `email_verification_token_hash` e
  -- nulavel e a maioria esmagadora das linhas o tem nulo; a guarda existe para
  -- a intencao ficar escrita, e nao porque `= ''` casaria alguma coisa.
  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RETURN 'unknown';
  END IF;

  -- `= p_token_hash` implica `IS NOT NULL`, entao o indice parcial de
  -- 20260823020000 serve esta consulta. `FOR UPDATE` segura a linha ate o fim
  -- da funcao: sem ele, dois cliques simultaneos no mesmo link poderiam ler
  -- `email_verified_at` nulo os dois e gravar `players.email` duas vezes.
  SELECT r.id, r.player_id, r.contact_email, r.email_verified_at
    INTO v_id, v_player_id, v_contact, v_verified_at
    FROM public.championship_registrations r
   WHERE r.email_verification_token_hash = p_token_hash
   LIMIT 1
     FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN 'unknown';
  END IF;

  IF v_verified_at IS NOT NULL THEN
    RETURN 'already';
  END IF;

  UPDATE public.championship_registrations
     SET email_verified_at = now()
   WHERE id = v_id;

  -- `player_id` e NULLABLE, e `contact_email` pode estar vazia. Sem jogador nao
  -- ha cadastro para atualizar, e sem endereco nao ha o que gravar -- nos dois
  -- casos a verificacao da inscricao vale assim mesmo: o que ela afirma e que
  -- alguem abriu o link enviado, e isso continua verdade.
  IF v_player_id IS NOT NULL AND btrim(coalesce(v_contact, '')) <> '' THEN
    UPDATE public.players
       SET email = v_contact
     WHERE id = v_player_id;
  END IF;

  RETURN 'verified';
END;
$$;

-- `REVOKE ... FROM PUBLIC` NAO fecha nada sozinho neste banco: `anon` e
-- `authenticated` recebem EXECUTE nominalmente por ALTER DEFAULT PRIVILEGES, e
-- privilegio nominal so sai por REVOKE nominal. Quem chama e o `service_role`,
-- do servidor -- a pagina de verificacao usa `createAdminClient()`.
REVOKE ALL ON FUNCTION public.verify_registration_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_registration_email(text) FROM anon, authenticated;

-- O GRANT abaixo e EXPLICITO, e as funcoes irmas deste repo nao o tem. O
-- motivo: as default privileges do Supabase dao EXECUTE a `service_role` no
-- momento do CREATE, e `CREATE OR REPLACE` NAO as reaplica. Sem esta linha,
-- numa base onde alguem tivesse revogado o privilegio -- por engano, por
-- endurecimento, por depuracao --, rodar a migration de novo deixaria a funcao
-- existindo e inalcancavel, e a tela responderia `error` a todo mundo.
--
-- Com a linha, roda-la de novo devolve o EXECUTE. As duas metades foram
-- medidas no stack local antes desta migration ir para qualquer lugar: sem o
-- GRANT, reaplicar o arquivo NAO devolvia o privilegio e o link vivo passou a
-- mostrar "Nao conseguimos confirmar agora"; com ele, volta.
GRANT EXECUTE ON FUNCTION public.verify_registration_email(text) TO service_role;

COMMENT ON FUNCTION public.verify_registration_email(text) IS
'Resolve a volta do clique no link de verificacao, na MESMA transacao: carimba
championship_registrations.email_verified_at e propaga contact_email para
players.email. Recebe o HASH do token, nunca o valor em claro.

Devolve ''verified'' (verificou agora), ''already'' (ja estava verificada) ou
''unknown'' (o hash nao casa com linha nenhuma). Nao apaga o hash: e o que faz o
segundo clique no mesmo link responder ''already'' em vez de ''unknown''.';

COMMIT;
