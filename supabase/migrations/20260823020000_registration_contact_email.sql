-- =============================================================================
-- Migration: o e-mail de contato da INSCRICAO, e o par que vai verifica-lo
--
-- O e-mail ja existia em `players.email`, e ate aqui era o unico lugar onde ele
-- morava. Estas colunas nao o duplicam por comodidade: elas existem porque o
-- endereco do CADASTRO e o endereco que a pessoa acabou de digitar podem ser
-- diferentes, e hoje o segundo se perde.
--
-- ── Por que o e-mail digitado se perde ───────────────────────────────────────
--
-- O campo de e-mail do formulario publico e SEMPRE editavel: em
-- `app/(public)/inscrever/[slug]/RegistrationWizard.tsx` ele e um input comum,
-- sem `disabled` nem `readOnly`, e o passo do CPF apenas o PRE-PREENCHE com o
-- que estiver no cadastro. Quem trocou de e-mail apaga o antigo, digita o novo,
-- e a tela aceita.
--
-- Do outro lado, `shouldPersistPlayerIdentity`
-- (`features/registration/player-identity.ts`) so deixa a submissao publica
-- gravar identidade quando o CPF ainda NAO existe. Isso e protecao legitima, e
-- nao um descuido: a inscricao e anonima e o CPF nao e segredo, entao um upsert
-- ali deixaria qualquer pessoa que digitasse o CPF de outra reescrever nome,
-- e-mail, WhatsApp e data de nascimento dela.
--
-- O efeito colateral e o silencio. Para CPF ja cadastrado, o e-mail novo passa
-- pela validacao, viaja ate o servidor e e DESCARTADO -- sem erro, sem aviso, e
-- sem que a pessoa tenha como notar. Enquanto o endereco nao era usado para
-- nada, isso era inofensivo. Deixa de ser no momento em que existe comprovante
-- para mandar: e justamente quem trocou de e-mail que digita o novo, e e
-- justamente esse que seria jogado fora.
--
-- `contact_email` fecha essa perda pelo caminho mais estreito possivel: o valor
-- fica preso a ESTA inscricao, e nao toca o cadastro do jogador.
--
-- ── Por que a verificacao, e por que so hash ─────────────────────────────────
--
-- O cadastro do jogador nao sera atualizado pela digitacao. Sera atualizado
-- depois de um clique num link enviado ao endereco digitado, e a ordem importa
-- nos dois sentidos: o clique e o unico sinal que prova posse da caixa, e e
-- tambem o que impede um erro de digitacao apagar para sempre o endereco bom de
-- alguem. Sem ele, "corrigir o e-mail" e "sequestrar o cadastro alheio" chegam
-- ao servidor exatamente iguais.
--
-- `email_verification_token_hash` guarda o HASH do token, nunca o valor em
-- claro: o valor em claro so existe dentro do link que sai no e-mail. Quem ler
-- esta tabela -- por dump, por backup, por um SELECT de suporte -- nao consegue
-- montar um link valido a partir do que ve aqui. `email_verified_at` registra o
-- instante do clique, e nulo significa "ainda nao clicou".
--
-- O indice e PARCIAL porque a busca por token so acontece na volta do link, e
-- so alcanca linha com token pendente. Um indice total carregaria toda inscricao
-- ja verificada -- e toda inscricao que nunca teve token -- para responder as
-- mesmas consultas.
--
-- ── O que esta migration NAO faz ─────────────────────────────────────────────
--
-- Na data desta migration nao ha quem escreva nestas tres colunas: quem grava
-- `contact_email` e a proxima migration, que substitui `commit_registration`;
-- quem gera o token, monta o link e escreve o instante do clique chega depois,
-- num passo proprio. Ate la as tres nascem nulas em toda linha nova, e isso e o
-- estado correto delas, nao um defeito.
-- =============================================================================
BEGIN;

ALTER TABLE public.championship_registrations
  ADD COLUMN IF NOT EXISTS contact_email                 text,
  ADD COLUMN IF NOT EXISTS email_verification_token_hash text,
  ADD COLUMN IF NOT EXISTS email_verified_at             timestamptz;

CREATE INDEX IF NOT EXISTS championship_registrations_verify_token
  ON public.championship_registrations (email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;

COMMENT ON COLUMN public.championship_registrations.contact_email IS
'O e-mail que a pessoa digitou NESTA inscricao. Nao e copia de players.email: a
submissao publica so grava identidade para CPF novo, entao para quem ja tem
cadastro o endereco de la pode estar velho -- e e exatamente esse o caso em que
a pessoa digita o novo. Este e o endereco para onde o comprovante desta
inscricao deve ir.';

COMMENT ON COLUMN public.championship_registrations.email_verification_token_hash IS
'Hash do token de verificacao do e-mail desta inscricao. O valor em claro nunca
e gravado -- ele so existe dentro do link enviado. Nulo quando nao ha
verificacao pendente.';

COMMENT ON COLUMN public.championship_registrations.email_verified_at IS
'Instante em que o link de verificacao foi clicado. Nulo significa que a posse
da caixa ainda nao foi provada -- e so depois de provada o cadastro do jogador
pode ser atualizado com este endereco.';

COMMIT;
