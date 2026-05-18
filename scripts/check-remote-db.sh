#!/usr/bin/env sh

set -eu

if [ "$#" -lt 2 ]; then
  echo "Uso: sh scripts/check-remote-db.sh <docker-compose.yml> <arquivo.env>" >&2
  exit 1
fi

# Recebe explicitamente o compose e o arquivo de secrets para poder
# reutilizar o mesmo script para staging e producao.
COMPOSE_FILE=$1
SECRETS_FILE=$2

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

if [ ! -f "$ROOT_DIR/$COMPOSE_FILE" ]; then
  echo "Arquivo docker compose nao encontrado: $COMPOSE_FILE" >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/$SECRETS_FILE" ]; then
  echo "Arquivo de secrets nao encontrado: $SECRETS_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker nao encontrado. Instale o Docker Desktop antes de validar a conexao remota." >&2
  exit 1
fi

set -a
. "$ROOT_DIR/$SECRETS_FILE"
set +a

for required_var in REMOTE_DB_HOST REMOTE_DB_PORT REMOTE_DB_NAME REMOTE_DB_USER REMOTE_DB_PASSWORD; do
  eval "current_value=\${$required_var:-}"
  if [ -z "$current_value" ]; then
    echo "Variavel obrigatoria ausente em $SECRETS_FILE: $required_var" >&2
    exit 1
  fi
done

echo "Validando conectividade com o banco remoto..."

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" run --rm db-tools sh -lc '
  export PGPASSWORD="$REMOTE_DB_PASSWORD"
  export PGSSLMODE="${REMOTE_DB_SSLMODE:-require}"

  echo "1/2 - Testando disponibilidade com pg_isready..."
  pg_isready \
    --host="$REMOTE_DB_HOST" \
    --port="$REMOTE_DB_PORT" \
    --username="$REMOTE_DB_USER" \
    --dbname="$REMOTE_DB_NAME"

  echo "2/2 - Testando autenticacao com uma query somente leitura..."
  psql \
    --host="$REMOTE_DB_HOST" \
    --port="$REMOTE_DB_PORT" \
    --username="$REMOTE_DB_USER" \
    --dbname="$REMOTE_DB_NAME" \
    -c "select current_database(), current_user, now();"
'

echo "Conexao remota validada com sucesso."
