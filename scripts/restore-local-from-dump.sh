#!/usr/bin/env sh

set -eu

# Esse script sempre recebe um dump ja gerado localmente e restaura
# o conteudo dentro do Supabase local, adaptando colunas quando o schema
# remoto nao bate 100% com o schema atual do projeto.
if [ "$#" -lt 1 ]; then
  echo "Uso: sh scripts/restore-local-from-dump.sh <arquivo.sql>" >&2
  exit 1
fi

DUMP_FILE=$1

if [ ! -f "$DUMP_FILE" ]; then
  echo "Arquivo nao encontrado: $DUMP_FILE" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql nao encontrado. Instale o cliente PostgreSQL para restaurar dumps locais." >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI nao encontrado. Instale a CLI antes de restaurar dumps locais." >&2
  exit 1
fi

STATUS_OUTPUT=$(supabase status -o env 2>/dev/null || true)

if [ -z "$STATUS_OUTPUT" ]; then
  echo "Supabase local nao estava ativo. Subindo o stack automaticamente..."
  supabase start
  STATUS_OUTPUT=$(supabase status -o env 2>/dev/null || true)
fi

pick_var() {
  for key in "$@"; do
    value=$(printf '%s\n' "$STATUS_OUTPUT" | grep "^${key}=" | head -n 1 | cut -d= -f2- || true)
    if [ -n "$value" ]; then
      printf '%s' "$value" | sed 's/^"//; s/"$//; s/\r$//'
      return 0
    fi
  done

  return 1
}

LOCAL_DB_URL=$(pick_var DB_URL POSTGRES_URL SUPABASE_DB_URL || true)

if [ -z "$LOCAL_DB_URL" ]; then
  echo "Nao foi possivel descobrir a URL do banco local pelo Supabase CLI." >&2
  exit 1
fi

echo "Resetando o banco local sem seed..."
supabase db reset --local --no-seed

prepared_dump=$(mktemp "${TMPDIR:-/tmp}/local-restore.XXXXXX.sql")
cleanup_file=$(mktemp)
trap 'rm -f "$prepared_dump" "$cleanup_file"' EXIT

# Ajusta o dump para o schema atual antes da restauracao.
echo "Adaptando dump ao schema local..."
node scripts/prepare-local-import.mjs "$DUMP_FILE" "$LOCAL_DB_URL" "$prepared_dump"

echo "Importando dump no Postgres local..."
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$prepared_dump"

# Reaplica a sanitizacao no banco local como camada defensiva.
cat >"$cleanup_file" <<SQL
DELETE FROM public.profiles;
UPDATE public.managers SET user_id = NULL WHERE user_id IS NOT NULL;
UPDATE public.draft_fines SET applied_by = NULL WHERE applied_by IS NOT NULL;
UPDATE public.draft_transfers SET registered_by = NULL WHERE registered_by IS NOT NULL;
SQL

echo "Aplicando sanitizacao defensiva no banco local..."
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "$cleanup_file"

echo "Recriando o admin local conhecido..."
sh scripts/seed-auth-local.sh

echo "Atualizando o .env.local com as credenciais do Supabase local..."
sh scripts/sync-local-env.sh

echo "Restauracao concluida."
echo "Login local disponivel em admin@local.test / Admin123!"
