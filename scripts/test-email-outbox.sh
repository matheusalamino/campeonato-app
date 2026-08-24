#!/bin/sh
# Testa a tabela email_outbox contra o Postgres local.
# Roda com: sh scripts/test-email-outbox.sh
#
# Cria linhas descartaveis com `kind` de teste, exercita os cenarios e apaga
# tudo no fim.
#
# O QUE ESTE ARQUIVO COBRE, e por que ele existe em sh e nao em vitest: o
# vitest deste repo nao abre conexao com o banco, entao nem o indice UNIQUE nem
# o `FOR UPDATE SKIP LOCKED` tem onde ser provados la. Os dois so aparecem com
# um servidor de verdade -- e o segundo so aparece com DUAS conexoes ao mesmo
# tempo.
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

# Tres `kind` distintos, todos com o mesmo prefixo. Sao listados NOMINALMENTE no
# limpar() em vez de varridos com LIKE de proposito: em LIKE o `_` e coringa,
# entao 'test_outbox%' tambem casaria com um `kind` de verdade escrito
# 'testeoutbox...'. Apagar linha real de fila de e-mail e dano silencioso.
KIND_A="test_outbox_alpha"
KIND_B="test_outbox_beta"
KIND_L="test_outbox_lock"

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
# e passariam identico com o indice unico ausente. O que prende o cenario e o
# NOME da restricao.
erro_estado() {
  case "$1" in
    *email_outbox_kind_dedupe*) echo "unicidade" ;;
    *ERROR*)                    echo "outro_erro" ;;
    *)                          echo "sem_erro" ;;
  esac
}

limpar() {
  $DB -c "
    DELETE FROM email_outbox WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L');
  " > /dev/null
}

# Fotografia do tamanho da tabela ANTES de qualquer cenario, com limpar() antes
# dela de proposito: lixo de uma execucao abortada sumiria no MEIO da suite e a
# guarda do fim leria isso como "a suite apagou uma linha de verdade".
limpar
linhas_antes=$($DB -c "SELECT count(*) FROM email_outbox;")

echo "== unicidade: o mesmo acontecimento nao entra duas vezes =="
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, payload)
  VALUES ('$KIND_A', 'inscricao-1', '{\"registration_id\":\"r1\"}'::jsonb);
" > /dev/null
checar "a primeira insercao cria a linha" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_A';")"

# Repetir o par SEM rede tem de ser RECUSADO, e recusado pelo NOME da
# restricao. O `|| true` aqui nao afrouxa nada -- o erro nao esta sendo
# ignorado, esta sendo medido na linha seguinte. O que ele evita e o `set -e`
# matar o script no meio e levar junto as assertivas que ainda tem o que dizer:
# num banco sem o indice unico, e justamente aqui que ele morreria.
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
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key)
  VALUES ('$KIND_B', 'inscricao-1');
" > /dev/null
checar "a mesma dedupe_key sob outro kind entra" "1" \
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind='$KIND_B' AND dedupe_key='inscricao-1';")"

echo "== concorrencia: dois drenos nao pegam a mesma linha =="
limpar
$DB -c "
  INSERT INTO email_outbox (kind, dedupe_key, next_attempt_at) VALUES
    ('$KIND_L', 'lock-1', now() - interval '1 minute'),
    ('$KIND_L', 'lock-2', now() - interval '1 minute');
" > /dev/null

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
  "$($DB -c "SELECT count(*) FROM email_outbox WHERE kind IN ('$KIND_A', '$KIND_B', '$KIND_L');")"
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
