#!/usr/bin/env sh

set -eu

ADMIN_EMAIL=${LOCAL_ADMIN_EMAIL:-admin@local.test}
ADMIN_PASSWORD=${LOCAL_ADMIN_PASSWORD:-Admin123!}
ADMIN_NAME=${LOCAL_ADMIN_NAME:-Administrador Local}

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI nao encontrado. Instale a CLI antes de recriar o admin local." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl nao encontrado. Instale o curl para recriar o admin local." >&2
  exit 1
fi

STATUS_OUTPUT=$(supabase status -o env 2>/dev/null || true)

if [ -z "$STATUS_OUTPUT" ]; then
  echo "Nao foi possivel ler o status do Supabase local." >&2
  echo "Suba o ambiente com 'npm run local:start' e tente novamente." >&2
  exit 1
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

API_URL=$(pick_var API_URL SUPABASE_URL || true)
SERVICE_ROLE_KEY=$(pick_var SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY SECRET_KEY SUPABASE_SECRET_KEY || true)

if [ -z "$API_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Nao encontrei API_URL e SERVICE_ROLE_KEY no output de 'supabase status -o env'." >&2
  echo "Revise a versao da CLI e rode novamente com o stack local ativo." >&2
  exit 1
fi

cleanup_file=$(mktemp)
profile_file=
trap 'rm -f "$cleanup_file" "$profile_file"' EXIT

cat >"$cleanup_file" <<SQL
WITH target_users AS (
  SELECT id
  FROM auth.users
  WHERE email = '$ADMIN_EMAIL'
),
deleted_profiles AS (
  DELETE FROM public.profiles
  WHERE id IN (SELECT id FROM target_users)
),
deleted_identities AS (
  DELETE FROM auth.identities
  WHERE user_id IN (SELECT id FROM target_users)
)
DELETE FROM auth.users
WHERE email = '$ADMIN_EMAIL';
SQL

echo "Removendo admin local anterior, se existir..."
supabase db query --local --file "$cleanup_file"

echo "Criando admin local pela Auth Admin API..."
response_file=$(mktemp)
http_code=$(
  curl -sS \
    -o "$response_file" \
    -w "%{http_code}" \
    -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$ADMIN_NAME\"},\"app_metadata\":{\"role\":\"admin\"}}"
)

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  echo "Falha ao criar o admin local pela API. HTTP $http_code." >&2
  cat "$response_file" >&2
  rm -f "$response_file"
  exit 1
fi

ADMIN_ID=$(
  node -e "
    let body = '';
    process.stdin.on('data', (chunk) => body += chunk);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(body);
      if (!parsed.id) process.exit(2);
      process.stdout.write(parsed.id);
    });
  " < "$response_file"
)
rm -f "$response_file"

profile_file=$(mktemp)

cat >"$profile_file" <<SQL
INSERT INTO public.profiles (id, name, role, created_at)
VALUES (
  '$ADMIN_ID',
  '$ADMIN_NAME',
  'admin',
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  role = EXCLUDED.role;
SQL

echo "Garantindo profile local do admin..."
supabase db query --local --file "$profile_file"

echo "Admin local pronto em $ADMIN_EMAIL / $ADMIN_PASSWORD"
