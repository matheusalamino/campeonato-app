#!/bin/sh
# Testa a tabela email_outbox contra o Postgres local.
# Roda com: sh scripts/test-email-outbox.sh
#
# Cria linhas descartaveis com `kind` de teste, exercita os cenarios e apaga
# tudo no fim.
#
# O QUE ESTE ARQUIVO COBRE, e por que ele existe em sh e nao em vitest: o
# vitest deste repo nao abre conexao com o banco, entao nada do que a TABELA
# promete tem onde ser provado la. Sao tres familias:
#
#   1. unicidade por acontecimento -- o indice UNIQUE (kind, dedupe_key);
#   2. o formato da linha -- `dedupe_key` NOT NULL, o CHECK de `status` e o
#      indice parcial do dreno;
#   3. concorrencia -- `FOR UPDATE SKIP LOCKED`, que so aparece com DUAS
#      conexoes ao mesmo tempo.
#
# A familia 2 nao aparece em nenhum cenario das outras duas, e essa e a razao de
# ela existir separada: os cenarios das outras escrevem linhas bem formadas, e
# um defeito que afrouxasse o formato passaria por todos eles calado.
#
# O QUE ELE NAO COBRE: nao ha gatilho nem dreno ainda. Este script prova o
# comportamento da TABELA, nao o de quem escreve nela nem o de quem a esvazia.
# Verde aqui nao quer dizer que algum e-mail saiu.
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

limpar() {
  $DB -c "
    DELETE FROM email_outbox
     WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L', '$KIND_N', '$KIND_S');
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
docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA \
  > "$oficina/conn1.txt" 2>&1 <<SQL &
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
conn2=$(docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA -c "
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

echo "== a limpeza devolve a tabela ao estado de antes =="
limpar
checar "as linhas de teste sumiram" "0" \
  "$($DB -c "SELECT count(*) FROM email_outbox
              WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L', '$KIND_N', '$KIND_S');")"
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
