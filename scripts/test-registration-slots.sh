#!/bin/sh
# Testa reserve_registration_slot e commit_registration contra o Postgres local.
# Roda com: sh scripts/test-registration-slots.sh
#
# Cria um campeonato descartavel, exercita os cenarios e apaga tudo no fim.
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

limpar

if [ "$falhou" -eq 0 ]; then
  echo ""
  echo "TODOS OS CENARIOS PASSARAM"
else
  echo ""
  echo "HOUVE FALHAS"
  exit 1
fi
