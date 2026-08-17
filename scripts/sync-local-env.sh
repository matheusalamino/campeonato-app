#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI nao encontrado. Instale a CLI antes de gerar o .env.local." >&2
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

# `|| true` evita que o `set -e` aborte antes das validacoes amigaveis abaixo.
SUPABASE_URL=$(pick_var API_URL SUPABASE_URL || true)
SUPABASE_ANON_KEY=$(pick_var ANON_KEY SUPABASE_ANON_KEY || true)
SUPABASE_SERVICE_ROLE_KEY=$(pick_var SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY || true)
SUPABASE_DB_URL=$(pick_var DB_URL POSTGRES_URL || true)

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Nao encontrei API_URL e ANON_KEY no output de 'supabase status -o env'." >&2
  echo "Revise a versao da CLI e rode o comando novamente com o stack local ativo." >&2
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Nao encontrei SERVICE_ROLE_KEY no output de 'supabase status -o env'." >&2
  echo "A inscricao publica (/inscrever) usa essa chave no servidor e nao sobe sem ela." >&2
  echo "Revise a versao da CLI e rode o comando novamente com o stack local ativo." >&2
  exit 1
fi

{
  echo "# Ambiente local gerado automaticamente a partir do Supabase local."
  echo "# Rode 'npm run local:env' novamente sempre que recriar o stack local."
  echo "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
  echo
  echo "# Chave service-role, usada apenas no servidor (lib/supabase/admin.ts)."
  echo "# Ignora RLS: nunca exponha no browser nem commite valores de staging/producao."
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"

  if [ -n "$SUPABASE_DB_URL" ]; then
    echo
    echo "# String util para psql/GUI local. Nao e lida pela aplicacao."
    echo "SUPABASE_DB_URL=$SUPABASE_DB_URL"
  fi
} > "$ROOT_DIR/.env.local"

echo ".env.local atualizado com as credenciais do Supabase local."
