#!/usr/bin/env sh

set -eu

# Procura o dump de producao mais recente usando o padrao de nome oficial.
ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DUMPS_DIR="$ROOT_DIR/dumps"

if [ ! -d "$DUMPS_DIR" ]; then
  echo "Diretorio de dumps nao encontrado: $DUMPS_DIR" >&2
  exit 1
fi

LATEST_DUMP=$(
  find "$DUMPS_DIR" -maxdepth 1 -type f -name 'production_*.sql' | sort | tail -n 1
)

if [ -z "${LATEST_DUMP:-}" ]; then
  echo "Nenhum dump de producao encontrado em $DUMPS_DIR." >&2
  echo "Gere um com 'npm run local:pull:production' antes de usar este atalho." >&2
  exit 1
fi

echo "Restaurando o dump de producao mais recente:"
echo "$LATEST_DUMP"

sh "$ROOT_DIR/scripts/restore-local-from-dump.sh" "$LATEST_DUMP"
