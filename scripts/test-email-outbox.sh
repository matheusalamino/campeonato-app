#!/bin/sh
# Testa a tabela email_outbox contra o Postgres local.
# Roda com: sh scripts/test-email-outbox.sh
#
# Cria linhas descartaveis com `kind` de teste, exercita os cenarios e apaga
# tudo no fim.
#
# O QUE ESTE ARQUIVO COBRE, e por que ele existe em sh e nao em vitest: o
# vitest deste repo nao abre conexao com o banco, entao nada do que a TABELA
# promete tem onde ser provado la. Sao cinco familias:
#
#   1. unicidade por acontecimento -- o indice UNIQUE (kind, dedupe_key);
#   2. o formato da linha -- `dedupe_key` NOT NULL, o CHECK de `status` e o
#      indice parcial do dreno;
#   3. concorrencia -- `FOR UPDATE SKIP LOCKED`, que so aparece com DUAS
#      conexoes ao mesmo tempo;
#   4. quem ESCREVE na fila -- os DOIS gatilhos de
#      championship_registrations (o AFTER INSERT da inscricao e o AFTER UPDATE
#      do pagamento conferido), o `contact_email` que commit_registration
#      passou a gravar, e quem tem permissao de marcar o pagamento;
#   5. quem TIRA da fila -- `claim_email_outbox_batch`, o recolhimento do que
#      ficou parado em 'sending', e quem tem permissao de chamar.
#
# A familia 2 nao aparece em nenhum cenario das outras, e essa e a razao de ela
# existir separada: os cenarios das outras escrevem linhas bem formadas, e um
# defeito que afrouxasse o formato passaria por todos eles calado.
#
# A familia 4 e a unica que toca outras tabelas -- championships, players e
# championship_registrations --, porque o gatilho so existe em relacao a elas.
# Ela tem seu proprio par de fixtures e sua propria limpeza; leia limpar().
#
# O QUE ELE NAO COBRE: nenhum envio. Verde aqui nao quer dizer que algum e-mail
# saiu -- so que o acontecimento ficou registrado e que a linha foi entregue ao
# dreno sem ser entregue duas vezes. O que acontece DEPOIS do claim -- a ordem
# das guardas de envio, a escada de reentrega, quem recebe -- e decidido em
# `features/email/outbox.ts` e provado no vitest, sem tocar a rede.
#
# Nao ha, e nao deve haver, assertiva de envio aqui: mandar e-mail de verdade a
# partir de um script de teste e o defeito que a porta `EmailSender` existe para
# tornar impossivel.
#
# ATENCAO ao cenario de concorrencia: um teste sequencial passa IDENTICO com o
# SKIP LOCKED quebrado, porque sem disputa nao ha nada para pular. Por isso a
# conexao 1 SEGURA a transacao aberta com pg_sleep enquanto a 2 roda, e por
# isso existe uma assertiva separada -- "a conexao 1 ainda segurava" -- que le
# pg_stat_activity para provar que as duas de fato se cruzaram no tempo. Se
# aquela assertiva falhar, o resultado do cenario de concorrencia nao vale nada,
# em qualquer direcao: leia-a primeiro.
set -e

DB="docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA"

# Cinco `kind` distintos, todos com o mesmo prefixo. Sao listados NOMINALMENTE
# no limpar() em vez de varridos com LIKE de proposito: em LIKE o `_` e coringa,
# entao 'test_outbox%' tambem casaria com um `kind` de verdade escrito
# 'testeoutbox...'. Apagar linha real de fila de e-mail e dano silencioso.
#
# Cada cenario tem o SEU kind em vez de compartilhar um so, e isso e o que faz
# a mutacao de um defeito acender UMA assertiva. Quando o cenario da nulidade e
# o do status dividiam kind, tirar o CHECK deixava uma linha a mais para tras e
# a contagem do cenario vizinho ficava vermelha junto -- dois vermelhos para um
# defeito, e o leitor procurando dano em lugar que nao tem.
KIND_A="test_outbox_alpha"
KIND_B="test_outbox_beta"
KIND_L="test_outbox_lock"
KIND_N="test_outbox_null"
KIND_S="test_outbox_status"
KIND_C="test_outbox_claim"

# O PASSADO REMOTO das linhas do cenario do claim, e por que ele precisa ser
# absurdo: `claim_email_outbox_batch` NAO filtra por kind -- ela pega o proximo
# lote da fila inteira, que e o trabalho dela. Num banco local com fila de
# execucoes anteriores parada, um claim de limite 2 pegaria linhas de outra
# pessoa em vez das deste cenario.
#
# O `ORDER BY next_attempt_at` da funcao e a rede: com dez anos de atraso, as
# linhas deste cenario vem sempre primeiro, e o limite sempre se esgota nelas.
# Ha assertiva propria conferindo que a CONTAGEM de linhas em 'sending' fora
# deste kind nao mudou -- ela nao veria uma troca de identidade que mantivesse o
# total, nem mudanca para status que nao seja 'sending'.
CLAIM_PASSADO="now() - interval '10 years'"

# O limite do recolhimento, em minutos. Tem de bater com o `interval '30
# minutes'` de claim_email_outbox_batch (migration 20260823040000): o SQL nao
# tem como ler esta variavel, entao o que existe e a obrigacao de mudar os dois
# juntos. As duas linhas do cenario nascem daqui, uma de cada lado do limite --
# assim mudar o limite move as duas em bloco, em vez de deixar 31 e 29 soltos
# para alguem ajustar so um.
CLAIM_LIMITE_MIN=30
CLAIM_ALEM=$((CLAIM_LIMITE_MIN + 1))
CLAIM_AQUEM=$((CLAIM_LIMITE_MIN - 1))
CLAIM_PASSADO2="now() - interval '9 years'"

# Dois passados DISTINTOS, e nao um so, porque `ORDER BY next_attempt_at,
# created_at` nao desempata linhas gravadas no mesmo INSERT: `now()` e estavel
# dentro da transacao, entao as duas nascem com o mesmo created_at e a ordem
# entre elas fica por conta do Postgres. MEDIDO: com o mesmo passado nas duas, a
# assertiva "os dois claims pegam linhas diferentes" ficava vermelha por
# inversao de ordem sob mutacoes que nao tinham nada a ver com o lock -- vermelho
# comprado barato, que mandaria o leitor para o lugar errado.

# Os cenarios do gatilho NAO tem kind proprio, e nao podem ter: quem escolhe o
# `kind` la e o gatilho, e o que se quer provar e justamente que ele escolhe
# 'registration_committed' e 'organizer_new_registration' -- os kinds DE
# VERDADE. Um kind de teste aqui provaria o gatilho de um mundo que nao existe.
#
# Isso troca a rede: nao da mais para apagar por kind. A limpeza destes cenarios
# e por `dedupe_key`, que e o id da inscricao, e por isso os ids sao FIXOS e
# listados aqui em vez de virem do gen_random_uuid(). Igualdade exata, nunca
# LIKE -- apagar linha real de fila de e-mail e dano silencioso.
CHAMP_T="aaaaaaaa-0000-4000-8000-0000000ec301"
REG_FILA="bbbbbbbb-0000-4000-8000-0000000ec301"
REG_ROLL="bbbbbbbb-0000-4000-8000-0000000ec302"
EMAIL_T="digitado-agora@teste.local"
EMAIL_CADASTRO="cadastro-velho@teste.local"

# Dois jogadores, e nao um: championship_registrations tem UNIQUE
# (championship_id, player_id), entao o mesmo jogador nao serve para dois
# cenarios que gravam inscricao no mesmo campeonato. O prefixo e 998 e nao 999
# de proposito -- scripts/test-registration-slots.sh apaga `cpf LIKE '999%'`, e
# uma execucao paralela levaria estes jogadores embora no meio da suite.
CPF_T="99800000301"
CPF_T2="99800000302"

# O `sub` do token authenticated NAO-ADMIN do cenario do check de pagamento.
# Ele NAO existe em auth.users e NAO tem linha em `profiles` -- e e exatamente
# isso que o faz nao-admin: `is_admin()` procura `profiles.id = auth.uid()` com
# role='admin'. Nada e gravado com este id; ele so viaja dentro do JWT.
SUB_SEM_PERFIL="00000000-0000-4000-8000-00000000dead"

falhou=0
checar() {
  # $1 = descricao, $2 = esperado, $3 = obtido
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FALHOU $1 — esperado [$2], obtido [$3]"
    falhou=1
  fi
}

# Classifica a saida de um INSERT que DEVE quebrar. Medir so "deu erro" nao
# serve: erro de coluna faltando, de permissao ou de conexao tambem "da erro",
# e passariam identico com a restricao ausente. O que prende cada cenario e a
# recusa vir pelo motivo CERTO -- por isso cada guarda tem seu proprio rotulo, e
# nao um "deu ruim" compartilhado: assim uma recusa pelo motivo errado aparece
# como rotulo trocado, e nao como verde.
erro_estado() {
  case "$1" in
    *email_outbox_kind_dedupe*)            echo "unicidade" ;;
    *'null value in column "dedupe_key"'*) echo "nula_recusada" ;;
    *email_outbox_status_check*)           echo "status_recusado" ;;
    *ERROR*)                               echo "outro_erro" ;;
    *)                                     echo "sem_erro" ;;
  esac
}

# psql imprime o rotulo de cada comando -- BEGIN, ROLLBACK -- junto do
# resultado. Os cenarios de sondagem do claim PRECISAM da transacao: a funcao
# nao filtra por kind, e sem o ROLLBACK uma sondagem arrastaria para 'sending'
# linhas de fora do cenario e as deixaria la. Entao a saida passa por aqui.
sem_rotulo() { /usr/bin/grep -vE '^(BEGIN|COMMIT|ROLLBACK)$'; }

# O indice do dreno so serve se for PARCIAL: e o `WHERE status = 'pending'` que
# o mantem do tamanho da fila viva em vez do tamanho do historico inteiro, que
# so cresce. Um indice total responderia as mesmas consultas -- e por isso
# medir "o indice existe" nao distingue nada.
indice_estado() {
  case "$1" in
    '')                  echo "ausente" ;;
    *WHERE*pending*)     echo "parcial" ;;
    *)                   echo "total" ;;
  esac
}

# "A coluna nao foi gravada" e "a coluna nao existe" sao defeitos DIFERENTES com
# o mesmo sintoma se a medida for so o valor: nos dois casos nao ha e-mail
# nenhum na linha. Por isso a leitura vem com stderr junto e passa por aqui --
# coluna ausente aparece como erro do Postgres, valor perdido aparece como
# `(NULO)`, e cada um manda o leitor para um lugar diferente.
#
# `(NULO)` vem de um coalesce na consulta, e nao do vazio do psql, porque em
# `psql -tA` uma coluna nula e uma linha inexistente saem as duas como string
# vazia -- e "a RPC nao gravou o e-mail" nao e a mesma coisa que "a RPC nao
# gravou a inscricao".
email_estado() {
  case "$1" in
    *'does not exist'*)   echo "coluna_ausente" ;;
    *ERROR*)              echo "outro_erro" ;;
    "$EMAIL_T")           echo "digitado" ;;
    "$EMAIL_CADASTRO")    echo "veio_do_cadastro" ;;
    '(NULO)')             echo "nulo" ;;
    '')                   echo "sem_linha" ;;
    *)                    echo "outro_valor" ;;
  esac
}

limpar() {
  $DB -c "
    DELETE FROM email_outbox
     WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L', '$KIND_N', '$KIND_S', '$KIND_C');

    -- As linhas do gatilho. Duas passadas, e a segunda nao e redundante: a
    -- primeira alcanca as inscricoes que ainda existem, e o cenario do
    -- ON CONFLICT APAGA uma inscricao de proposito -- as linhas de fila dela
    -- sobrevivem, porque nao ha FK entre as duas tabelas. Sem a lista literal,
    -- aquelas duas linhas ficariam para tras, com kind de verdade, numa fila de
    -- e-mail de verdade.
    DELETE FROM email_outbox WHERE dedupe_key IN
      (SELECT id::text FROM championship_registrations WHERE championship_id = '$CHAMP_T');
    DELETE FROM email_outbox
     WHERE dedupe_key IN ('$REG_FILA', '$REG_ROLL');

    DELETE FROM self_evaluations WHERE registration_id IN
      (SELECT id FROM championship_registrations WHERE championship_id = '$CHAMP_T');
    DELETE FROM championship_registrations WHERE championship_id = '$CHAMP_T';
    DELETE FROM registration_slot_reservations WHERE championship_id = '$CHAMP_T';
    DELETE FROM players WHERE cpf IN ('$CPF_T', '$CPF_T2');
    DELETE FROM championships WHERE id = '$CHAMP_T';
  " > /dev/null
}

# Rede para a CLASSE, e nao para um caso: qualquer saida -- assertiva quebrada,
# `set -e` mordendo um comando novo, Ctrl-C -- passa por aqui e devolve a tabela
# limpa. Sem isto, um defeito que abortasse a suite no meio deixaria linha de
# teste na fila de e-mail.
#
# O trap e BACKSTOP, nao a garantia: quem afirma que a limpeza aconteceu sao as
# duas assertivas do fim do arquivo, que rodam antes dele. A distincao ja custou
# caro no script irmao -- la um trap com `|| true` engoliu o erro de um DELETE e
# uma linha viva ficou onze minutos na tabela; foi a contagem que gritou, nao o
# trap. Por isso aqui tambem o `limpar` do trap nao leva `|| true`.
#
# Se a suite abortar enquanto a conexao 1 ainda segura o lock, este DELETE
# espera aquela transacao terminar -- alguns segundos, nao um travamento.
oficina=""
faxina() {
  limpar
  if [ -n "$oficina" ]; then rm -rf "$oficina"; fi
  return 0
}
trap faxina EXIT

# Fotografia do tamanho da tabela ANTES de qualquer cenario, com limpar() antes
# dela de proposito: lixo de uma execucao abortada sumiria no MEIO da suite e a
# guarda do fim leria isso como "a suite apagou uma linha de verdade".
limpar
linhas_antes=$($DB -c "SELECT count(*) FROM email_outbox;")

echo "== unicidade: o mesmo acontecimento nao entra duas vezes =="
# Todo INSERT desta suite e tolerado, e o resultado de cada um chega a alguma
# assertiva. Nao e frouxidao: nenhum deles esta sendo ignorado, e um comando
# que quebra vira vermelho em vez de matar a suite no meio -- que e o modo de
# falha caro, porque as assertivas seguintes nunca imprimem e a limpeza do fim
# nao roda.
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, payload)
  VALUES ('$KIND_A', 'inscricao-1', '{\"registration_id\":\"r1\"}'::jsonb);
" > /dev/null 2>&1 || true
checar "a primeira insercao cria a linha" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_A';")"

# Repetir o par SEM rede tem de ser RECUSADO, e recusado pelo NOME da
# restricao. O `|| true` aqui nao afrouxa nada -- o erro nao esta sendo
# ignorado, esta sendo medido na linha seguinte. O que ele evita e o `set -e`
# matar o script no meio e levar junto as assertivas que ainda tem o que dizer:
# num banco COM o indice -- o caso normal -- este insert erra em TODA execucao,
# entao sem a guarda a suite morreria aqui sempre. (Sem o indice ele passa
# calado; quem quebra naquele banco e o ON CONFLICT logo abaixo.)
saida=$($DB -c "
  INSERT INTO email_outbox (kind, dedupe_key)
  VALUES ('$KIND_A', 'inscricao-1');
" 2>&1 || true)
checar "sem ON CONFLICT, a repeticao levanta erro de unicidade" "unicidade" \
  "$(erro_estado "$saida")"
checar "e a repeticao recusada nao deixou segunda linha" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_A';")"

# ON CONFLICT DO NOTHING e a forma que um gatilho usaria: repetir nao pode
# derrubar a transacao de quem esta gravando a inscricao, entao aqui o esperado
# e passar CALADO. Esta assertiva tambem morde do outro lado: sem o indice
# unico o proprio comando quebra, porque ON CONFLICT exige uma restricao que
# case com a lista de colunas.
saida=$($DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, payload)
  VALUES ('$KIND_A', 'inscricao-1', '{\"registration_id\":\"r1\"}'::jsonb)
  ON CONFLICT (kind, dedupe_key) DO NOTHING;
" 2>&1 || true)
checar "com ON CONFLICT, a repeticao passa sem erro" "sem_erro" \
  "$(erro_estado "$saida")"

echo "== a mesma dedupe_key sob outro kind e outro acontecimento =="
# Confirmacao de e-mail e lembrete de pagamento da MESMA inscricao sao dois
# e-mails legitimos. Se a unicidade fosse so em dedupe_key, o segundo sumiria.
#
# O `|| true` NAO e decoracao aqui, e e o defeito que ele antecipa que explica:
# se alguem estreitar a unicidade para `UNIQUE (dedupe_key)` sozinho, e ESTE
# insert que passa a quebrar. Sem a guarda, o `set -e` matava a suite nesta
# linha -- as assertivas seguintes nunca imprimiam e o limpar() do fim nao
# rodava, deixando linha de teste na fila. Com a guarda, o mesmo defeito vira
# vermelho legivel e a suite termina inteira.
saida=$($DB -c "
  INSERT INTO email_outbox (kind, dedupe_key)
  VALUES ('$KIND_B', 'inscricao-1');
" 2>&1 || true)
checar "a mesma dedupe_key sob outro kind entra" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_B' AND dedupe_key='inscricao-1';")"

echo "== o formato da linha: o que a tabela recusa na porta =="
# As tres guardas abaixo sao de SCHEMA, nao de fluxo. Elas nao aparecem em
# nenhum cenario acima porque os cenarios acima escrevem linhas bem formadas --
# e um defeito que afrouxasse o formato passaria por todos eles calado.

# `dedupe_key` nula desligaria em SILENCIO a protecao inteira: em indice unico
# NULL nao colide com NULL, entao o mesmo acontecimento com chave nula entraria
# quantas vezes disparasse, e cada entrada e um e-mail a mais na caixa de
# alguem. E a unica das tres em que o dano nao aparece como erro em lugar
# nenhum -- so como e-mail repetido, depois, na caixa de outra pessoa.
saida=$($DB -c "
  INSERT INTO email_outbox (kind, dedupe_key)
  VALUES ('$KIND_N', NULL);
" 2>&1 || true)
checar "dedupe_key nula e recusada na porta" "nula_recusada" \
  "$(erro_estado "$saida")"

# Os quatro status validos ANTES do invalido, de proposito: se o CHECK sumir, o
# insert invalido passa a gravar, e uma contagem feita depois dele acusaria o
# cenario vizinho junto. Medindo primeiro, cada defeito acende uma assertiva so.
#
# Esta assertiva pega APERTO, e a de baixo pega afrouxamento. Sao direcoes
# diferentes e nenhuma cobre a outra: quem tirar 'sending' da lista nao afrouxa
# nada -- aperta -- e quebra o dreno em producao no dia em que ele marcar a
# linha antes de chamar o provedor, sem nenhum teste ter reclamado.
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, status) VALUES
    ('$KIND_S', 'st-1', 'pending'),
    ('$KIND_S', 'st-2', 'sending'),
    ('$KIND_S', 'st-3', 'sent'),
    ('$KIND_S', 'st-4', 'failed_permanent');
" > /dev/null 2>&1 || true
checar "os quatro status do ciclo de vida entram" "4" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_S';")"

saida=$($DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, status)
  VALUES ('$KIND_S', 'st-invalido', 'entregue-talvez');
" 2>&1 || true)
checar "status fora do ciclo de vida e recusado" "status_recusado" \
  "$(erro_estado "$saida")"

# Lido de pg_indexes e nao de um SELECT de plano: o que se quer prender e a
# DEFINICAO do indice, nao o humor do planejador, que troca de plano com o
# tamanho da tabela e devolveria verde numa tabela vazia de qualquer jeito.
checar "o indice do dreno existe e e parcial" "parcial" \
  "$(indice_estado "$($DB -c "SELECT indexdef FROM pg_indexes WHERE tablename='email_outbox' AND indexname='email_outbox_pending';")")"

echo "== concorrencia: dois drenos nao pegam a mesma linha =="
limpar
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, next_attempt_at) VALUES
    ('$KIND_L', 'lock-1', now() - interval '1 minute'),
    ('$KIND_L', 'lock-2', now() - interval '1 minute');
" > /dev/null 2>&1 || true

oficina=$(mktemp -d)

# A conexao 1 abre transacao, pega a primeira linha e SEGURA o lock sem
# commitar. O marcador CONN1SEGURANDO viaja no texto do pg_sleep para a
# assertiva de sobreposicao poder achar esta sessao em pg_stat_activity.
# Sem underscore no marcador: ele e procurado com LIKE, onde `_` e coringa.
$DB > "$oficina/conn1.txt" 2>&1 <<SQL &
BEGIN;
SELECT 'CONN1=' || dedupe_key
  FROM email_outbox
 WHERE kind = '$KIND_L' AND status = 'pending' AND next_attempt_at <= now()
 ORDER BY dedupe_key
 LIMIT 1
   FOR UPDATE SKIP LOCKED;
SELECT pg_sleep(5) /* CONN1SEGURANDO */;
COMMIT;
SQL
conn1_pid=$!

# Folga dos dois lados: a 2 roda por volta de t=2s e a 1 so solta em t=5s.
sleep 2

# A conexao 2 roda a MESMA consulta enquanto a 1 segura. Com SKIP LOCKED ela
# tem de pular a linha travada e voltar com a OUTRA.
conn2=$($DB -c "
  SELECT dedupe_key
    FROM email_outbox
   WHERE kind = '$KIND_L' AND status = 'pending' AND next_attempt_at <= now()
   ORDER BY dedupe_key
   LIMIT 1
     FOR UPDATE SKIP LOCKED;
" | tr -d ' ')

# Medida ANTES do wait, de proposito: e a unica janela em que a sobreposicao
# ainda existe para ser observada. Depois do wait a sessao 1 ja fechou e esta
# contagem voltaria 0 mesmo num cenario perfeito.
#
# NUANCE, para quem estiver depurando isto as duas da manha: a medida acontece
# DEPOIS que a conexao 2 retornou, e nao enquanto ela roda. A diferenca importa
# num caso -- se alguem trocar o SKIP LOCKED da conexao 2 por um `FOR UPDATE`
# puro, ela BLOQUEIA ate a 1 soltar, e quando esta contagem finalmente roda a
# sessao 1 ja se foi: da 0 e fica vermelha JUNTO com a assertiva de baixo.
# Nesse cenario o vermelho daqui e artefato da ordem da medida, nao ausencia de
# sobreposicao -- houve sobreposicao, e das boas. A direcao do erro e segura
# (falha fechado, nunca verde a toa), mas nao leia esse vermelho como
# "as conexoes nao se cruzaram".
segurando=$($DB -c "
  SELECT count(*) FROM pg_stat_activity
   WHERE pid <> pg_backend_pid()
     AND state = 'active'
     AND query LIKE '%CONN1SEGURANDO%';
")

wait "$conn1_pid" || true

conn1=$(sed -n 's/^CONN1=//p' "$oficina/conn1.txt" | tr -d ' ')
rm -rf "$oficina"

# Esta assertiva vem PRIMEIRO porque ela e a que diz se a proxima significa
# alguma coisa. Sem sobreposicao real, "pegaram linhas diferentes" seria so o
# relato de duas consultas sequenciais -- verde comprado barato.
checar "a conexao 1 ainda segurava o lock quando a 2 rodou" "1" "$segurando"
checar "as duas conexoes pegam linhas diferentes" "lock-1|lock-2" "$conn1|$conn2"

echo "== o claim do dreno: pegar e marcar na mesma instrucao =="
# Esta familia prova a UNICA instrucao SQL do dreno,
# `claim_email_outbox_batch` (migration 20260823040000). Ela nao prova envio
# nenhum: quem envia recebe um EmailSender e vive em features/email/outbox.ts,
# com suite propria no vitest e sem tocar a rede.
limpar
# Fotografia do que ja estava em 'sending' por fora deste cenario. A funcao NAO
# filtra por kind -- ela pega o proximo lote da fila inteira --, entao ha
# assertiva no fim conferindo que ela nao arrastou linha de ninguem junto.
sending_fora_antes=$($DB -c "SELECT count(*) FROM email_outbox WHERE status='sending' AND kind <> '$KIND_C';")

$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, next_attempt_at) VALUES
    ('$KIND_C', 'claim-1', $CLAIM_PASSADO),
    ('$KIND_C', 'claim-2', $CLAIM_PASSADO2);
" > /dev/null

# ── Concorrencia, que e a razao de a funcao existir ──────────────────────────
#
# Mesma armadilha do cenario da consulta crua acima: sequencial, isto passaria
# IDENTICO com o lock quebrado. A conexao 1 abre transacao, chama o claim e
# SEGURA sem commitar; a 2 chama enquanto isso e tem de voltar com a OUTRA
# linha.
#
# O defeito que isto pega e o unico que importa aqui: sem o lock, os dois
# disparos do cron leem as mesmas linhas pendentes e mandam os mesmos e-mails.
# A unicidade (kind, dedupe_key) da tabela NAO protege disso -- ela impede linha
# repetida, nao envio repetido da mesma linha.
oficina=$(mktemp -d)
$DB > "$oficina/claim1.txt" 2>&1 <<SQL &
BEGIN;
SELECT 'CLAIM1=' || dedupe_key FROM claim_email_outbox_batch(1, now());
SELECT pg_sleep(5) /* CLAIMSEGURANDO */;
COMMIT;
SQL
claim1_pid=$!

sleep 2

claim2=$($DB -c "SELECT dedupe_key FROM claim_email_outbox_batch(1, now());" | tr -d ' ')

# Medida ANTES do wait, pelo mesmo motivo detalhado no cenario da consulta crua:
# depois do wait a sessao 1 ja fechou e isto voltaria 0 num cenario perfeito.
segurando_claim=$($DB -c "
  SELECT count(*) FROM pg_stat_activity
   WHERE pid <> pg_backend_pid()
     AND state = 'active'
     AND query LIKE '%CLAIMSEGURANDO%';
")

wait "$claim1_pid" || true
claim1=$(sed -n 's/^CLAIM1=//p' "$oficina/claim1.txt" | tr -d ' ')
rm -rf "$oficina"
oficina=""

# Primeiro esta, porque ela e a que diz se a proxima significa alguma coisa --
# e porque, neste cenario, ela e CORDA UNICA.
#
# MEDIDO: trocando `FOR UPDATE SKIP LOCKED` por `FOR UPDATE` puro na funcao, a
# assertiva de baixo fica VERDE. A conexao 2 bloqueia, espera a 1 commitar, e
# so entao pega a outra linha -- o resultado final e o mesmo, e o unico sinal
# de que houve espera em vez de salto e esta contagem, que le a sessao 1 ainda
# ativa. Sem SKIP LOCKED o dreno nao manda e-mail repetido; ele SERIALIZA, e um
# disparo fica pendurado atras do outro ate estourar o tempo da funcao.
#
# Quem for mexer nos `sleep` deste cenario esta mexendo na unica corda: e a
# folga entre os dois (a 2 roda por volta de t=2s, a 1 so solta em t=5s) que faz
# a sobreposicao existir para ser medida.
checar "a conexao 1 ainda segurava o lock quando a 2 chamou o claim" "1" "$segurando_claim"
checar "os dois claims pegam linhas diferentes" "claim-1|claim-2" "$claim1|$claim2"

checar "o claim marcou as duas linhas como sending" "sending|sending" \
  "$($DB -c "SELECT string_agg(status, '|' ORDER BY dedupe_key) FROM email_outbox WHERE kind='$KIND_C';")"

# Sem carimbo, 'sending' e estado sem saida: a linha nao esta pendente para ser
# tentada nem enviada para alguem ter recebido. E assim que um e-mail se perde
# em silencio quando o processo morre no meio.
checar "e carimbou claimed_at nas duas" "true|true" \
  "$($DB -c "SELECT string_agg((claimed_at IS NOT NULL)::text, '|' ORDER BY dedupe_key) FROM email_outbox WHERE kind='$KIND_C';")"

# ROLLBACK porque o claim NAO filtra por kind: sem ele, este claim de sondagem
# arrastaria para 'sending' duas linhas de fora do cenario e as deixaria la.
checar "a linha ja pega nao volta no claim seguinte" "0" \
  "$($DB <<'SQL' | sem_rotulo
BEGIN;
SELECT count(*) FROM claim_email_outbox_batch(2, now()) WHERE dedupe_key IN ('claim-1','claim-2');
ROLLBACK;
SQL
)"

# ── next_attempt_at no futuro: e assim que o backoff se expressa ─────────────
limpar
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, next_attempt_at)
  VALUES ('$KIND_C', 'claim-futuro', now() + interval '1 hour');
" > /dev/null
# Limite absurdo, e ele e o ponto. Com um limite pequeno esta assertiva NAO
# DISCRIMINA -- foi medido: `ORDER BY next_attempt_at` poe a linha do futuro no
# FIM da fila, entao com o filtro `next_attempt_at <= p_now` arrancado ela
# continua fora do lote, e a assertiva sai verde sobre um dreno que ignora o
# backoff inteiro. Pedindo a fila toda, a linha do futuro so fica de fora se o
# filtro estiver la. O ROLLBACK e o que torna isso seguro.
checar "o claim nao pega linha cujo next_attempt_at ainda esta no futuro" "0" \
  "$($DB <<'SQL' | sem_rotulo
BEGIN;
SELECT count(*) FROM claim_email_outbox_batch(1000000, now()) WHERE dedupe_key = 'claim-futuro';
ROLLBACK;
SQL
)"

# ── Recolhimento do que ficou parado ─────────────────────────────────────────
#
# Um de cada lado do limite (por padrao 31 e 29 minutos, de CLAIM_LIMITE_MIN).
# Um so dos dois nao provaria nada: com o recolhimento desligado o de ALEM fica
# para tras, e com o limite frouxo o de AQUEM e recolhido cedo demais -- e
# recolher cedo e mandar de novo o que talvez ja tenha saido.
limpar
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, status, next_attempt_at, claimed_at) VALUES
    ('$KIND_C', 'claim-parado',  'sending', $CLAIM_PASSADO,  now() - interval '$CLAIM_ALEM minutes'),
    ('$KIND_C', 'claim-recente', 'sending', $CLAIM_PASSADO2, now() - interval '$CLAIM_AQUEM minutes');
" > /dev/null

checar "o claim recolhe a linha parada em sending alem do limite" "claim-parado" \
  "$($DB -c "SELECT dedupe_key FROM claim_email_outbox_batch(1, now());" | tr -d ' ')"

checar "e nao recolhe a que ainda esta dentro do limite" "(vazio)" \
  "$($DB <<'SQL' | sem_rotulo
BEGIN;
SELECT coalesce(string_agg(dedupe_key, ','), '(vazio)')
  FROM claim_email_outbox_batch(1, now()) WHERE dedupe_key = 'claim-recente';
ROLLBACK;
SQL
)"

checar "o claim nao arrastou nenhuma linha de fora deste cenario" "$sending_fora_antes" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE status='sending' AND kind <> '$KIND_C';")"

# ── Quem pode chamar ────────────────────────────────────────────────────────
#
# `REVOKE ... FROM PUBLIC` NAO fecha nada sozinho neste projeto: `anon` e
# `authenticated` recebem privilegio NOMINAL por ALTER DEFAULT PRIVILEGES, e
# privilegio nominal so sai por REVOKE nominal. As duas metades da assertiva
# importam -- so "o dreno consegue" passaria identico com a funcao aberta a
# todo mundo.
checar "o dreno executa o claim, e anon e authenticated nao" "true|false|false" \
  "$($DB -c "SELECT has_function_privilege('service_role','public.claim_email_outbox_batch(int,timestamptz)','EXECUTE')::text
             || '|' || has_function_privilege('anon','public.claim_email_outbox_batch(int,timestamptz)','EXECUTE')::text
             || '|' || has_function_privilege('authenticated','public.claim_email_outbox_batch(int,timestamptz)','EXECUTE')::text;")"

# `is_sabbath` levou o mesmo REVOKE na migration 20260819030000, e o dreno
# depende dela: e a primeira das cinco guardas de envio. Se ela fechasse para o
# service_role, o dreno nao teria como saber que a pausa comecou.
checar "o dreno executa is_sabbath, e anon e authenticated nao" "true|false|false" \
  "$($DB -c "SELECT has_function_privilege('service_role','public.is_sabbath(timestamptz)','EXECUTE')::text
             || '|' || has_function_privilege('anon','public.is_sabbath(timestamptz)','EXECUTE')::text
             || '|' || has_function_privilege('authenticated','public.is_sabbath(timestamptz)','EXECUTE')::text;")"

# O privilegio no banco nao e o caminho do dreno: ele chama por RPC do
# PostgREST, e la um privilegio certo com a funcao fora do cache do schema da
# 404. As duas metades de novo -- a do anon e o controle que prova que a
# primeira nao e so "qualquer chave passa".
API_URL=$(supabase status -o env 2>/dev/null | sed -n 's/^API_URL="\(.*\)"$/\1/p')
SRK=$(supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
ANONK=$(supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
rpc_status() {
  # $1 = chave. Devolve so o codigo HTTP.
  curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/is_sabbath" \
    -H "apikey: $1" -H "Authorization: Bearer $1" -H "Content-Type: application/json" \
    -d '{"p_at":"2026-08-22T20:00:00Z"}'
}
checar "is_sabbath responde ao dreno pelo PostgREST, e recusa o anon" "200|401" \
  "$(rpc_status "$SRK")|$(rpc_status "$ANONK")"

limpar

echo "== o gatilho: quem escreve na fila =="
# Daqui para baixo os cenarios usam os kinds DE VERDADE, porque quem escolhe o
# kind e o gatilho -- ver o comentario junto de CHAMP_T. A limpeza destes e por
# dedupe_key, e ela mora no limpar() la de cima.
limpar
$DB -c "
  INSERT INTO championships (id, name, slug, status, max_players, max_waitlist_players)
  VALUES ('$CHAMP_T', 'Teste fila C1', 'teste-fila-c1', 'subscribing', 10, 5);
  INSERT INTO players (cpf, name, email) VALUES
    ('$CPF_T',  'Fila C1 um',   '$EMAIL_CADASTRO'),
    ('$CPF_T2', 'Fila C1 dois', '$EMAIL_CADASTRO');
" > /dev/null 2>&1 || true
pid1=$($DB -c "SELECT id FROM players WHERE cpf='$CPF_T';")
pid2=$($DB -c "SELECT id FROM players WHERE cpf='$CPF_T2';")
checar "as fixturas do gatilho existem" "1|1|1" \
  "$($DB -c "SELECT (SELECT count(*) FROM championships WHERE id='$CHAMP_T') || '|' ||
                    (SELECT count(*) FROM players WHERE cpf='$CPF_T') || '|' ||
                    (SELECT count(*) FROM players WHERE cpf='$CPF_T2');")"

echo "== ROLLBACK da inscricao nao deixa e-mail na fila =="
# A propriedade CENTRAL do desenho: o gatilho roda na mesma transacao de quem
# grava a inscricao. Sem ela, uma inscricao desfeita -- por habilidade invalida,
# por erro no meio da RPC -- deixaria para tras a confirmacao de uma inscricao
# que nao existe, e alguem receberia "sua inscricao foi confirmada" sem estar
# inscrito.
#
# Este cenario vem ANTES do de baixo de proposito: ele usa o jogador 1, e o
# UNIQUE (championship_id, player_id) so o deixa livre enquanto ele nao tem
# inscricao gravada neste campeonato.
#
# A medida DENTRO da transacao nao e enfeite -- e ela que faz o zero de depois
# significar alguma coisa. Sem gatilho nenhum o "0 depois do ROLLBACK" sai
# verde igual, e o cenario inteiro viraria a constatacao de que uma tabela
# vazia continua vazia.
saida=$($DB 2>&1 <<SQL || true
BEGIN;
INSERT INTO championship_registrations (id, championship_id, player_id)
VALUES ('$REG_ROLL', '$CHAMP_T', '$pid1');
SELECT 'DENTRO=' || count(*) FROM email_outbox WHERE dedupe_key = '$REG_ROLL';
ROLLBACK;
SQL
)
checar "dentro da transacao a fila JA tinha as duas linhas" "2" \
  "$(echo "$saida" | sed -n 's/^DENTRO=//p' | tr -d ' ')"
checar "depois do ROLLBACK a fila nao guardou nada" "0" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE dedupe_key='$REG_ROLL';")"
checar "e a propria inscricao tambem foi desfeita" "0" \
  "$($DB -c "SELECT count(*) FROM championship_registrations WHERE id='$REG_ROLL';")"

echo "== uma inscricao gravada enfileira DUAS linhas =="
# Um gatilho, duas linhas -- e nao dois gatilhos. Sao dois destinatarios do
# MESMO acontecimento, e por isso a dedupe_key das duas e a mesma (o id da
# inscricao) e o que as separa e o kind.
$DB -c "
  INSERT INTO championship_registrations (id, championship_id, player_id)
  VALUES ('$REG_FILA', '$CHAMP_T', '$pid1');
" > /dev/null 2>&1 || true
checar "a dedupe_key das duas linhas e o id da inscricao" "2" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE dedupe_key='$REG_FILA';")"
# Contar duas linhas nao diz QUAIS, e o que esta assertiva pega e kind trocado
# ou com typo: escrever 'registration_commited' no lugar de
# 'registration_committed' deixa a contagem em 2 -- medido -- e so acende aqui.
# A fila ficaria com um kind que dreno nenhum reconhece.
#
# O que ela NAO precisa pegar e a confirmacao enfileirada duas vezes: com
# UNIQUE (kind, dedupe_key) mais ON CONFLICT DO NOTHING as duas colapsam em UMA
# linha -- medido --, e quem acende e a contagem de cima, com esperado [2].
checar "e as duas sao a confirmacao e o aviso da organizacao" \
  "organizer_new_registration|registration_committed" \
  "$($DB -c "SELECT string_agg(kind, '|' ORDER BY kind) FROM email_outbox WHERE dedupe_key='$REG_FILA';")"
# O contrato do payload: IDENTIFICADOR, nunca texto pronto. E o que faz o corpo
# ser montado na hora do envio, com o dado ja corrigido.
checar "o payload das duas leva o identificador da inscricao" "2" \
  "$($DB -c "SELECT count(*) FROM email_outbox
              WHERE dedupe_key='$REG_FILA' AND payload->>'registration_id' = '$REG_FILA';")"

echo "== commit_registration grava o contact_email do jsonb =="
# ESTE e o cenario da armadilha: o INSERT da funcao tem lista EXPLICITA de
# colunas, entao acrescentar a chave ao jsonb sem acrescentar a coluna la nao
# grava nada e nao levanta erro nenhum. Mutacao que o prende: tire
# `contact_email` da lista de colunas do INSERT de commit_registration e a
# assertiva de baixo tem de ficar VERMELHA, com o rotulo `nulo`.
#
# Jogador 2, porque o 1 ja tem inscricao neste campeonato.
r=$($DB -c "SELECT commit_registration('$CHAMP_T', '$pid2', '$CPF_T2',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0,\"contact_email\":\"$EMAIL_T\"}'::jsonb,
      '{}'::jsonb)::text;" 2>&1 || true)
# Esta assertiva vem primeiro porque ela e a que diz se a proxima significa
# alguma coisa -- e porque e ela que acende quando o relogio esta dentro da
# pausa de sabado, em vez de a proxima acender por um motivo que nao e o dela.
checar "a RPC gravou a inscricao" "true" \
  "$(echo "$r" | sed 's/.*"success" : \([a-z]*\).*/\1/')"
reg_rpc=$($DB -c "SELECT id FROM championship_registrations WHERE player_id='$pid2' AND championship_id='$CHAMP_T';")
checar "o contact_email do jsonb chegou na coluna" "digitado" \
  "$(email_estado "$($DB -c "SELECT coalesce(contact_email, '(NULO)')
                               FROM championship_registrations WHERE id='$reg_rpc';" 2>&1)")"
checar "e a inscricao vinda da RPC tambem enfileirou as duas" "2" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE dedupe_key='$reg_rpc';")"

echo "== o dreno le as SETE colunas do resumo pelo caminho do PostgREST =="
# A rede contra a armadilha do `select` de services/email-outbox.ts.
#
# Ela existe porque NENHUM teste do vitest pega uma coluna faltando la, e isso
# foi MEDIDO, nao suposto: a suite do dreno usa store falso; a string de
# `select` do cliente do Supabase nao passa por typecheck nenhum; e
# `services/**` nem sequer e coletado pelo `vitest.config.ts` -- um
# `services/*.test.ts` afirmando `expect(1).toBe(2)` deixa a suite verde.
#
# Tirar `is_waitlist` daquela string deixa `npx tsc --noEmit` em zero, deixa a
# suite inteira verde, e faz TODO comprovante de lista de espera sair dizendo
# "sua inscricao esta confirmada". E a mesma armadilha da allowlist do `toRow`
# no admin, e o antidoto e o mesmo: ler pelo caminho DE VERDADE -- PostgREST,
# chave do service_role, o mesmo embed aninhado, a mesma lista de colunas.
#
# ── SETE, E NAO SEIS: A CONTA QUE ESTE COMENTARIO JA ERROU ──
#
# O `select` pede SETE colunas: `id` -- que nao e campo do resumo, e sim a
# CHAVE por onde `summariesById` indexa -- mais as seis que viram
# `RegistrationSummary`.
#
# A versao anterior deste cenario asseverava seis trechos e um deles era o
# `id`, entao SOBRAVA uma coluna sem prova: `players.name`, o nome que vira
# "Olá, {nome}!" em TODO comprovante. O `"name":"Teste fila C1"` que parecia
# cobri-lo casa o nome do CAMPEONATO, que vem do outro embed.
#
# MEDIDO no dia em que isso foi consertado: tirando `name` de
# `players(email,name,preferred_position)`, o cenario ficava VERDE -- 43 ok,
# exit 0, "TODOS OS CENARIOS PASSARAM". O comentario que estava aqui mandava a
# proxima pessoa validar por uma mutacao que nao acendia.
#
# A MUTACAO que a prende: tire QUALQUER UMA das sete colunas do `select` daqui,
# e o cenario tem de ficar VERMELHO. Se ficar verde sem a coluna, a prova nao e
# prova -- e foi exatamente o que aconteceu com `players.name`.
#
# As duas gravacoes abaixo existem porque as fixturas nascem com
# `preferred_position` nulo e `is_waitlist` falso -- e valor AUSENTE nao
# distingue "a coluna nao veio" de "a coluna veio vazia". Com `true` e `'ATA'`
# na mesa, a ausencia da coluna vira ausencia do trecho procurado.
$DB -c "
  UPDATE players SET preferred_position = 'ATA' WHERE cpf = '$CPF_T2';
  UPDATE championship_registrations SET is_waitlist = true WHERE id = '$reg_rpc';
" > /dev/null
# UPDATE, e nao INSERT, tambem de proposito: nenhum dos dois gatilhos desta
# tabela reage a ESTAS colunas -- `trg_enqueue_registration_emails` e AFTER
# INSERT, e `trg_enqueue_payment_verified` e AFTER UPDATE **OF
# payment_verified**, que so dispara quando aquela coluna esta no SET. Medido em
# `\d championship_registrations`. Entao isto nao acrescenta linha a fila e as
# contagens dos cenarios de baixo continuam valendo.

SELECT_DRENO="id,is_waitlist,contact_email,championships(name),players(email,name,preferred_position)"
resumo=$(curl -s "$API_URL/rest/v1/championship_registrations?id=eq.$reg_rpc&select=$SELECT_DRENO" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK")

# MEDIDO, e as duas surpresas custam uma leitura ingenua: o PostgREST devolve o
# nivel de cima SEM espaco depois dos dois-pontos (`"is_waitlist":false`) e os
# objetos ANINHADOS COM espaco (`{"name": "Copa"}`); e a ordem das chaves dentro
# do aninhado NAO segue a do `select` (pedindo `email,name,preferred_position`
# volta `name,email,preferred_position`). Entao a resposta e normalizada aqui, e
# cada coluna e procurada sozinha, sem depender de vizinhanca nem de ordem.
#
# Here-doc, e nao `| sed`: pipe de saida ja truncou medicao neste ambiente.
compacto=$(sed 's/": /":/g' <<JSON
$resumo
JSON
)

# Sem `grep`: `grep -c` ja devolveu 0 para arquivo com quatro ocorrencias neste
# repo, e `grep | wc -l` mente. O casamento de padrao do proprio sh nao passa
# por nenhum dos dois.
tem() {
  # $1 = trecho procurado, $2 = resposta ja normalizada.
  case "$2" in
    *"$1"*) echo "sim" ;;
    *)      echo "nao" ;;
  esac
}

# O nome do JOGADOR e o do CAMPEONATO sao procurados separados, e por isso as
# fixturas tem nomes distintos (`Fila C1 dois` e `Teste fila C1`): com o mesmo
# texto nos dois, um trecho so casaria os dois embeds e a falta de um passaria.
checar "as sete colunas do resumo voltam preenchidas pelo PostgREST" \
  "sim|sim|sim|sim|sim|sim|sim" \
  "$(tem "\"id\":\"$reg_rpc\"" "$compacto")|$(tem '"is_waitlist":true' "$compacto")|$(tem "\"contact_email\":\"$EMAIL_T\"" "$compacto")|$(tem '"name":"Teste fila C1"' "$compacto")|$(tem "\"email\":\"$EMAIL_CADASTRO\"" "$compacto")|$(tem '"name":"Fila C1 dois"' "$compacto")|$(tem '"preferred_position":"ATA"' "$compacto")"

# O controle da assertiva de cima: sem ele, "sim" sete vezes tambem sairia de
# uma resposta que o `tem` estivesse lendo errado. Este par prova que o `tem`
# DISTINGUE -- procurando um valor que o banco nao tem, ele responde "nao".
checar "e a leitura distingue: o que nao esta la volta como ausente" "nao|nao" \
  "$(tem '"is_waitlist":false' "$compacto")|$(tem '"preferred_position":"GOL"' "$compacto")"

# A posicao chega ao dreno como CODIGO, e nao como palavra. Quem traduz e
# `positionLabel`, no template do aviso da organizacao -- ha assertiva la. Se
# esta linha um dia virar "Atacante", o vocabulario da coluna voltou atras e o
# A8 desandou.
checar "a posicao vem CRUA, como codigo" "ATA" \
  "$($DB -c "SELECT preferred_position FROM players WHERE cpf='$CPF_T2';")"

echo "== a mesma inscricao entrando de novo nao duplica a fila =="
# O caso real e o restore: a inscricao volta com o MESMO id, o gatilho dispara
# de novo, e as linhas de fila dela nunca sairam -- nao ha FK entre as duas
# tabelas. Sem `ON CONFLICT DO NOTHING` este INSERT levantaria erro de
# unicidade e derrubaria a transacao de quem esta gravando a inscricao.
$DB -c "DELETE FROM championship_registrations WHERE id='$REG_FILA';" > /dev/null 2>&1 || true
checar "a fila sobrevive a inscricao apagada" "2" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE dedupe_key='$REG_FILA';")"
saida=$($DB -c "
  INSERT INTO championship_registrations (id, championship_id, player_id)
  VALUES ('$REG_FILA', '$CHAMP_T', '$pid1');
" 2>&1 || true)
checar "a reinsercao do mesmo id passa sem erro" "sem_erro" "$(erro_estado "$saida")"
checar "e nao acrescentou linha nenhuma a fila" "2" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE dedupe_key='$REG_FILA';")"

echo "== o check de pagamento: quem pode marcar =="
# ── POR QUE ESTE CENARIO PASSA PELO PostgREST, E NAO PELO $DB ────────────────
#
# Porque pelo $DB ele passaria COM O DEFEITO NO LUGAR. O `$DB` conecta como
# `postgres`, que e dono de email_outbox e tem `rolbypassrls` -- ou seja,
# contorna as duas barreiras que este cenario existe para provar. Marcar o
# pagamento por ali funciona ate com o gatilho sem SECURITY DEFINER.
#
# O caminho de verdade e outro: o admin muta pelo cliente do navegador, em
# sessao `authenticated` (ver `markPaymentVerified` em PlayersSection.tsx). Nela
# o INSERT do gatilho esbarra em DUAS barreiras independentes de email_outbox --
# o REVOKE nominal e a RLS com zero policies --, e falha de gatilho ABORTA o
# UPDATE. Sem o definer, marcar o pagamento nao deixa so de mandar e-mail:
# deixa de SALVAR, e o admin ve um erro.
#
# ── O QUE A RECUSA DA RLS PARECE, E POR QUE MEDIR O CODIGO HTTP NAO SERVE ────
#
# MEDIDO: `anon` e `authenticated` TEM o GRANT de UPDATE nesta tabela (vem por
# ALTER DEFAULT PRIVILEGES), entao nao ha erro de permissao. Quem recusa e a
# RLS, e ela recusa FILTRANDO: o PostgREST responde 200 com `[]`, e a coluna
# nao muda. Uma assertiva sobre o codigo HTTP ficaria verde com a RLS aberta.
# Por isso o que se mede aqui e a REPRESENTACAO das linhas afetadas e o valor
# da coluna depois.
JWT_SECRET_LOCAL=$(supabase status -o env 2>/dev/null | sed -n 's/^JWT_SECRET="\(.*\)"$/\1/p')

oficina=$(mktemp -d)

# O extrator do access_token, em arquivo em vez de `node -e` inline: a citacao
# de JSON dentro de sh dentro de node e onde este tipo de linha quebra calada.
cat > "$oficina/token.mjs" <<'JS'
let corpo = "";
process.stdin.on("data", (c) => (corpo += c));
process.stdin.on("end", () => {
  try {
    process.stdout.write(JSON.parse(corpo).access_token || "");
  } catch {
    process.stdout.write("");
  }
});
JS

# O `authenticated` NAO-ADMIN, cunhado com o segredo do stack local.
#
# Cunhado, e nao criado em auth.users, de proposito: o que faz alguem ser
# nao-admin aqui e NAO TER linha em `profiles` com role='admin' -- e isso
# `is_admin()` le do `sub` do JWT. Um token assinado com o segredo local, com
# `role: authenticated` e um `sub` sem perfil, E uma sessao authenticated
# nao-admin para todos os efeitos do PostgREST e da RLS -- e nao deixa usuario
# de teste para tras em auth.users.
#
# Ha assertiva logo abaixo conferindo que os tres tokens sao quem dizem ser.
# Sem ela, um token expirado ou mal assinado "recusaria" pelo motivo errado e o
# cenario ficaria verde com a RLS aberta.
cat > "$oficina/cunhar.mjs" <<'JS'
import { createHmac } from "node:crypto";
const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const cabecalho = seg({ alg: "HS256", typ: "JWT" });
const agora = Math.floor(Date.now() / 1000);
const corpo = seg({
  sub: process.argv[3],
  role: "authenticated",
  aud: "authenticated",
  iat: agora,
  exp: agora + 3600,
});
const assinatura = createHmac("sha256", process.argv[2])
  .update(`${cabecalho}.${corpo}`)
  .digest("base64url");
process.stdout.write(`${cabecalho}.${corpo}.${assinatura}`);
JS

ADMIN_TOKEN=$(curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANONK" -H "Content-Type: application/json" \
  -d '{"email":"admin@local.test","password":"Admin123!"}' | node "$oficina/token.mjs" || true)
NAOADMIN_TOKEN=$(node "$oficina/cunhar.mjs" "$JWT_SECRET_LOCAL" "$SUB_SEM_PERFIL" || true)
rm -rf "$oficina"
oficina=""

# O admin local vem de scripts/seed-auth-local.sh. Sem ele o cenario inteiro
# nao vale nada, e esta assertiva e a que diz isso em vez de deixar as de baixo
# ficarem verdes por token vazio.
checar "o token do admin local foi emitido" "sim" \
  "$([ -n "$ADMIN_TOKEN" ] && echo sim || echo nao)"

is_admin_de() {
  # $1 = token. Devolve o que a RLS vai enxergar.
  curl -s -X POST "$API_URL/rest/v1/rpc/is_admin" \
    -H "apikey: $ANONK" -H "Authorization: Bearer $1" \
    -H "Content-Type: application/json" -d '{}'
}
# O CONTROLE das tres recusas de baixo: prova que os tokens sao distintos e que
# cada um chega ao banco como quem se diz. Com um token invalido, todos os tres
# dariam "false" e as recusas nao provariam nada.
checar "os tres tokens chegam ao banco como quem dizem ser" "true|false|false" \
  "$(is_admin_de "$ADMIN_TOKEN")|$(is_admin_de "$NAOADMIN_TOKEN")|$(is_admin_de "$ANONK")"

pv_patch() {
  # $1 = token. Marca o pagamento pelo caminho do PostgREST e devolve a
  # REPRESENTACAO das linhas afetadas -- `[]` quando a RLS filtrou tudo.
  curl -s -X PATCH "$API_URL/rest/v1/championship_registrations?id=eq.$REG_FILA" \
    -H "apikey: $ANONK" -H "Authorization: Bearer $1" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d '{"payment_verified":true}'
}
pv_coluna() { $DB -c "SELECT payment_verified FROM championship_registrations WHERE id='$REG_FILA';"; }
pv_fila()   { $DB -c "SELECT count(*) FROM email_outbox WHERE kind='payment_verified' AND dedupe_key='$REG_FILA';"; }

checar "a inscricao do check comeca sem pagamento conferido, e sem aviso na fila" "f|0" \
  "$(pv_coluna)|$(pv_fila)"

# As duas recusas. A coluna DEPOIS de cada tentativa e a metade que carrega
# peso: o `[]` sozinho tambem sairia de um id inexistente.
checar "o anon nao marca pagamento, e nao mexe na coluna" "[]|f|0" \
  "$(pv_patch "$ANONK")|$(pv_coluna)|$(pv_fila)"
checar "o authenticated NAO-ADMIN tambem nao, e tambem nao mexe" "[]|f|0" \
  "$(pv_patch "$NAOADMIN_TOKEN")|$(pv_coluna)|$(pv_fila)"

echo "== o admin marca, e o gatilho enfileira UMA linha =="
pv_patch "$ADMIN_TOKEN" > /dev/null
checar "o admin marcou o pagamento pelo caminho de verdade" "t" "$(pv_coluna)"
checar "e nasceu UMA linha payment_verified na fila" "1" "$(pv_fila)"
checar "com o payload apontando para a inscricao" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox
              WHERE kind='payment_verified' AND dedupe_key='$REG_FILA'
                AND payload->>'registration_id' = '$REG_FILA';")"
# A fila da inscricao passa a ter tres linhas: as duas do INSERT mais esta.
checar "as tres linhas da inscricao sao as esperadas" \
  "organizer_new_registration|payment_verified|registration_committed" \
  "$($DB -c "SELECT string_agg(kind, '|' ORDER BY kind) FROM email_outbox WHERE dedupe_key='$REG_FILA';")"

echo "== a prova do WHEN, por CONTAGEM DE EXECUCAO da funcao =="
# ── LEIA ESTA SECAO ANTES DE MEXER NO GATILHO ───────────────────────────────
#
# A assertiva OBVIA do `WHEN` -- marcar duas vezes e contar linhas -- PASSA SEM
# O `WHEN`. Ela esta logo abaixo, com o rotulo dizendo isso, porque apagar um
# teste cego nao ensina ninguem: sem o `WHEN` a funcao EXECUTA na segunda vez, e
# o `ON CONFLICT (kind, dedupe_key) DO NOTHING` engole o INSERT. Contagem
# identica, defeito no lugar.
pv_patch "$ADMIN_TOKEN" > /dev/null
checar "marcar de novo nao duplica (ATENCAO: fica verde SEM o WHEN tambem)" "1" "$(pv_fila)"

# ── A ASSERTIVA QUE DISCRIMINA ──
#
# Tirando a linha da fila, o `ON CONFLICT` deixa de ter o que engolir. Ai a
# contagem da fila VIRA a contagem de execucoes da funcao:
#
#   0 linha  = a funcao nao rodou nenhuma vez  (com o WHEN)
#   1 linha  = a funcao rodou uma vez          (sem o WHEN)
#
# A situacao nao e hipotetica: e exatamente o que acontece depois de o dreno
# mandar o e-mail e alguem limpar a fila. Sem o `WHEN`, um UPDATE que nao muda
# nada reenfileira, e a pessoa recebe o aviso outra vez.
$DB -c "DELETE FROM email_outbox WHERE kind='payment_verified' AND dedupe_key='$REG_FILA';" > /dev/null
checar "a linha do aviso saiu da fila" "0" "$(pv_fila)"
$DB -c "UPDATE championship_registrations SET payment_verified = true WHERE id='$REG_FILA';" > /dev/null
checar "com o WHEN, reescrever o MESMO valor executa a funcao ZERO vez" "0" "$(pv_fila)"

# ── O CONTROLE, e sem ele o zero de cima nao vale nada ──
#
# Um gatilho DERRUBADO tambem produz zero ali. O que separa "o WHEN barrou" de
# "nao ha gatilho" e provar que a funcao AINDA EXECUTA quando a transicao de
# verdade acontece. Com a linha ainda fora da fila, false -> true tem de
# recoloca-la.
$DB -c "UPDATE championship_registrations SET payment_verified = false WHERE id='$REG_FILA';" > /dev/null
$DB -c "UPDATE championship_registrations SET payment_verified = true  WHERE id='$REG_FILA';" > /dev/null
checar "e na transicao de verdade a funcao executa UMA vez (a linha voltou)" "1" "$(pv_fila)"

echo "== desmarcar e marcar de novo QUEIMA o aviso, e nao manda outro =="
# A consequencia que quem opera precisa saber, e que a tela avisa antes do
# clique (PAYMENT_CHECK_CONFIRM, em features/registration/payment-check.ts).
# Aqui a funcao EXECUTA -- a transicao acontece de verdade --, e quem segura o
# segundo e-mail e o `ON CONFLICT`, porque a `dedupe_key` e a mesma inscricao.
# O id da linha ANTES do ciclo. E ele que separa "a linha sobreviveu" de "a
# linha foi trocada por outra igual" -- uma contagem de 1 nao distingue as duas,
# e so a primeira significa que o aviso nao vai sair de novo.
pv_id_antes=$($DB -c "SELECT id FROM email_outbox WHERE kind='payment_verified' AND dedupe_key='$REG_FILA';")
$DB -c "UPDATE championship_registrations SET payment_verified = false WHERE id='$REG_FILA';" > /dev/null
$DB -c "UPDATE championship_registrations SET payment_verified = true  WHERE id='$REG_FILA';" > /dev/null
checar "o ciclo desmarcar/marcar nao acrescenta uma segunda linha" "1" "$(pv_fila)"
checar "e a linha da fila e a MESMA de antes, nao uma nova" "$pv_id_antes" \
  "$($DB -c "SELECT id FROM email_outbox WHERE kind='payment_verified' AND dedupe_key='$REG_FILA';")"

# ── Quem pode executar a funcao do gatilho ──
#
# Defesa em profundidade, e NAO a trava que faz o gatilho funcionar -- a
# distincao foi medida: com o EXECUTE revogado de `authenticated`, o UPDATE
# daquela sessao ainda dispara o gatilho. O PostgreSQL cobra EXECUTE de quem
# CRIA o gatilho, e nao de quem o faz disparar. As duas metades da assertiva
# importam: so "o service_role consegue" passaria identico com a funcao aberta.
checar "o gatilho do pagamento nao e executavel por anon nem authenticated" "true|false|false" \
  "$($DB -c "SELECT has_function_privilege('service_role','public.enqueue_payment_verified_email()','EXECUTE')::text
             || '|' || has_function_privilege('anon','public.enqueue_payment_verified_email()','EXECUTE')::text
             || '|' || has_function_privilege('authenticated','public.enqueue_payment_verified_email()','EXECUTE')::text;")"
checar "e ele e SECURITY DEFINER, que e o que faz o UPDATE do admin salvar" "true" \
  "$($DB -c "SELECT prosecdef::text FROM pg_proc WHERE proname='enqueue_payment_verified_email';")"

echo "== a limpeza devolve a tabela ao estado de antes =="
limpar
checar "as linhas de teste sumiram" "0" \
  "$($DB -c "SELECT count(*) FROM email_outbox
              WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L', '$KIND_N', '$KIND_S', '$KIND_C');")"
# Assertiva propria para as linhas do gatilho porque elas tem kind DE VERDADE:
# a de cima nao as ve, e a de baixo so acusaria um total diferente, sem dizer
# quem sobrou. Estas sao as unicas linhas desta suite que, esquecidas, ficariam
# numa fila de e-mail real esperando um dreno.
checar "e as linhas do gatilho tambem" "0" \
  "$($DB -c "SELECT count(*) FROM email_outbox
              WHERE dedupe_key IN ('$REG_FILA', '$REG_ROLL', '$reg_rpc');")"
checar "as fixturas do gatilho sairam junto" "0|0" \
  "$($DB -c "SELECT (SELECT count(*) FROM championship_registrations WHERE championship_id='$CHAMP_T') || '|' ||
                    (SELECT count(*) FROM championships WHERE id='$CHAMP_T');")"
checar "a tabela voltou ao tamanho de antes" "$linhas_antes" \
  "$($DB -c "SELECT count(*) FROM email_outbox;")"

if [ "$falhou" -eq 0 ]; then
  echo ""
  echo "TODOS OS CENARIOS PASSARAM"
else
  echo ""
  echo "HOUVE FALHAS"
  exit 1
fi
