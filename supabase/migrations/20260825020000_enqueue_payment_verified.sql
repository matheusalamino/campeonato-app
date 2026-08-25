-- =============================================================================
-- Migration: o aviso de pagamento conferido entra na fila
--
-- `championship_registrations.payment_verified` existe desde a migration
-- 20260803000000, com `boolean NOT NULL DEFAULT false`. Ate a data desta
-- migration nenhuma linha do aplicativo escrevia nessa coluna -- medido por
-- varredura de `payment_verified` em `*.ts`, `*.tsx` e `*.sql`: as unicas
-- ocorrencias eram a declaracao do tipo em `types/registration.ts`, o
-- vocabulario de `features/email/kinds.ts` e a propria 20260803000000. A tela
-- do admin nao mencionava pagamento.
--
-- Esta migration cria SOMENTE o gatilho. O controle que passou a escrever a
-- coluna e o check do admin em
-- `app/(protected)/championship/players/PlayersSection.tsx` -- mas quem garante
-- o enfileiramento e o PostgreSQL, e nao aquela tela: QUALQUER caminho que
-- marque a coluna enfileira, inclusive um UPDATE feito a mao.
--
-- ── O `SECURITY DEFINER` E O QUE FAZ O SALVAMENTO FUNCIONAR ───────────────────
--
-- O UPDATE vem de uma sessao `authenticated` do navegador (o admin muta pelo
-- cliente do Supabase, no padrao ja usado por `removePlayer`). Gatilho comum
-- roda com os privilegios de quem disparou, e uma falha de gatilho aborta o
-- comando inteiro. Entao, sem o definer, marcar o pagamento nao deixaria
-- apenas de mandar e-mail: deixaria de SALVAR.
--
-- Sao DUAS barreiras independentes, e as duas foram medidas separadamente
-- contra o banco local, com `SET LOCAL ROLE authenticated` e as claims do
-- admin:
--
--   1. o REVOKE NOMINAL de `email_outbox` (migration 20260823010000) --
--      `permission denied for table email_outbox`;
--   2. a RLS de `email_outbox`, ligada e com ZERO policies -- devolvendo os
--      GRANTs de tabela e repetindo, a recusa vira `new row violates
--      row-level security policy for table "email_outbox"`.
--
-- Cada uma sozinha aborta o UPDATE. Com `SECURITY DEFINER` -- dono `postgres`,
-- que tem ACL cheia na tabela e `rolbypassrls` -- o mesmo UPDATE grava a
-- coluna e enfileira a linha.
--
-- Isso muda COMO se prova: rodar por `psql` como `postgres` passa com o
-- defeito no lugar, porque o dono contorna as duas barreiras. A prova precisa
-- ser pelo PostgREST, com sessao de admin de verdade.
--
-- ── O QUE A CLAUSULA `WHEN` FAZ, E O QUE O `ON CONFLICT` ESCONDE ─────────────
--
-- As duas evitam linha repetida, por motivos diferentes, e por isso o teste
-- obvio nao distingue uma da outra: marcar `payment_verified = true` duas
-- vezes nao enfileira duas linhas nem com `WHEN` nem sem ele -- sem o `WHEN` a
-- funcao roda e o `ON CONFLICT (kind, dedupe_key) DO NOTHING` engole o
-- segundo INSERT.
--
-- O que separa as duas aparece quando a linha da fila JA SAIU (o dreno apaga
-- ou o operador limpa): sem o `WHEN`, o segundo UPDATE reenfileira e a pessoa
-- recebe o aviso outra vez; com ele, o gatilho nao roda. Ha assertiva
-- discriminante em scripts/test-email-outbox.sh.
--
-- ── UM AVISO POR INSCRICAO, PARA SEMPRE ─────────────────────────────────────
--
-- `dedupe_key` e o id da inscricao, e o par (kind, dedupe_key) e UNIQUE. Entao
-- desmarcar e marcar de novo NAO manda um segundo e-mail: a linha antiga ainda
-- esta la e o `ON CONFLICT` a preserva. Um "conferido" clicado por engano e
-- desfeito QUEIMA o aviso daquela inscricao -- reenviar exige apagar a linha
-- da fila a mao.
--
-- ── O QUE ESTE GATILHO NAO COBRE ────────────────────────────────────────────
--
-- Ele e AFTER UPDATE. Uma inscricao INSERIDA ja com `payment_verified = true`
-- nao passa por aqui. A submissao publica nao faz isso -- `commit_registration`
-- nao cita a coluna, entao ela nasce no DEFAULT false --, mas uma carga direta
-- no banco faria, e sairia calada.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_payment_verified_email()
RETURNS trigger AS $$
BEGIN
  -- IDENTIFICADOR, nunca texto pronto: o corpo e montado na hora do envio, com
  -- o dado ja corrigido. Mesmo contrato de `enqueue_registration_emails`.
  INSERT INTO public.email_outbox (kind, dedupe_key, payload)
  VALUES ('payment_verified', NEW.id::text,
          jsonb_build_object('registration_id', NEW.id))
  ON CONFLICT (kind, dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enqueue_payment_verified
  ON public.championship_registrations;

CREATE TRIGGER trg_enqueue_payment_verified
  AFTER UPDATE OF payment_verified ON public.championship_registrations
  FOR EACH ROW
  WHEN (NEW.payment_verified IS TRUE AND OLD.payment_verified IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION public.enqueue_payment_verified_email();

-- REVOKE nominal, pelo mesmo motivo da tabela e da funcao irma: `REVOKE ...
-- FROM PUBLIC` sozinho nao tira o privilegio que `anon` e `authenticated`
-- recebem NOMINALMENTE por ALTER DEFAULT PRIVILEGES.
--
-- Aqui isto e defesa em profundidade, e nao a trava que faz o gatilho
-- funcionar -- e a distincao foi MEDIDA, nao suposta: com o EXECUTE revogado
-- de `authenticated` (`has_function_privilege` = false), o UPDATE daquela
-- sessao ainda dispara o gatilho e enfileira a linha. O PostgreSQL cobra
-- EXECUTE de quem cria o gatilho, e nao de quem o faz disparar.
--
-- Por isso tambem NAO ha `GRANT EXECUTE ... TO service_role` nesta migration:
-- num gatilho nao existe chamador a quem conceder, e um GRANT escrito aqui
-- sugeriria uma dependencia que nao existe. (Na 20260824010000 o grant
-- explicito e load-bearing, porque `verify_registration_email` e RPC CHAMADA
-- pelo PostgREST.)
REVOKE ALL ON FUNCTION public.enqueue_payment_verified_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_payment_verified_email() FROM anon, authenticated;

COMMENT ON FUNCTION public.enqueue_payment_verified_email() IS
'Enfileira, na MESMA transacao do UPDATE, a linha `payment_verified` de
email_outbox. Nao monta mensagem nenhuma -- o payload leva o identificador da
inscricao, e o corpo e montado na hora do envio.

SECURITY DEFINER e load-bearing: `email_outbox` tem REVOKE nominal para
`authenticated` E RLS ligada com zero policies, e o UPDATE vem de sessao
`authenticated`. Sem o definer, a falha do gatilho abortaria o UPDATE e o
pagamento nao seria marcado.';

COMMENT ON TRIGGER trg_enqueue_payment_verified
  ON public.championship_registrations IS
'AFTER UPDATE OF payment_verified, com WHEN para so disparar na TRANSICAO para
true -- nao em UPDATE que reescreve o mesmo valor.

O `WHEN` e o `ON CONFLICT` da funcao evitam repeticao por motivos diferentes, e
um esconde o outro: repetir o UPDATE nao duplica linha nem sem o `WHEN`. A
diferenca so aparece com a linha da fila JA APAGADA -- sem o `WHEN` ela volta, e
o aviso sai de novo.

Um aviso por inscricao, para sempre: `dedupe_key` e o id da inscricao, e o par
(kind, dedupe_key) e UNIQUE. Desmarcar e marcar de novo nao reenvia nada.';
