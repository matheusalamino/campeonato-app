# Sync Production Data to Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `scripts/sync-prod-to-staging.sh` that dumps all public-schema data from production and restores it into the remote staging database, preserving staging's auth users and profiles.

**Architecture:** One new shell script follows the same pattern as `pull-prod.sh` — pg_dump from production via `docker-compose.prod.yml`, sanitize via existing `sanitize-dump.mjs`, prepend a dynamic TRUNCATE block, then psql-restore to staging via `docker-compose.staging.yml`. A new `sync:prod-to-staging` npm command wraps it.

**Tech Stack:** POSIX sh, Docker Compose (postgres:17-alpine), Node.js (sanitize-dump.mjs already exists)

---

### Task 1: Verify both DB connections are live

**Files:** none (verification only)

- [ ] **Step 1: Check staging connection**

```bash
npm run local:check:staging
```

Expected output:
```
Validando conectividade com o banco remoto...
1/2 - Testando disponibilidade com pg_isready...
aws-0-us-east-1.pooler.supabase.com:5432 - accepting connections
2/2 - Testando autenticacao com uma query somente leitura...
 current_database | current_user | now
------------------+--------------+-----
 postgres         | postgres     | ...
Conexao remota validada com sucesso.
```

If it fails with a password error, open `.secrets/staging.env` and confirm `REMOTE_DB_PASSWORD=Igle@land2906` is set.

- [ ] **Step 2: Check production connection**

```bash
npm run local:check:production
```

Expected output: same format as above. If `REMOTE_DB_PASSWORD` is missing or still `replace-me` in `.secrets/production.env`, fill it in before continuing.

---

### Task 2: Create `scripts/sync-prod-to-staging.sh`

**Files:**
- Create: `scripts/sync-prod-to-staging.sh`

- [ ] **Step 1: Create the script**

Create `scripts/sync-prod-to-staging.sh` with the following content:

```sh
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
```

- [ ] **Step 2: Verify the file was created**

```bash
ls scripts/sync-prod-to-staging.sh
```

Expected: file listed.

- [ ] **Step 3: Test cancellation path (no write to staging)**

```bash
sh scripts/sync-prod-to-staging.sh
```

When prompted `Digite PROD2STG para continuar:`, type anything other than `PROD2STG` (e.g. `no`).

Expected output:
```
AVISO: voce esta prestes a SOBRESCREVER todos os dados publicos de staging com dados de producao.
Profiles e usuarios de staging serao PRESERVADOS.
Digite PROD2STG para continuar: no
Operacao cancelada.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-prod-to-staging.sh
git commit -m "feat: add sync-prod-to-staging script"
```

---

### Task 3: Register the npm command in `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script entry**

In `package.json`, inside the `"scripts"` block, add after `"local:pull:production"`:

```json
"sync:prod-to-staging": "sh scripts/sync-prod-to-staging.sh",
```

The scripts block should look like:

```json
"local:pull:staging": "sh scripts/pull-staging.sh",
"local:pull:production": "sh scripts/pull-prod.sh",
"sync:prod-to-staging": "sh scripts/sync-prod-to-staging.sh",
```

- [ ] **Step 2: Verify the command appears**

```bash
npm run
```

Expected: `sync:prod-to-staging` listed among available scripts.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: register sync:prod-to-staging npm command"
```

---

### Task 4: Run the sync end-to-end

**Files:** none (execution and verification)

- [ ] **Step 1: Run the sync**

```bash
npm run sync:prod-to-staging
```

Type `PROD2STG` when prompted. Expected progress output:

```
AVISO: voce esta prestes a SOBRESCREVER todos os dados publicos de staging com dados de producao.
Profiles e usuarios de staging serao PRESERVADOS.
Digite PROD2STG para continuar: PROD2STG
1/4 - Gerando dump de producao em dumps/.prod-to-stg_....raw.sql...
2/4 - Sanitizando dump...
Dump sanitizado salvo em: .../dumps/prod-to-stg_....sql
3/4 - Adicionando bloco de truncate...
4/4 - Restaurando no banco de staging...
Sincronizacao concluida.
Dump salvo em: dumps/prod-to-stg_YYYY-MM-DD_HH-MM-SS.sql
```

If step 4/4 fails with an error like `ERROR: permission denied` or `RLS policy violation`, it means the postgres user on staging has restricted permissions. In that case, add the following line to the TRUNCATE block and the beginning of the psql restore:

```sql
SET session_replication_role = replica;
```

Add it as the first line in the TRUNCATE_BLOCK heredoc in the script:

```sh
TRUNCATE_BLOCK=$(cat <<'EOSQL'
SET session_replication_role = replica;
DO $$
...
EOSQL
)
```

- [ ] **Step 2: Verify the dump file was saved**

```bash
ls dumps/prod-to-stg_*.sql
```

Expected: one file with today's timestamp.

- [ ] **Step 3: Verify staging data via MCP (restart Claude Code first to activate MCP)**

After restarting Claude Code, ask Claude to run via the Supabase MCP:

```sql
SELECT COUNT(*) FROM championships;
```

Compare the result with the same query run against production. Counts should match.

Also verify profiles are untouched:

```sql
SELECT COUNT(*) FROM profiles;
```

This count should match what was in staging before the sync (not production's profile count).

- [ ] **Step 4: Commit nothing** — the dump file is gitignored, the sync is complete.
