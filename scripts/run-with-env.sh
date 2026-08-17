#!/usr/bin/env sh

# Roda um comando local com as variaveis de um ambiente remoto ja no processo.
#
# O Next nao sobrescreve variavel que ja esteja no process.env, entao exportar
# aqui basta: o .env.local continua no disco, intocado, e o `npm run dev` puro
# segue apontando para o Supabase local.
#
#   sh scripts/run-with-env.sh staging
#   sh scripts/run-with-env.sh production npm run build

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

AMBIENTE=${1:-}
if [ -z "$AMBIENTE" ]; then
  echo "Uso: sh scripts/run-with-env.sh <staging|production> [comando...]" >&2
  exit 1
fi
shift

case "$AMBIENTE" in
  staging|production) ;;
  *)
    echo "Ambiente invalido: '$AMBIENTE'. Use 'staging' ou 'production'." >&2
    exit 1
    ;;
esac

ENV_FILE="$ROOT_DIR/.secrets/$AMBIENTE.app.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo de ambiente nao encontrado: .secrets/$AMBIENTE.app.env" >&2
  echo "Crie a partir do modelo:" >&2
  echo "  cp .secrets/$AMBIENTE.app.env.example .secrets/$AMBIENTE.app.env" >&2
  echo "Depois preencha os valores reais do painel do Supabase (Settings > API)." >&2
  exit 1
fi

# Le uma chave sem executar o arquivo — nunca damos `source` em algo que
# guarda credencial, para um valor com backtick nao virar comando.
read_var() {
  grep "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//; s/\r$//'
}

OBRIGATORIAS="NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY"

# Uma variavel faltando aqui faria o app cair de volta no valor do .env.local,
# rodando com a URL do ambiente remoto somada a chave local. Falha cedo.
for KEY in $OBRIGATORIAS; do
  VALUE=$(read_var "$KEY" || true)
  case "$VALUE" in
    "")
      echo "Variavel $KEY ausente ou vazia em .secrets/$AMBIENTE.app.env." >&2
      exit 1
      ;;
    replace*)
      echo "Variavel $KEY ainda esta com o valor de exemplo em .secrets/$AMBIENTE.app.env." >&2
      echo "Preencha com o valor real antes de rodar." >&2
      exit 1
      ;;
  esac
done

if [ "$AMBIENTE" = "production" ] && [ "${CONFIRM_PRODUCTION:-}" != "1" ]; then
  echo "" >&2
  echo "  Voce esta prestes a rodar o app local apontando para PRODUCAO." >&2
  echo "  A service-role ignora RLS. A inscricao publica grava jogador e" >&2
  echo "  inscricao reais, e pode fechar as inscricoes de um campeonato." >&2
  echo "" >&2
  printf '  Digite "production" para confirmar: ' >&2
  read -r RESPOSTA || RESPOSTA=""
  if [ "$RESPOSTA" != "production" ]; then
    echo "  Abortado." >&2
    exit 1
  fi
  echo "" >&2
fi

for KEY in $OBRIGATORIAS; do
  export "$KEY=$(read_var "$KEY")"
done

HOST=$(printf '%s' "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's#^https?://##; s#/.*##')
echo "→ ambiente: $(printf '%s' "$AMBIENTE" | tr '[:lower:]' '[:upper:]')  ·  supabase: $HOST" >&2

if [ "$#" -eq 0 ]; then
  set -- npm run dev
fi

exec "$@"
