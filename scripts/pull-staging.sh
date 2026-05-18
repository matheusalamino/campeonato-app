#!/usr/bin/env sh

set -eu

# Resolve o diretorio raiz do projeto para manter os caminhos estaveis.
ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SECRETS_FILE="$ROOT_DIR/.secrets/staging.env"
DUMPS_DIR="$ROOT_DIR/dumps"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
RAW_DUMP_REL="dumps/.staging_${TIMESTAMP}.raw.sql"
FINAL_DUMP_REL="dumps/staging_${TIMESTAMP}.sql"
RAW_DUMP="$ROOT_DIR/$RAW_DUMP_REL"
FINAL_DUMP="$ROOT_DIR/$FINAL_DUMP_REL"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Arquivo de secrets nao encontrado: $SECRETS_FILE" >&2
  echo "Copie .secrets/staging.env.example para .secrets/staging.env e preencha as credenciais." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker nao encontrado. Instale o Docker Desktop antes de puxar staging." >&2
  exit 1
fi

# Carrega as credenciais do banco remoto e valida os campos obrigatorios.
set -a
. "$SECRETS_FILE"
set +a

for required_var in REMOTE_DB_HOST REMOTE_DB_PORT REMOTE_DB_NAME REMOTE_DB_USER REMOTE_DB_PASSWORD; do
  eval "current_value=\${$required_var:-}"
  if [ -z "$current_value" ]; then
    echo "Variavel obrigatoria ausente em $SECRETS_FILE: $required_var" >&2
    exit 1
  fi
done

mkdir -p "$DUMPS_DIR"

# Gera um dump bruto dentro do container utilitario para nao depender de pg_dump local.
echo "Gerando dump de staging em $FINAL_DUMP_REL..."
cd "$ROOT_DIR"
docker compose -f docker-compose.staging.yml run --rm \
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

# Remove dados sensiveis e vinculos de usuarios reais antes de salvar o dump final.
echo "Sanitizando dump de staging..."
node scripts/sanitize-dump.mjs "$RAW_DUMP" "$FINAL_DUMP"
rm -f "$RAW_DUMP"

# Restaura o snapshot sanitizado no Supabase local.
echo "Restaurando dump sanitizado no Supabase local..."
sh scripts/restore-local-from-dump.sh "$FINAL_DUMP"

echo "Fluxo de staging concluido."
echo "Arquivo salvo em: $FINAL_DUMP_REL"
