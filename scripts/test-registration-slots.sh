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
# now(): 18 das 32 assertivas falham. Passam os cenarios que montam a janela
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
preparar() {
  limpar
  $DB -c "
    INSERT INTO championships (id, name, slug, status, max_players, max_waitlist_players)
    VALUES ('$CHAMP', 'Teste A4', 'teste-a4', 'subscribing', 2, 1);
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
SELECT commit_registration('$CHAMP', '$pid', '99900000701',
  '{"group_affiliation":"G","shirt_size":"M","profile_photo_link":"http://x/y.jpg","tickets_total":0}'::jsonb,
  '{"visao":4}'::jsonb)::text;
ROLLBACK;
SQL
)
r=$(echo "$saida" | grep '"success"')
checar "o sabado recusa mesmo com reserva viva" "sabbath" "$(echo "$r" | sed 's/.*\"reason\" : \"\([a-z_]*\)\".*/\1/')"

# NAO acrescente aqui um "e nao gravou nada" contando championship_registrations:
# foi tentado e removido. O ROLLBACK desfaz o INSERT de qualquer jeito, entao a
# contagem da 0 mesmo quando a funcao GRAVOU -- medido com a checagem de sabado
# movida para dentro do IF NOT v_had_reservation: o commit devolveu
# registration_id e a contagem passou verde assim mesmo. Assertiva que nao
# consegue falhar so infla o placar. Quem quiser cobrir isso precisa ler a
# contagem DENTRO da transacao, antes do ROLLBACK.
#
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
echo "== as RPCs publicas nao sao chamaveis por anon =="
r=$($DB -c "
  SELECT has_function_privilege('anon','public.reserve_registration_slot(uuid, text)','EXECUTE')::text || '|' ||
         has_function_privilege('authenticated','public.reserve_registration_slot(uuid, text)','EXECUTE')::text;")
checar "reserve_registration_slot fechada para anon/authenticated" "false|false" "$(echo "$r" | tr -d ' ')"

r=$($DB -c "
  SELECT has_function_privilege('anon','public.commit_registration(uuid, uuid, text, jsonb, jsonb)','EXECUTE')::text || '|' ||
         has_function_privilege('authenticated','public.commit_registration(uuid, uuid, text, jsonb, jsonb)','EXECUTE')::text;")
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
