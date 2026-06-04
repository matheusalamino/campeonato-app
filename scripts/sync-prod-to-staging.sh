#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PROD_SECRETS="$ROOT_DIR/.secrets/production.env"
STG_SECRETS="$ROOT_DIR/.secrets/staging.env"
DUMPS_DIR="$ROOT_DIR/dumps"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
RAW_DUMP_REL="dumps/.prod-to-stg_${TIMESTAMP}.raw.sql"
FINAL_DUMP_REL="dumps/prod-to-stg_${TIMESTAMP}.sql"
RAW_DUMP="$ROOT_DIR/$RAW_DUMP_REL"
FINAL_DUMP="$ROOT_DIR/$FINAL_DUMP_REL"
trap 'rm -f "$RAW_DUMP"' EXIT

if [ ! -f "$PROD_SECRETS" ]; then
  echo "Arquivo de secrets de producao nao encontrado: $PROD_SECRETS" >&2
  echo "Copie .secrets/production.env.example para .secrets/production.env e preencha as credenciais." >&2
  exit 1
fi

if [ ! -f "$STG_SECRETS" ]; then
  echo "Arquivo de secrets de staging nao encontrado: $STG_SECRETS" >&2
  echo "Copie .secrets/staging.env.example para .secrets/staging.env e preencha as credenciais." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker nao encontrado. Instale o Docker Desktop antes de sincronizar." >&2
  exit 1
fi

set -a
. "$PROD_SECRETS"
set +a

for required_var in REMOTE_DB_HOST REMOTE_DB_PORT REMOTE_DB_NAME REMOTE_DB_USER REMOTE_DB_PASSWORD; do
  eval "current_value=\${$required_var:-}"
  if [ -z "$current_value" ]; then
    echo "Variavel obrigatoria ausente em $PROD_SECRETS: $required_var" >&2
    exit 1
  fi
done

set -a
. "$STG_SECRETS"
set +a

for required_var in REMOTE_DB_HOST REMOTE_DB_PORT REMOTE_DB_NAME REMOTE_DB_USER REMOTE_DB_PASSWORD; do
  eval "current_value=\${$required_var:-}"
  if [ -z "$current_value" ]; then
    echo "Variavel obrigatoria ausente em $STG_SECRETS: $required_var" >&2
    exit 1
  fi
done

echo "AVISO: voce esta prestes a SOBRESCREVER todos os dados publicos de staging com dados de producao."
echo "Profiles e usuarios de staging serao PRESERVADOS."
printf "Digite PROD2STG para continuar: "
read -r confirmation

if [ "$confirmation" != "PROD2STG" ]; then
  echo "Operacao cancelada."
  exit 1
fi

mkdir -p "$DUMPS_DIR"

echo "1/4 - Gerando dump de producao em $RAW_DUMP_REL..."
cd "$ROOT_DIR"
docker compose -f docker-compose.prod.yml run --rm \
  -e DUMP_PATH="/workspace/$RAW_DUMP_REL" \
  db-tools \
  sh -lc '
    export PGPASSWORD="$REMOTE_DB_PASSWORD"
    export PGSSLMODE="${REMOTE_DB_SSLMODE:-require}"
    pg_dump \
      --data-only \
      --inserts \
      --column-inserts \
      --schema=public \
      --no-owner \
      --no-privileges \
      --host="$REMOTE_DB_HOST" \
      --port="$REMOTE_DB_PORT" \
      --username="$REMOTE_DB_USER" \
      "$REMOTE_DB_NAME" > "$DUMP_PATH"
  '

echo "2/4 - Sanitizando dump..."
node scripts/sanitize-dump.mjs "$RAW_DUMP" "$FINAL_DUMP"
rm -f "$RAW_DUMP"

echo "3/4 - Adicionando bloco de truncate..."
TRUNCATE_BLOCK=$(cat <<'EOSQL'
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT IN ('profiles')
    ORDER BY tablename
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
  END LOOP;
END $$;
EOSQL
)

printf '%s\n\n' "$TRUNCATE_BLOCK" | cat - "$FINAL_DUMP" > "${FINAL_DUMP}.tmp"
mv "${FINAL_DUMP}.tmp" "$FINAL_DUMP"

echo "4/4 - Restaurando no banco de staging..."
docker compose -f docker-compose.staging.yml run --rm \
  -e DUMP_FILE="/workspace/$FINAL_DUMP_REL" \
  db-tools \
  sh -lc '
    export PGPASSWORD="$REMOTE_DB_PASSWORD"
    export PGSSLMODE="${REMOTE_DB_SSLMODE:-require}"
    psql \
      --host="$REMOTE_DB_HOST" \
      --port="$REMOTE_DB_PORT" \
      --username="$REMOTE_DB_USER" \
      --dbname="$REMOTE_DB_NAME" \
      -f "$DUMP_FILE"
  '

echo "Sincronizacao concluida."
echo "Dump salvo em: $FINAL_DUMP_REL"
