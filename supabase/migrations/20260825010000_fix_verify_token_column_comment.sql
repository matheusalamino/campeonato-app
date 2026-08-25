-- =============================================================================
-- Migration: corrigir o COMMENT de email_verification_token_hash
--
-- Nao muda estrutura nem dado. Muda uma frase que ficou falsa, e que mora no
-- lugar onde a prosa deste projeto e mais dificil de consertar: o objeto vivo do
-- banco.
--
-- ── O que estava errado ─────────────────────────────────────────────────────
--
-- A migration 20260823020000 gravou:
--
--   'Nulo quando nao ha verificacao pendente.'
--
-- Isso valia enquanto ninguem tinha decidido o que fazer com o hash DEPOIS do
-- clique. A funcao `verify_registration_email` (20260824010000) decidiu:
-- NAO apaga. E o que faz o segundo clique no mesmo link responder 'already' em
-- vez de 'unknown' -- clicar duas vezes e o comportamento mais comum que existe,
-- e dizer "este link nao vale mais" a isso ensina a pessoa a duvidar de uma
-- coisa que deu certo.
--
-- Com essa decisao, uma inscricao JA VERIFICADA tem hash preenchido e nenhuma
-- verificacao pendente -- exatamente o que a frase antiga negava. Quem lesse o
-- comentario para decidir uma limpeza, ou para escrever uma consulta de
-- suporte, concluiria que toda linha com hash tem convite em aberto.
--
-- ── Por que uma migration so para isto ──────────────────────────────────────
--
-- Porque `COMMENT ON COLUMN` e estado do banco, e nao texto de arquivo. Editar
-- o comentario dentro de 20260823020000 nao muda nada em base nenhuma onde ela
-- ja rodou: o `COMMENT` de la ja foi executado, e o corpo daquele arquivo esta
-- congelado em `supabase_migrations.schema_migrations.statements`. So um
-- `COMMENT ON COLUMN` NOVO alcanca o objeto vivo -- que e o que um DBA le com
-- `\d+` e o que aparece no Studio.
--
-- O cabecalho de 20260824010000 ja carregava a metade da correcao, e ela ficou
-- so la: o arquivo que ninguem abre quando quer saber o que a coluna significa.
-- =============================================================================
BEGIN;

COMMENT ON COLUMN public.championship_registrations.email_verification_token_hash IS
'Hash do token de verificacao do e-mail desta inscricao. O valor em claro nunca
e gravado -- ele so existe dentro do link enviado.

Nulo enquanto nenhum token foi emitido: inscricao criada pelo admin (sem
contact_email) e inscricao cujo comprovante ainda nao foi montado.

NAO volta a ser nulo depois do clique. O hash sobrevive a verificacao de
proposito, e e por isso que "tem hash" NAO significa "tem verificacao
pendente" -- quem responde essa pergunta e email_verified_at. Emitir de novo
SUBSTITUI o hash, e com isso invalida o link anterior, que e irrecuperavel.';

COMMIT;
