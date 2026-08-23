#!/bin/sh
# Testa reserve_registration_slot e commit_registration contra o Postgres local.
# Roda com: sh scripts/test-registration-slots.sh
#
# Cria um campeonato descartavel, exercita os cenarios e apaga tudo no fim.
#
# NAO RODE ISTO DURANTE UM SABADO DE VERDADE — do por do sol de sexta ao de
# sabado a suite falha inteira, e nao por regressao: reserve_registration_slot e
# commit_registration chamam is_sabbath(now()), sem relogio injetavel, entao
# TODA reserva e TODO commit devolvem `sabbath`. Medido com uma janela cobrindo
# now(), quando a suite tinha 33 assertivas: 18 falhavam. Nao releia esse 18
# como fracao de hoje -- a suite passou de 33 para 59, e as 20 assertivas da
# cota de goleiro leem o relogio de fora, entao numa sexta a noite a proporcao
# de falhas e MAIOR que aquela, e nao menor. Passam os cenarios que montam a janela
# DENTRO de uma transacao; falham os QUATRO controles que dependem do relogio de
# fora ("fora do sabado a reserva segue normal", "fora do sabado o ja inscrito
# ouve already_registered", "sem sabado, a mesma reserva grava" e "fora do
# sabado, o prazo vencido responde not_open") -- ou seja, ha cenarios quebrados
# dentro das proprias secoes de sabado, e isso e esperado. Se quebrar
# tudo de uma vez numa sexta a noite, olhe o relogio antes de olhar o codigo --
# o script avisa em tempo de execucao quando esse for o caso.
set -e

DB="docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA"
CHAMP="aaaaaaaa-0000-4000-8000-00000000a4a4"

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

# `retry_at` tem TRES estados, e a distancia entre dois deles e a diferenca
# entre "vale voltar" e "nao adianta". Medir a presenca da CHAVE nao distingue
# nenhum: `json_build_object` emite `"retry_at" : null` quando o valor e nulo,
# entao um `grep retry_at` passa identico com o campo sempre vazio -- foi
# exatamente assim que a primeira versao desta suite deixou passar uma mutacao
# que apagava o valor.
retry_estado() {
  case "$1" in
    *'"retry_at" : "'*)    echo "preenchido" ;;
    *'"retry_at" : null'*) echo "nulo" ;;
    *)                     echo "ausente" ;;
  esac
}

limpar() {
  $DB -c "
    DELETE FROM self_evaluations WHERE registration_id IN
      (SELECT id FROM championship_registrations WHERE championship_id = '$CHAMP');
    DELETE FROM championship_registrations WHERE championship_id = '$CHAMP';
    DELETE FROM registration_slot_reservations WHERE championship_id = '$CHAMP';
    DELETE FROM players WHERE cpf LIKE '999%';
    DELETE FROM championships WHERE id = '$CHAMP';
    DELETE FROM sabbath_windows WHERE starts_at >= '2098-01-01';
  " > /dev/null
}

# Campeonato com 2 vagas principais e 1 de espera — numeros pequenos para os
# limites aparecerem rapido.
#
# As cinco colunas do formato entram aqui com o formato de 2026 (8 x 10, 1 goleiro
# por time, espera de 1 + 4) para a assertiva do fim do arquivo nao depender do
# SEED. Nao interferem em nenhum cenario acima: as duas RPCs leem `max_players` e
# `max_waitlist_players`, e nada mais -- quem as ligar ao codigo e a T3.
#
# Antes elas ficavam so no seed, e aquela era a UNICA assertiva do script que
# dependia dele. Num banco vindo de `scripts/restore-local-from-dump.sh` o SELECT
# voltava vazio e o script quebrava comparando "" com "80|8|72|5" -- falha com
# zero relacao com as RPCs, no arquivo cujo assunto sao as RPCs. Medido: exit 1,
# 39 assertivas, 1 FALHOU.
preparar() {
  limpar
  $DB -c "
    INSERT INTO championships (
      id, name, slug, status, max_players, max_waitlist_players,
      teams_count, players_per_team, goalkeepers_per_team,
      waitlist_goalkeepers, waitlist_outfield
    )
    VALUES (
      '$CHAMP', 'Teste A4', 'teste-a4', 'subscribing', 2, 1,
      8, 10, 1, 1, 4
    );
  " > /dev/null
}

# Fotografia da tabela global ANTES de qualquer cenario. A assercao que fecha o
# ciclo esta no fim do arquivo -- leia o porque la antes de mexer aqui.
# limpar() ANTES da fotografia, de proposito: ele apaga starts_at >= '2098-01-01',
# e uma linha de 2098 sobrando de uma execucao abortada sumiria no MEIO da suite.
# A guarda leria isso como "a suite apagou uma janela" e mandaria o leitor
# procurar o dano oposto ao que houve. Limpar antes torna a fotografia estavel.
limpar
sabbath_linhas_antes=$($DB -c "SELECT count(*) FROM sabbath_windows;")
sabbath_cobrindo_antes=$($DB -c "SELECT count(*) FROM sabbath_windows WHERE now() BETWEEN starts_at AND ends_at;")

# O cabecalho acima serve a quem LE o arquivo; este bloco serve a quem le a
# SAIDA, que e onde a pessoa esta olhando quando a suite quebra. Sem bypass de
# proposito: o aviso explica, nao perdoa -- os cenarios rodam todos e o script
# continua saindo com 1 se falhar.
if [ "$($DB -c "SELECT is_sabbath(now());" | tr -d ' ')" = "t" ]; then
  # is_sabbath(now()) fica verdadeiro por DOIS motivos: uma linha de
  # sabbath_windows cobrindo agora, ou a regra conservadora quando a tabela nao
  # alcanca. E a linha pode ser LIXO DE TESTE -- ja aconteceu, numa quinta-feira,
  # com uma janela de 09:00 as 10:11 inserida para conferir a tela no navegador.
  # Nesse estado "rode depois do por do sol" manda o dev esperar um por do sol
  # que nao limpa nada. Por isso o banner IMPRIME a janela: quem le decide se
  # aquilo e um sabado ou sujeira. A guarda do fim do arquivo nao cobre este
  # caso -- ela compara antes/depois, e linha ja presente na largada passa muda.
  janela=$($DB -c "SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'Dy DD/MM HH24:MI') || '  ->  ' || to_char(ends_at AT TIME ZONE 'America/Sao_Paulo', 'Dy DD/MM HH24:MI') || '   (' || round(extract(epoch FROM (ends_at - starts_at)) / 3600)::text || 'h)' FROM sabbath_windows WHERE now() BETWEEN starts_at AND ends_at ORDER BY starts_at LIMIT 1;")
  echo "==============================================================="
  echo "  ATENCAO: is_sabbath(now()) ESTA VERDADEIRO AGORA."
  echo ""
  echo "  reserve_registration_slot e commit_registration chamam"
  echo "  is_sabbath(now()) e nao tem relogio injetavel, entao TODA"
  echo "  reserva e TODO commit devolvem 'sabbath'. As falhas em"
  echo "  cenarios sem relacao com a pausa sao ESPERADAS -- nao sao"
  echo "  regressao, e nao ha o que consertar no codigo."
  echo ""
  if [ -n "$janela" ]; then
    echo "  Quem esta pausando (horario de Brasilia):"
    echo "    $janela"
    echo ""
    echo "  >>> CONFIRA ESSA JANELA ANTES DE IR EMBORA. Sabado de"
    echo "  verdade dura ~24h e TERMINA NUM SABADO. Se o que voce leu"
    echo "  acima for curto, ou terminar noutro dia da semana, e linha"
    echo "  de TESTE esquecida na tabela -- e ai esperar o por do sol"
    echo "  nao resolve nada. Remova por valor exato de starts_at:"
    echo "    DELETE FROM sabbath_windows WHERE starts_at = '<acima>';"
  else
    echo "  Nenhuma linha de sabbath_windows alcanca agora: quem pausa"
    echo "  e a REGRA CONSERVADORA (sexta 17h a sabado 20h30), que so"
    echo "  vale depois que a tabela acaba, em 2029. Se ainda nao e"
    echo "  2030, isso e sinal de tabela vazia ou nao aplicada."
  fi
  echo ""
  # NUNCA comece uma linha deste banner com a palavra de falha: quem mede a
  # suite com `grep -c "^  FALHOU "` passa a contar o TEXTO DO AVISO como se
  # fosse um cenario quebrado. Ja aconteceu -- inflou a contagem em exatamente
  # 1 e mandou procurar uma regressao que nao existia.
  echo "  Seguem validos os cenarios que montam a janela DENTRO de"
  echo "  uma transacao. Os QUATRO controles que leem o relogio de"
  echo "  fora NAO: eles esperam a resposta de um dia comum e agora"
  echo "  recebem 'sabbath', entao ha linhas de falha dentro das"
  echo "  proprias secoes de sabado -- e ali tambem e esperado."
  echo "  (Sao os cenarios 'fora do sabado ...' e 'sem sabado ...'.)"
  echo ""
  echo "  Se a janela acima for mesmo um sabado, rode de novo depois"
  echo "  do por do sol. Nao existe flag para desligar a trava, e isso"
  echo "  e deliberado: porta dos fundos em trava de observancia fica"
  echo "  ligada por engano, e o custo de nao ter e exatamente este"
  echo "  aviso."
  echo "==============================================================="
  echo ""
fi

echo "== classificacao =="
preparar
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000001')::text;")
checar "primeira vaga vai para a principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000002')::text;")
checar "segunda vaga ainda e principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000003')::text;")
checar "terceira cai na espera" "true" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000004')::text;")
checar "quarta e recusada por reserva" "all_reserved" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"
echo "$r" | grep -q 'retry_at' && echo "  ok   a recusa traz retry_at" || { echo "  FALHOU sem retry_at"; falhou=1; }

echo "== renovacao nao duplica =="
antes=$($DB -c "SELECT count(*) FROM registration_slot_reservations WHERE championship_id='$CHAMP';")
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000001');" > /dev/null
depois=$($DB -c "SELECT count(*) FROM registration_slot_reservations WHERE championship_id='$CHAMP';")
checar "reservar de novo com o mesmo CPF nao cria linha" "$antes" "$depois"

echo "== poda de vencidas =="
$DB -c "UPDATE registration_slot_reservations SET expires_at = now() - interval '1 minute' WHERE cpf='99900000003';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000005')::text;")
checar "vaga vencida volta para o bolo" "true" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

echo "== sem teto nunca lota =="
preparar
$DB -c "UPDATE championships SET max_players = NULL WHERE id='$CHAMP';" > /dev/null
i=1
while [ $i -le 5 ]; do
  $DB -c "SELECT reserve_registration_slot('$CHAMP', '9990000010$i');" > /dev/null
  i=$((i+1))
done
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000199')::text;")
checar "max_players nulo sempre da principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

echo "== janela de inscricao =="
preparar
$DB -c "UPDATE championships SET registration_start_date = now() + interval '1 day' WHERE id='$CHAMP';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000401')::text;")
checar "antes da abertura recusa" "not_open" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

$DB -c "UPDATE championships SET registration_start_date = now() - interval '1 day',
                                 registration_end_date = now() + interval '1 day' WHERE id='$CHAMP';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000402')::text;")
checar "dentro da janela reserva normalmente" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

$DB -c "UPDATE championships SET registration_end_date = now() - interval '1 minute' WHERE id='$CHAMP';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000403')::text;")
checar "depois do prazo recusa" "not_open" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# Campeonato sem data configurada tem que se comportar como antes do A5: nulo
# nao e prazo vencido, e trancaria todo mundo do lado de fora.
$DB -c "UPDATE championships SET registration_start_date = NULL,
                                 registration_end_date = NULL WHERE id='$CHAMP';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000404')::text;")
checar "data nula nao fecha nada" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

# As bordas sao inclusivas: o admin que escolhe 23:59 espera aquele minuto
# inteiro. UPDATE e chamada precisam ficar na MESMA transacao — now() e o
# instante do BEGIN, entao os dois lados enxergam o mesmo relogio e a igualdade
# e exata. Em transacoes separadas o tempo anda no meio e o teste vira ">= -1ms",
# que nao distingue < de <=.
preparar
r=$($DB -c "
  BEGIN;
  UPDATE championships SET registration_start_date = now(),
                           registration_end_date = NULL WHERE id='$CHAMP';
  SELECT reserve_registration_slot('$CHAMP', '99900000405')::text;
  COMMIT;" | grep '"success"')
checar "no instante da abertura ja reserva" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "
  BEGIN;
  UPDATE championships SET registration_start_date = NULL,
                           registration_end_date = now() WHERE id='$CHAMP';
  SELECT reserve_registration_slot('$CHAMP', '99900000406')::text;
  COMMIT;" | grep '"success"')
checar "no instante do encerramento ainda reserva" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

echo "== pausa de sabado =="
preparar
# A janela temporaria entra e sai na MESMA transacao: sabbath_windows e global,
# sem vinculo com campeonato, entao uma linha esquecida aqui pausaria o site de
# verdade. O ROLLBACK e a limpeza.
saida=$($DB <<SQL
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at)
VALUES (now() - interval '1 hour', now() + interval '1 hour');
SELECT reserve_registration_slot('$CHAMP', '99900000601')::text;
ROLLBACK;
SQL
)
# BEGIN, INSERT e ROLLBACK tambem saem no stdout; so a linha do resultado tem o JSON.
r=$(echo "$saida" | grep '"success"')
checar "durante o sabado a reserva e recusada" "sabbath" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# Fora da janela, com a tabela funcionando, nada muda.
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000602')::text;")
checar "fora do sabado a reserva segue normal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

# A ORDEM das checagens, e nao so a recusa. Um cenario que so verifica "recusou"
# nao distingue a pausa estar antes ou depois de already_registered — o mesmo CPF
# nos dois lados, mudando so a janela, e o que fixa isso.
# A OUTRA metade da ordem, e ela nao tinha assertiva nenhuma: a migration gasta
# paragrafos explicando por que not_open ganha de sabbath, e nada prendia isso.
# Mover a checagem de sabado para ANTES da janela passava a suite inteira verde,
# e um campeonato ENCERRADO passaria a responder "volte apos o por do sol" -- uma
# promessa falsa, porque voltar no domingo nao abre porta nenhuma.
#
# As duas secoes de sabado usam preparar(), que cria o campeonato com datas
# NULAS; sem mexer na data aqui, "fora da janela" e "e sabado" nunca coincidem e
# a aresta fica sem cobertura.
echo "== ordem: not_open ganha de sabbath =="
preparar
$DB -c "UPDATE championships SET registration_end_date = now() - interval '1 day' WHERE id='$CHAMP';" > /dev/null
saida=$($DB <<SQL
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at)
VALUES (now() - interval '1 hour', now() + interval '1 hour');
SELECT reserve_registration_slot('$CHAMP', '99900000604')::text;
ROLLBACK;
SQL
)
r=$(echo "$saida" | grep '"success"')
checar "encerrado E no sabado, not_open ganha" "not_open" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

echo "== a pausa fala antes de already_registered =="
preparar
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000603', 'Ja inscrito A7');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000603';")
$DB -c "INSERT INTO championship_registrations (championship_id, player_id) VALUES ('$CHAMP', '$pid');" > /dev/null
# Controle: fora do sabado este CPF realmente cai no already_registered. Sem ele,
# o caso seguinte passaria mesmo com o CPF nao inscrito, e nao provaria ordem.
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000603')::text;")
checar "fora do sabado o ja inscrito ouve already_registered" "already_registered" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

saida=$($DB <<SQL
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at)
VALUES (now() - interval '1 hour', now() + interval '1 hour');
SELECT reserve_registration_slot('$CHAMP', '99900000603')::text;
ROLLBACK;
SQL
)
r=$(echo "$saida" | grep '"success"')
checar "no sabado a pausa ganha do ja inscrito" "sabbath" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

echo "== is_sabbath: bordas exatas =="
# As DUAS linhas temporarias importam. A de dezembro/2098 nao e enfeite: sem ela,
# o teste de "um segundo depois do fim" nao teria linha alcancando aquele
# instante, cairia na regra conservadora, e uma borda quebrada continuaria
# devolvendo `true` pelo motivo errado.
saida=$($DB <<'SQL'
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at) VALUES
  ('2098-06-05 17:40:00-03', '2098-06-06 17:40:00-03'),
  ('2098-12-25 18:00:00-03', '2098-12-26 18:00:00-03');
SELECT is_sabbath('2098-06-05 17:39:59-03')::text || '|' ||
       is_sabbath('2098-06-05 17:40:00-03')::text || '|' ||
       is_sabbath('2098-06-06 17:40:00-03')::text || '|' ||
       is_sabbath('2098-06-06 17:40:01-03')::text;
ROLLBACK;
SQL
)
# Nem BEGIN, nem "INSERT 0 2", nem ROLLBACK tem barra vertical.
r=$(echo "$saida" | grep '|' | tr -d ' ')
# 05/06/2098 e quinta e 06/06 e sexta de proposito: a linha manda, o dia da
# semana nao. Se a janela deixasse de mandar, a regra conservadora chamaria a
# sexta 17:40 de sabado e o terceiro campo continuaria `true` por engano.
checar "a janela manda, com as bordas inclusivas" "false|true|true|false" "$r"

echo "== is_sabbath: a regra conservadora =="
# 2099 fica alem da ultima linha da tabela — e la que a regra conservadora vive.
# 02/01/2099 e uma sexta; 03/01 um sabado; 30/12/2098 uma terca.
r=$($DB -c "
  SELECT is_sabbath('2099-01-02 16:59:00-03')::text || '|' ||
         is_sabbath('2099-01-02 17:00:00-03')::text || '|' ||
         is_sabbath('2099-01-03 20:30:00-03')::text || '|' ||
         is_sabbath('2099-01-03 20:31:00-03')::text || '|' ||
         is_sabbath('2098-12-30 18:00:00-03')::text;
")
checar "sexta 17h a sabado 20h30 quando a tabela acaba" "false|true|true|false|false" "$(echo "$r" | tr -d ' ')"

echo "== concorrencia: duas transacoes disputando a ultima vaga =="
preparar
$DB -c "UPDATE championships SET max_players = 1, max_waitlist_players = 0 WHERE id='$CHAMP';" > /dev/null

# A abre transacao, reserva e SEGURA o lock sem commitar.
docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA > /tmp/a4_sessao_a.txt 2>&1 <<'SQL' &
BEGIN;
SELECT reserve_registration_slot('aaaaaaaa-0000-4000-8000-00000000a4a4', '99900000201')::text;
SELECT pg_sleep(3);
COMMIT;
SQL
sleep 1

# B tenta a mesma ultima vaga enquanto A segura o lock. Deve BLOQUEAR ate A
# commitar, e so entao descobrir que a vaga ja foi.
inicio=$(date +%s)
b=$(docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA -c \
  "SELECT reserve_registration_slot('$CHAMP', '99900000202')::text;")
fim=$(date +%s)
wait

espera=$((fim - inicio))
if [ "$espera" -ge 2 ]; then
  echo "  ok   a segunda transacao esperou o lock (${espera}s)"
else
  echo "  FALHOU a segunda nao esperou (${espera}s) — o lock nao esta segurando"
  falhou=1
fi
# all_reserved, e nao full: a vaga esta segurada por uma RESERVA, nao por
# inscricao confirmada. Se a sessao A abandonar, ela volta pro bolo.
checar "so uma leva a ultima vaga" "all_reserved" "$(echo "$b" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

echo "== autoavaliacao invalida desfaz a inscricao =="
preparar
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000301', 'Teste A4');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000301';")
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000301');" > /dev/null
# rating 9 viola self_evaluations_rating_check (1..5)
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid', '99900000301',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":9}'::jsonb)::text;" 2>&1 || true)
restou=$($DB -c "SELECT count(*) FROM championship_registrations WHERE championship_id='$CHAMP';")
checar "inscricao desfeita quando a habilidade e invalida" "0" "$restou"

# A excecao deliberada do A5: reservou as 23h58, o prazo fechou as 23:59:59, e
# ele envia as 00h03. E aceito. A reserva e a autorizacao, e recusa-lo aqui
# recriaria o "pagou e foi recusado" justo na correria de ultima hora.
echo "== tolerancia: reservou antes do prazo, enviou depois =="
preparar
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000501', 'Tolerancia A5');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000501';")
$DB -c "UPDATE championships SET registration_start_date = now() - interval '1 day',
                                 registration_end_date = now() + interval '1 minute' WHERE id='$CHAMP';" > /dev/null
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000501');" > /dev/null
# O prazo vira enquanto ele preenche.
$DB -c "UPDATE championships SET registration_end_date = now() - interval '1 second' WHERE id='$CHAMP';" > /dev/null
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid', '99900000501',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb)::text;")
checar "reserva viva atravessa o prazo" "true" "$(echo "$r" | sed 's/.*\"success\" : \([a-z]*\).*/\1/')"

# O outro lado da mesma moeda: sem reserva viva nao ha promessa a honrar, entao
# o prazo vale. Mesmo campeonato, mesmo instante — so muda a reserva.
echo "== sem reserva viva, o prazo vale =="
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000502', 'Sem reserva A5');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000502';")
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid', '99900000502',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb)::text;")
checar "sem reserva, fora do prazo recusa" "not_open" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# A INVERSAO. O cenario "reserva viva atravessa o prazo", duas secoes acima,
# provou que reserva viva passa pelo PRAZO. Este prova que ela NAO passa pelo
# SABADO — sao duas checagens vizinhas na mesma funcao, com regras opostas, e
# este par e a unica coisa que mantem a diferenca viva. Mover a checagem de
# sabado para dentro do IF NOT v_had_reservation "por consistencia" mata ESTE
# cenario e deixa aquele passando; se os dois morrerem, ou nenhum, o par nao
# esta medindo o que promete.
#
# A janela temporaria entra e sai na MESMA transacao: sabbath_windows e global,
# sem vinculo com campeonato, entao uma linha esquecida aqui pausaria o site de
# verdade. O ROLLBACK e a limpeza.
echo "== reserva viva NAO atravessa o sabado =="
preparar
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000701', 'Sabado A6');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000701';")
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000701');" > /dev/null
saida=$($DB <<SQL
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at)
VALUES (now() - interval '1 hour', now() + interval '1 hour');
SELECT 'ANTES=' || count(*) FROM championship_registrations WHERE championship_id = '$CHAMP';
SELECT commit_registration('$CHAMP', '$pid', '99900000701',
  '{"group_affiliation":"G","shirt_size":"M","profile_photo_link":"http://x/y.jpg","tickets_total":0}'::jsonb,
  '{"visao":4}'::jsonb)::text;
SELECT 'DEPOIS=' || count(*) FROM championship_registrations WHERE championship_id = '$CHAMP';
ROLLBACK;
SQL
)
r=$(echo "$saida" | grep '"success"')
checar "o sabado recusa mesmo com reserva viva" "sabbath" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# A ESCRITA, e nao a string. A assertiva acima le a `reason` que voltou: ela
# prova que a funcao DISSE nao. Esta prova que ela NAO ESCREVEU, e e a segunda
# que a observancia exige -- com a checagem de sabado movida para o FIM da
# funcao, a de cima passa verde enquanto a inscricao E GRAVADA durante o sabado,
# e o ROLLBACK apaga o rastro antes que alguem veja.
#
# Por isso as contagens sao lidas DENTRO da transacao, entre a chamada e o
# ROLLBACK. E a unica leitura que morde: de fora, depois do ROLLBACK, ela da 0
# mesmo quando a funcao gravou. Isso nao e teoria -- foi tentado assim, passou
# verde sob um mutante que gravava, e a assertiva foi removida por nao morder.
#
# Delta, e nao absoluto: preparar() pode deixar linha por outro motivo, e um
# numero absoluto quebraria por algo alheio a esta regra.
antes=$(echo "$saida" | sed -n 's/^ANTES=//p')
depois=$(echo "$saida" | sed -n 's/^DEPOIS=//p')
if [ -z "$antes" ] || [ -z "$depois" ]; then
  # Sem ON_ERROR_STOP o psql sai 0 mesmo com erro de SQL, entao contagem vazia
  # chegaria aqui como delta 0 e a assertiva passaria a nao medir nada.
  echo "  FALHOU as contagens dentro da transacao nao voltaram (ANTES=[$antes] DEPOIS=[$depois])"
  falhou=1
else
  checar "o sabado nao grava nada, e nao so responde nao" "0" "$((depois - antes))"
fi

# E o controle: a mesma reserva, o mesmo instante, sem a janela. Se este falhar,
# o cenario acima esta passando por outro motivo.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid', '99900000701',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb)::text;")
checar "sem sabado, a mesma reserva grava" "true" "$(echo "$r" | sed 's/.*\"success\" : \([a-z]*\).*/\1/')"

# A OUTRA metade da precedencia, e a que mais precisa de trava: aqui `sabbath`
# ganha de `not_open`, e em reserve_registration_slot e o CONTRARIO. Ler as duas
# funcoes lado a lado parece descuido; nao e.
#
# Na reserva, not_open ganha porque "volte apos o por do sol" seria mentira num
# campeonato encerrado -- voltar no domingo nao abriria porta nenhuma. Aqui a
# checagem fica no TOPO da funcao, e nao logo antes do INSERT, porque no topo
# ela cobre TODA escrita abaixo dela -- inclusive a que alguem acrescentar no
# futuro. As duas posicoes tem modo de falha para edicao futura, mas os danos
# sao de ordens diferentes:
#
#   topo          -> pior caso: jogador com prazo vencido ouve "volte apos o
#                    por do sol". Cosmetico, e so alcancavel chamando a server
#                    action direto -- no sabado a pagina mostra a tela de
#                    repouso, e fora dele mostra o prazo encerrado.
#   antes do INSERT -> pior caso: uma escrita nova, acrescentada acima da
#                    checagem, acontece DURANTE O SABADO. O pecado capital.
#
# Falhar fechado cedo ganha, e por isso a divergencia e ESCOLHIDA. Sem este
# cenario, quem "harmonizar" as duas funcoes move a checagem para perto do
# INSERT e quebra a precedencia em silencio -- que e o dano de verdade, muito
# pior que a promessa falsa.
echo "== no commit, o sabado ganha do prazo =="
preparar
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000702', 'Prazo vencido A6');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000702';")
$DB -c "UPDATE championships SET registration_end_date = now() - interval '1 day' WHERE id='$CHAMP';" > /dev/null

# Controle PRIMEIRO, e ele nao e enfeite: `sabbath` e a PRIMEIRA checagem da
# funcao, entao o cenario de baixo responderia 'sabbath' mesmo com o prazo
# ABERTO -- e nao teria provado precedencia nenhuma. E este controle que fixa
# que o prazo esta mesmo vencido no mesmo instante. Nenhuma das duas chamadas
# grava, entao rodar as duas com o mesmo CPF e seguro.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid', '99900000702',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb)::text;")
checar "fora do sabado, o prazo vencido responde not_open" "not_open" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

saida=$($DB <<SQL
BEGIN;
INSERT INTO sabbath_windows (starts_at, ends_at)
VALUES (now() - interval '1 hour', now() + interval '1 hour');
SELECT commit_registration('$CHAMP', '$pid', '99900000702',
  '{"group_affiliation":"G","shirt_size":"M","profile_photo_link":"http://x/y.jpg","tickets_total":0}'::jsonb,
  '{"visao":4}'::jsonb)::text;
ROLLBACK;
SQL
)
r=$(echo "$saida" | grep '"success"')
checar "prazo vencido E sabado, sabbath ganha (divergencia deliberada da reserva)" "sabbath" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# =============================================================================
# Lacuna HERDADA, e nao especifica de uma task: TODOS os cenarios acima rodam
# como `postgres`, que tem EXECUTE de qualquer jeito. Se as duas linhas de
# REVOKE sumirem de uma migration, nada acima morde -- a suite passa verde com
# as RPCs abertas a anon via PostgREST.
#
# Este projeto ja teve esse incidente de verdade: reserve_registration_slot
# nasceu executavel por anon, e qualquer um esgotaria max_players/max_waitlist
# com CPFs forjados. Vale para as DUAS RPCs do fluxo publico, nao so para a
# reserva -- por isso as duas estao aqui, e nao uma so.
#
# REVOKE FROM PUBLIC sozinho nao fecha: o schema public concede EXECUTE nominal
# a anon/authenticated por default privileges no momento da criacao. Tem que
# revogar por nome, e cada migration que faz CREATE OR REPLACE repete as duas
# linhas -- CREATE OR REPLACE preserva a ACL de funcao existente, mas cria do
# zero (e aberta) numa baseline squashada.
# =============================================================================
# A POSICAO da trava, e nao so o efeito dela. O comentario da migration promete
# que a checagem no topo cobre TODA escrita abaixo -- e a mutacao que ninguem
# pegava era acrescentar escrita ACIMA dela, que roda durante o sabado com a
# suite verde. Prosa nao segura isso; esta assercao segura. Le o corpo da funcao
# no catalogo e exige que `is_sabbath` venha antes da primeira escrita.
# =============================================================================
echo "== a trava do sabado vem ANTES de qualquer escrita =="
r=$($DB -c "
  SELECT (position('is_sabbath' in prosrc) > 0
      AND position('is_sabbath' in prosrc) < position('INSERT INTO' in prosrc)
      AND position('is_sabbath' in prosrc) < position('UPDATE ' in prosrc))::text
    FROM pg_proc WHERE proname = 'commit_registration';")
checar "is_sabbath precede a primeira escrita em commit_registration" "true" "$r"

# =============================================================================
# A cota de goleiro. Sao QUATRO baldes -- goleiro/linha x principal/espera -- e
# o que estas secoes precisam provar nao e que a cota fecha (isso e facil), e
# sim que ela fecha SO O BALDE DELA. Uma cota que fechasse o campeonato inteiro
# passaria numa suite que so contasse recusas.
#
# O formato aqui e miniatura de proposito: 2 times de 2, 1 goleiro por time, e
# um de espera em cada balde. Da cota de goleiro 2, cota de linha 2, espera 1 e
# 1 -- limites que aparecem na quarta chamada em vez da octogesima.
#
# `preparar()` recria o campeonato do zero, entao as cinco colunas do formato
# voltam ao valor dele a cada cenario e nenhum destes UPDATEs vaza para o
# seguinte.
echo "== a cota de goleiro fecha sozinha =="
preparar
$DB -c "UPDATE championships SET max_players = 4, max_waitlist_players = 2,
                                 teams_count = 2, players_per_team = 2,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 1, waitlist_outfield = 1
         WHERE id='$CHAMP';" > /dev/null

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000701', true)::text;")
checar "primeiro goleiro vai para a principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000702', true)::text;")
checar "segundo goleiro fecha a cota da principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000703', true)::text;")
checar "terceiro goleiro cai na espera DE GOLEIRO" "true" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000704', true)::text;")
checar "quarto goleiro ouve goalkeepers_full" "goalkeepers_full" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"
# Aqui a cota esta segurada por RESERVAS vivas, que vencem: retry_at tem de
# trazer o instante, e nao so existir.
checar "a recusa do goleiro traz retry_at com VALOR" "preenchido" "$(retry_estado "$r")"

# O CONTROLE, e a assertiva mais importante desta secao: com a cota de goleiro
# esgotada, a vaga de LINHA continua aberta. Sem esta linha, uma cota que
# fechasse o campeonato inteiro -- o defeito oposto e igualmente silencioso --
# passaria em todas as anteriores.
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000705', false)::text;")
checar "CONTROLE: cota de goleiro cheia NAO fecha a de linha" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000706', false)::text;")
checar "segundo de linha fecha a cota de linha" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000707', false)::text;")
checar "terceiro de linha cai na espera DE LINHA" "true" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

# all_reserved, e nao goalkeepers_full: quem esgotou foi o balde de linha, e a
# razao especifica do goleiro nao pode vazar para o outro balde.
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000708', false)::text;")
checar "quarto de linha ouve all_reserved, e nao a razao do goleiro" "all_reserved" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# Os quatro baldes existem de verdade na tabela, e cada um parou no seu teto.
r=$($DB -c "
  SELECT count(*) FILTER (WHERE is_goalkeeper AND NOT is_waitlist) || '|' ||
         count(*) FILTER (WHERE is_goalkeeper AND is_waitlist) || '|' ||
         count(*) FILTER (WHERE NOT is_goalkeeper AND NOT is_waitlist) || '|' ||
         count(*) FILTER (WHERE NOT is_goalkeeper AND is_waitlist)
    FROM registration_slot_reservations WHERE championship_id = '$CHAMP';")
checar "os quatro baldes pararam em 2|1|2|1" "2|1|2|1" "$(echo "$r" | tr -d ' ')"

# =============================================================================
# A cota so morde quando o formato diz alguma coisa.
#
# Sem esta guarda a cota derivaria ZERO nos dois baldes de um campeonato cujo
# formato ninguem preencheu, e recusaria TODO MUNDO -- com `max_players` posto na
# mao e inscricao aberta. Nao e hipotese: e o estado do staging.
#
# As duas assertivas cobrem os DOIS ramos do `IF v_is_gk`. Uma so deixaria o
# outro ramo livre, e a guarda mora antes da bifurcacao, entao quem a apagasse
# quebraria os dois -- mas quem mexesse so num deles passaria com uma.
echo "== formato nao configurado nao fecha a inscricao =="
preparar
$DB -c "UPDATE championships SET max_players = 80, max_waitlist_players = 5,
                                 teams_count = NULL, players_per_team = NULL,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001101', true)::text;")
checar "formato nulo: goleiro entra na principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001102', false)::text;")
checar "formato nulo: jogador de linha entra na principal" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

# =============================================================================
# A cota de goleiro presa ao total.
#
# `goalkeepers_per_team` maior que `players_per_team` e gravavel -- o CHECK do
# formato so exige nao-negativo. Sem o `least` contra o total, a cota admitiria
# MAIS goleiros do que o campeonato inteiro tem vaga: aqui, 3 num formato de 2.
#
# `max_players` fica com folga de proposito (10 para um formato de 2). E o que
# faz a assertiva medir a COTA: com a lotacao apertada, ela barraria o terceiro
# de qualquer jeito e a mutacao passaria.
echo "== cota de goleiro maior que o time fica presa ao total =="
preparar
$DB -c "UPDATE championships SET max_players = 10, max_waitlist_players = 0,
                                 teams_count = 1, players_per_team = 2,
                                 goalkeepers_per_team = 3,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null

$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001201', true);" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001202', true)::text;")
checar "o segundo goleiro ainda entra (o total sao 2)" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001203', true)::text;")
checar "o terceiro NAO entra num formato de 2, com max_players sobrando" "goalkeepers_full" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# =============================================================================
# De onde sai o balde de uma inscricao JA CONFIRMADA.
#
# Sai de `championship_registrations.is_goalkeeper`, gravado quando a vaga foi
# concedida -- e nao de um JOIN com `players.preferred_position`. A diferenca
# nao e de estilo: por JOIN, um jogador ja inscrito que editasse a posicao no
# perfil mudaria de balde RETROATIVAMENTE, e a cota passaria a contar 9 de 8 ou
# 7 de 8 sem ninguem ter se inscrito nem desistido.
#
# O jogador abaixo nao tem posicao NENHUMA no perfil (entra so com cpf e nome,
# como todos os deste script). Se a contagem viesse do perfil, ele contaria como
# jogador de linha e a primeira assertiva veria a vaga de goleiro ABERTA.
#
# Nenhuma das duas cita grafia de posicao, e isso e deliberado: o vocabulario de
# `preferred_position` esta em transicao, e um teste que fixasse a grafia de hoje
# quebraria junto com ela -- ou pior, passaria a testar outra coisa.
echo "== o balde da inscricao vem da inscricao, e nao do perfil =="
preparar
$DB -c "UPDATE championships SET max_players = 4, max_waitlist_players = 0,
                                 teams_count = 1, players_per_team = 4,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null
$DB -c "INSERT INTO players (cpf, name) VALUES ('99900000801', 'Teste A6 balde');" > /dev/null
pid=$($DB -c "SELECT id FROM players WHERE cpf='99900000801';")
# A linha que commit_registration vai gravar na T6, escrita aqui na mao.
$DB -c "INSERT INTO championship_registrations (championship_id, player_id, is_waitlist, is_goalkeeper)
        VALUES ('$CHAMP', '$pid', false, true);" > /dev/null

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000802', true)::text;")
checar "inscricao marcada como goleiro OCUPA a cota (perfil sem posicao)" "goalkeepers_full" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# O outro estado de retry_at, e o par da assertiva da secao anterior: aqui quem
# ocupa a cota e INSCRICAO CONFIRMADA, nao ha reserva nenhuma para vencer, e
# nulo e a resposta honesta -- nao adianta voltar. As duas juntas prendem o
# valor; cada uma sozinha passaria com o campo constante.
checar "cota tomada por inscricao confirmada: retry_at NULO" "nulo" "$(retry_estado "$r")"

# O par da assertiva acima. Sem ele, "recusou" poderia significar "a cota ignora
# tudo e recusa sempre": aqui a MESMA chamada passa a ser aceita so porque a
# coluna da inscricao mudou.
$DB -c "UPDATE championship_registrations SET is_goalkeeper = false WHERE championship_id = '$CHAMP';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000802', true)::text;")
checar "e a mesma inscricao no balde de linha LIBERA a cota" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

# =============================================================================
# Trocar de balde no meio do formulario.
#
# A regra: a reserva antiga NAO e solta antes de a nova existir. Solta-la
# primeiro faria o jogador PERDER a vaga que tinha so para descobrir que o balde
# que ele queria esta cheio -- e a vaga velha ja teria ido para outro.
echo "== troca de balde: a vaga antiga so sai quando a nova existe =="
preparar
$DB -c "UPDATE championships SET max_players = 4, max_waitlist_players = 2,
                                 teams_count = 2, players_per_team = 2,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 1, waitlist_outfield = 1
         WHERE id='$CHAMP';" > /dev/null
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000901', false);" > /dev/null
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000902', true);"  > /dev/null
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000903', true);"  > /dev/null
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000904', true);"  > /dev/null

antes=$($DB -c "SELECT count(*) FROM registration_slot_reservations WHERE championship_id='$CHAMP';")
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000901', false)::text;")
checar "renovar no MESMO balde devolve a mesma classificacao" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"
depois=$($DB -c "SELECT count(*) FROM registration_slot_reservations WHERE championship_id='$CHAMP';")
checar "renovar no MESMO balde nao cria linha" "$antes" "$depois"

r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000901', true)::text;")
checar "trocar para um balde cheio e recusado" "goalkeepers_full" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

r=$($DB -c "SELECT is_goalkeeper::text || '|' || is_waitlist::text || '|' ||
                   (SELECT count(*) FROM registration_slot_reservations
                     WHERE championship_id='$CHAMP' AND cpf='99900000901')
              FROM registration_slot_reservations
             WHERE championship_id='$CHAMP' AND cpf='99900000901';")
checar "a reserva antiga SOBREVIVE a recusa, intacta" "false|false|1" "$(echo "$r" | tr -d ' ')"

# Abre uma vaga no balde de goleiro e tenta de novo: agora a troca acontece, e
# acontece MOVENDO a linha, sem deixar duas.
$DB -c "UPDATE registration_slot_reservations SET expires_at = now() - interval '1 minute'
         WHERE cpf='99900000902';" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900000901', true)::text;")
checar "com vaga no balde novo, a troca e aceita" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT is_goalkeeper::text || '|' || is_waitlist::text || '|' ||
                   (SELECT count(*) FROM registration_slot_reservations
                     WHERE championship_id='$CHAMP' AND cpf='99900000901')
              FROM registration_slot_reservations
             WHERE championship_id='$CHAMP' AND cpf='99900000901';")
checar "a reserva MUDOU de balde, e continua sendo uma so" "true|false|1" "$(echo "$r" | tr -d ' ')"

# =============================================================================
# A troca de balde com a lotacao NO LIMITE.
#
# O cenario acima tem `max_players` folgado, entao a troca la nunca encosta na
# lotacao. Aqui a vaga unica do campeonato ja e do proprio jogador: sem excluir
# a reserva dele das contagens TOTAIS, ele disputa vaga consigo mesmo e ouve
# `all_reserved` por causa da propria reserva -- com `retry_at` nulo, porque a
# unica reserva viva e a que foi excluida da busca do instante.
#
# O filtro que impede isso mora nas contagens totais, e nao so nas do balde: e
# o total que aperta primeiro quando `max_players` e 1.
echo "== trocar de balde nao e disputar vaga consigo mesmo =="
preparar
$DB -c "UPDATE championships SET max_players = 1, max_waitlist_players = 0,
                                 teams_count = 1, players_per_team = 2,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null

$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001301', false);" > /dev/null
r=$($DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001301', true)::text;")
checar "com a unica vaga sendo a SUA, a troca de balde e aceita" "false" "$(echo "$r" | sed 's/.*\"is_waitlist\" : \([a-z]*\).*/\1/')"

r=$($DB -c "SELECT is_goalkeeper::text || '|' || is_waitlist::text || '|' ||
                   (SELECT count(*) FROM registration_slot_reservations WHERE championship_id='$CHAMP')
              FROM registration_slot_reservations
             WHERE championship_id='$CHAMP' AND cpf='99900001301';")
checar "e a vaga MUDOU de balde sem virar duas" "true|false|1" "$(echo "$r" | tr -d ' ')"

# =============================================================================
# A corrida, agora pela ultima vaga DE GOLEIRO.
#
# O cenario de concorrencia la de cima disputa `max_players`, que existia antes
# desta task. Este disputa a COTA: `max_players` tem folga (4 vagas, 1 tomada) e
# quem barra a segunda transacao e o balde. Sem o `FOR UPDATE` no campeonato as
# duas leriam "zero goleiros reservados" e passariam juntas.
echo "== concorrencia: duas transacoes disputando a ultima vaga DE GOLEIRO =="
preparar
$DB -c "UPDATE championships SET max_players = 4, max_waitlist_players = 0,
                                 teams_count = 1, players_per_team = 4,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null

docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA > /tmp/a6_sessao_a.txt 2>&1 <<'SQL' &
BEGIN;
SELECT reserve_registration_slot('aaaaaaaa-0000-4000-8000-00000000a4a4', '99900001001', true)::text;
SELECT pg_sleep(3);
COMMIT;
SQL
sleep 1

inicio=$(date +%s)
b=$(docker exec -i supabase_db_campeonato-app psql -U postgres -d postgres -tA -c \
  "SELECT reserve_registration_slot('$CHAMP', '99900001002', true)::text;")
fim=$(date +%s)
wait

espera=$((fim - inicio))
if [ "$espera" -ge 2 ]; then
  echo "  ok   a segunda transacao esperou o lock (${espera}s)"
else
  echo "  FALHOU a segunda nao esperou (${espera}s) — o lock nao esta segurando"
  falhou=1
fi
checar "so um goleiro leva a ultima vaga de goleiro" "goalkeepers_full" "$(echo "$b" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

limpar

# =============================================================================
# O COMMIT reconfere a cota, e o par que mantem a inversao viva.
#
# A reserva pode ter VENCIDO entre o passo 1 e o envio, e ai o commit e o unico
# guarda: ele aceita de proposito quem chega sem reserva viva. Sem a cota aqui,
# um goleiro que perdeu a reserva entra por cima do formato, calado.
#
# E o par, que e o ponto todo desta secao: a cota mora DENTRO do
# `IF NOT v_had_reservation`, junto do prazo, e NAO em cima como o sabado.
#
#   sem reserva  -> a cota morde        (`goalkeepers_full`)
#   com reserva  -> a cota NAO morde    (grava)
#
# Quem tem reserva viva de goleiro ja foi contado na cota quando reservou;
# recusa-lo aqui o barraria por uma vaga que ele mesmo ocupa -- o "pagou e foi
# recusado" que a reserva existe para prevenir. Mover o bloco da cota para FORA
# do ramo "por consistencia" com o sabado derruba SO o segundo cenario e deixa o
# primeiro passando. Foi medido assim, nesta ordem: se os dois morrerem, ou
# nenhum, o par nao esta medindo o que promete.
#
# `max_players` FICA FOLGADO (10 para uma cota de 1) de proposito. Com a lotacao
# apertada o excedente e barrado pela LOTACAO de qualquer jeito, e a assertiva
# passaria verde com a cota inteira apagada -- ela mediria lotacao achando que
# mede cota.
echo "== o commit reconfere a cota de goleiro =="
preparar
$DB -c "UPDATE championships SET max_players = 10, max_waitlist_players = 0,
                                 teams_count = 1, players_per_team = 4,
                                 goalkeepers_per_team = 1,
                                 waitlist_goalkeepers = 0, waitlist_outfield = 0
         WHERE id='$CHAMP';" > /dev/null
$DB -c "INSERT INTO players (cpf, name) VALUES
          ('99900001401', 'Goleiro com reserva T6'),
          ('99900001402', 'Goleiro que cabe T6'),
          ('99900001403', 'Goleiro excedente T6'),
          ('99900001404', 'Jogador de linha T6');" > /dev/null
pid_res=$($DB -c "SELECT id FROM players WHERE cpf='99900001401';")
pid_cabe=$($DB -c "SELECT id FROM players WHERE cpf='99900001402';")
pid_exc=$($DB -c "SELECT id FROM players WHERE cpf='99900001403';")
pid_lin=$($DB -c "SELECT id FROM players WHERE cpf='99900001404';")

# Este reserva PRIMEIRO, com a cota ainda vazia, e so envia no fim. E o estado
# que o cenario do par precisa: reserva viva de goleiro numa cota que, quando ele
# enviar, ja vai estar tomada.
$DB -c "SELECT reserve_registration_slot('$CHAMP', '99900001401', true);" > /dev/null

# E este chega SEM reserva e passa, porque a cota ainda tem vaga: o commit conta
# so inscricoes CONFIRMADAS, e a reserva viva acima nao entra na conta dele. Nao
# e brecha -- e a mesma escolha que a checagem de lotacao ao lado ja fazia, e e o
# que enche a cota por um caminho que as proprias RPCs alcancam.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid_cabe', '99900001402',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb, true)::text;")
checar "sem reserva, o goleiro grava enquanto a cota tem vaga" "true" "$(echo "$r" | sed 's/.*\"success\" : \([a-z]*\).*/\1/')"

# CENARIO 1 do par. A cota de goleiro agora esta tomada por UMA inscricao
# confirmada, e a lotacao tem 9 vagas sobrando -- entao quem recusa so pode ser a
# cota.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid_exc', '99900001403',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb, true)::text;")
checar "sem reserva viva, o goleiro excedente e RECUSADO" "goalkeepers_full" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# O antidoto do cenario acima: sem ele, "recusou" poderia significar "a cota
# recusa todo mundo". A cota de goleiro continua cheia, a de linha tem 3 vagas, e
# a MESMA chamada sem reserva passa -- ou seja, a cota fecha SO o balde dela.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid_lin', '99900001404',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb, false)::text;")
checar "e a cota fecha SO o balde dela: o jogador de linha entra" "true" "$(echo "$r" | sed 's/.*\"success\" : \([a-z]*\).*/\1/')"

# CENARIO 2 do par -- o que morre se alguem mover a cota para fora do ramo.
#
# Mesmo instante, mesma cota cheia, mesmo balde que o excedente acima: a UNICA
# diferenca e a reserva viva. E ele e enviado com CINCO argumentos, sem
# `p_is_goalkeeper` nenhum, de proposito: o balde tem de vir da RESERVA, e a
# assertiva seguinte confere que veio.
r=$($DB -c "SELECT commit_registration('$CHAMP', '$pid_res', '99900001401',
      '{\"group_affiliation\":\"G\",\"shirt_size\":\"M\",\"profile_photo_link\":\"http://x/y.jpg\",\"tickets_total\":0}'::jsonb,
      '{\"visao\":4}'::jsonb)::text;")
checar "com reserva viva, o goleiro excedente GRAVA" "true" "$(echo "$r" | sed 's/.*\"success\" : \([a-z]*\).*/\1/')"

# A coluna que 20260820030000 criou passou a ser ALIMENTADA. Ate a T6 ela so
# tinha o backfill: inscricao nova nascia `false` pelo DEFAULT, e a cota
# subcontava para sempre.
#
# Os TRES valores juntos, e nao um: um `is_goalkeeper` cravado em `true` passaria
# numa assertiva sozinha, e o jogador de linha no meio da lista e quem mata isso.
# A ordem e por CPF -- 401 (reserva, goleiro), 402 (goleiro), 404 (linha).
#
# O 401 e a assertiva do balde que veio da RESERVA: o commit dele nao recebeu
# argumento de balde, entao `true` ali so pode ter saido de
# registration_slot_reservations.is_goalkeeper. Se saisse do DEFAULT da coluna,
# viria `false`.
r=$($DB -c "SELECT string_agg(cr.is_goalkeeper::text, '|' ORDER BY p.cpf)
              FROM championship_registrations cr
              JOIN players p ON p.id = cr.player_id
             WHERE cr.championship_id = '$CHAMP';")
checar "o commit GRAVOU o balde de cada inscricao (o do 401 veio da reserva)" "true|true|false" "$(echo "$r" | tr -d ' ')"

limpar

# =============================================================================
# O entregavel de manchete da T2 -- a capacidade derivada -- nao tinha assertiva
# NENHUMA. Tres mutacoes na DDL passavam nos 494 testes, no tsc e no lint:
# trocar `max_players >= 0` de volta para `> 0`, apagar o NOT VALID, e apagar uma
# das cinco colunas. Este script e o unico portao do repo que fala com o banco,
# entao e aqui que elas morrem.
#
# O zero e o ponto todo: `derivedCapacity` devolve `total: 0` para formato nao
# configurado, e o CHECK antigo (`max_players > 0`) tornava esse desfecho seguro
# IMPOSSIVEL de gravar -- sobrava NULL, que significa ILIMITADO. As duas
# assertivas abaixo sao lidas juntas: o zero grava, e o negativo continua barrado.
# Provar so o zero deixaria passar um CHECK apagado.
echo "== a capacidade derivada: o zero grava, o negativo nao =="
preparar

# `|| true` e OBRIGATORIO aqui, e nao desleixo: este arquivo roda com `set -e`
# (linha 19), o psql sai com status != 0 na violacao que a segunda assertiva
# PROVOCA de proposito, e `grep -c` sai 1 quando conta zero. A primeira versao
# deste bloco usava `| grep -c "ERROR"` sem guarda: o script morria aqui SEM
# mensagem, o -x parava de imprimir, e as duas assertivas de privilegio que vem
# depois desapareciam -- 32 assertivas em vez de 34, sem nenhum FALHOU. Nao
# "limpe" o `|| true`, e nao troque o case por grep -c.
#
# O case le a SAIDA, entao a assertiva continua medindo o banco, e nao o status.
saida=$($DB -c "BEGIN; UPDATE championships SET max_players = 0 WHERE id='$CHAMP'; ROLLBACK;" 2>&1 || true)
case "$saida" in *ERROR*) r="recusado" ;; *) r="gravou" ;; esac
checar "max_players = 0 GRAVA (zero fecha, e tem de ser gravavel)" "gravou" "$r"

saida=$($DB -c "BEGIN; UPDATE championships SET max_players = -1 WHERE id='$CHAMP'; ROLLBACK;" 2>&1 || true)
case "$saida" in *ERROR*) r="recusado" ;; *) r="gravou" ;; esac
checar "max_players = -1 RECUSADO (o CHECK nao virou terra arrasada)" "recusado" "$r"

r=$($DB -c "
  SELECT count(*) FROM information_schema.columns
   WHERE table_name = 'championships'
     AND column_name IN ('teams_count','players_per_team','goalkeepers_per_team',
                         'waitlist_goalkeepers','waitlist_outfield');")
checar "as cinco colunas do formato existem" "5" "$(echo "$r" | tr -d ' ')"

# NOT VALID e deliberado: producao esta 15 migrations atras e vai receber este
# CHECK sobre 80 jogadores vivos, onde VALIDATE varre a tabela e pode abortar.
r=$($DB -c "SELECT convalidated::text FROM pg_constraint WHERE conname = 'players_preferred_position_known';")
checar "a CHECK da posicao segue NOT VALID" "false" "$(echo "$r" | tr -d ' ')"

# As cinco colunas guardam numero, e a aritmetica sobre elas fecha nos mesmos
# 80/8/72/5 que derivedCapacity devolve para o formato de 2026.
#
# O nome antigo dizia que o formato "deriva" 80/8/72/5, e nada derivava: o SQL
# abaixo refaz `8 x 10` na mao, e nenhuma linha deste script chama
# derivedCapacity. O que a assertiva mede e que as colunas sao gravaveis, sao
# numericas e guardam o formato -- se o codigo e o SQL divergirem na FORMULA,
# quem pega e `features/championships/capacity.test.ts`, e nao esta linha.
#
# Contra `$CHAMP`, que `preparar()` acabou de criar, e nao contra o seed: ver a
# nota em preparar().
r=$($DB -c "
  SELECT teams_count * players_per_team || '|' ||
         teams_count * goalkeepers_per_team || '|' ||
         (teams_count * players_per_team - teams_count * goalkeepers_per_team) || '|' ||
         (waitlist_goalkeepers + waitlist_outfield)
    FROM championships WHERE id = '$CHAMP';")
checar "a aritmetica sobre as cinco colunas fecha em 80|8|72|5 (o SQL refaz 8x10 na mao)" "80|8|72|5" "$(echo "$r" | tr -d ' ')"

limpar

# =============================================================================
echo "== as RPCs publicas nao sao chamaveis por anon =="
# As DUAS assinaturas ganharam um parametro booleano no fim -- a reserva em
# 20260820030000, o commit em 20260820040000 -- e nas duas a assinatura antiga
# foi DROPADA la (um parametro a mais nao substitui a funcao: cria uma
# sobrecarga, e ai a chamada antiga morre com `is not unique`). Nomear a assinatura
# velha aqui nao daria "false": daria ERRO de funcao inexistente, o script
# morreria no `set -e` e estas duas assertivas sumiriam sem nenhum FALHOU.
r=$($DB -c "
  SELECT has_function_privilege('anon','public.reserve_registration_slot(uuid, text, boolean)','EXECUTE')::text || '|' ||
         has_function_privilege('authenticated','public.reserve_registration_slot(uuid, text, boolean)','EXECUTE')::text;")
checar "reserve_registration_slot fechada para anon/authenticated" "false|false" "$(echo "$r" | tr -d ' ')"

r=$($DB -c "
  SELECT has_function_privilege('anon','public.commit_registration(uuid, uuid, text, jsonb, jsonb, boolean)','EXECUTE')::text || '|' ||
         has_function_privilege('authenticated','public.commit_registration(uuid, uuid, text, jsonb, jsonb, boolean)','EXECUTE')::text;")
checar "commit_registration fechada para anon/authenticated" "false|false" "$(echo "$r" | tr -d ' ')"

limpar

# ASSERCAO, e nao limpeza, de proposito -- nao "conserte" isto para um DELETE.
# Este script pode um dia ser apontado para um banco que nao e o local, e apagar
# ali uma janela que cobre now() DESTRAVARIA a inscricao durante a observancia:
# exatamente o dano que a feature inteira existe para impedir. Gritar e seguro;
# consertar sozinho nao e.
#
# A rede do limpar() nao cobre este caso: ela so apaga starts_at >= '2098-01-01',
# e uma janela cobrindo now() e do ano corrente por definicao. Esta assercao ja
# pagou por si: uma linha viva ficou onze minutos na tabela porque um trap com
# `|| true` engoliu o erro do DELETE. Foi a contagem que gritou, nao o trap.
sabbath_linhas_depois=$($DB -c "SELECT count(*) FROM sabbath_windows;")
sabbath_cobrindo_depois=$($DB -c "SELECT count(*) FROM sabbath_windows WHERE now() BETWEEN starts_at AND ends_at;")

if [ "$sabbath_linhas_antes" != "$sabbath_linhas_depois" ] ||
   [ "$sabbath_cobrindo_antes" != "$sabbath_cobrindo_depois" ]; then
  echo ""
  echo "==============================================================="
  echo "  !!! sabbath_windows MUDOU DURANTE A EXECUCAO !!!"
  echo ""
  echo "  antes:  $sabbath_linhas_antes linhas, $sabbath_cobrindo_antes cobrindo now()"
  echo "  depois: $sabbath_linhas_depois linhas, $sabbath_cobrindo_depois cobrindo now()"
  echo ""
  echo "  Esta tabela e GLOBAL, sem vinculo com campeonato. Uma linha"
  echo "  de teste esquecida aqui PAUSA O SITE DE VERDADE; uma linha"
  echo "  a menos DESTRAVA a inscricao durante a observancia."
  echo ""
  echo "  Ache a linha e remova por valor EXATO de starts_at:"
  echo "    SELECT starts_at, ends_at FROM sabbath_windows"
  echo "     WHERE now() BETWEEN starts_at AND ends_at;"
  echo ""
  echo "  O script NAO apaga sozinho, e isso e deliberado: se este"
  echo "  banco nao for o local, apagar seria o dano, nao a correcao."
  echo ""
  echo "  (Se so o segundo numero mudou e a contagem bate, o por do"
  echo "  sol pode ter virado no meio da execucao -- confira antes.)"
  echo "==============================================================="
  falhou=1
fi

if [ "$falhou" -eq 0 ]; then
  echo ""
  echo "TODOS OS CENARIOS PASSARAM"
else
  echo ""
  echo "HOUVE FALHAS"
  exit 1
fi
