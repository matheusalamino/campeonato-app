-- =============================================================================
-- Migration: a caixa de saida de e-mail
--
-- A inscricao publica grava jogador e inscricao e termina numa tela de sucesso.
-- O e-mail da pessoa era coletado e nunca usado. Mandar o e-mail direto do
-- servidor no momento do submit acopla a resposta da tela a rede de um
-- terceiro: se o provedor demorar, a pessoa espera; se falhar, ninguem fica
-- sabendo -- ela ve o sucesso e nunca recebe nada.
--
-- Entao o envio sai do caminho do submit e passa por aqui. Esta tabela e o
-- DESTINO: um registro do que aconteceu, gravado na MESMA transacao de quem
-- escreve a inscricao, para um dreno enviar depois, por fora.
--
-- Esta migration cria SOMENTE o destino. Nao ha gatilho, nem dreno, nem
-- policy aqui: quem escreve e quem le chegam em migrations proprias. Ate elas
-- chegarem, a tabela fica vazia -- e isso e o estado correto dela, nao um
-- defeito.
--
-- O `payload` guarda IDENTIFICADORES, nao texto pronto. O corpo e montado no
-- momento do envio, o que faz o reenvio pegar o dado ja corrigido -- arrumar um
-- nome e reenviar sai certo, em vez de reenviar o erro congelado. O schema nao
-- forca isso; e contrato de quem escreve.
--
-- O par (kind, dedupe_key) e UNIQUE porque a fonte de eventos nao e confiavel
-- por natureza: gatilho pode disparar de novo depois de um restore, e um
-- agendador pode rodar duas vezes no mesmo dia. Sem a restricao, cada uma
-- dessas repeticoes vira um e-mail a mais na caixa de alguem. As duas colunas
-- sao NOT NULL de proposito: em indice unico, NULL nao colide com NULL, entao
-- uma chave nula desligaria em silencio a propria protecao.
--
-- Sobre permissoes: `REVOKE ... FROM PUBLIC` NAO fecha nada sozinho neste
-- projeto -- os papeis `anon` e `authenticated` recebem privilegio sobre
-- tabelas novas de `public` por ALTER DEFAULT PRIVILEGES, nominalmente, e
-- privilegio nominal so sai por REVOKE nominal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text        NOT NULL,
  dedupe_key          text        NOT NULL,
  payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status              text        NOT NULL DEFAULT 'pending',
  attempts            int         NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  last_error          text,
  provider_message_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  CONSTRAINT email_outbox_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed_permanent'))
);

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_kind_dedupe
  ON public.email_outbox (kind, dedupe_key);

CREATE INDEX IF NOT EXISTS email_outbox_pending
  ON public.email_outbox (status, next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy: sem policy, RLS nega tudo. O service-role tem BYPASSRLS e e
-- o unico que escreve aqui. O REVOKE nominal fecha o caminho do PostgREST.
REVOKE ALL ON TABLE public.email_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.email_outbox FROM anon, authenticated;

COMMENT ON TABLE public.email_outbox IS
'Fila de e-mails a enviar. Cada linha e um ACONTECIMENTO, nao uma mensagem
pronta: `payload` guarda identificadores e o corpo e montado no envio. O par
(kind, dedupe_key) e unico, e e o que impede repeticao virar e-mail repetido.';

COMMENT ON COLUMN public.email_outbox.next_attempt_at IS
'Antes deste instante o dreno ignora a linha. E como o backoff se expressa sem
precisar de agendador proprio.';
