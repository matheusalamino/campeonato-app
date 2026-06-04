# Design: Sync Production Data to Staging

**Date:** 2026-06-04
**Status:** Approved

## Goal

Push all business data from the production Supabase project into the staging Supabase project, so staging mirrors production exactly — without overwriting staging's auth users, profiles, or user-linked FK columns.

## Context

The project already has:
- `scripts/pull-prod.sh` — dumps production → restores to local Supabase
- `scripts/pull-staging.sh` — dumps staging → restores to local Supabase
- `scripts/sanitize-dump.mjs` — strips/nullifies user-linked data from dumps
- `docker-compose.prod.yml` — db-tools container using `.secrets/production.env`
- `docker-compose.staging.yml` — db-tools container using `.secrets/staging.env`
- `.secrets/production.env` — production DB credentials (already configured)
- `.secrets/staging.env` — staging DB credentials (configured as part of this work)
- `.mcp.json` — Supabase MCP server configured for staging project `ydcevehrbmzkqqqcssvm`

## Scope

### Full sync (Option A)

All `public` schema tables from production are restored to staging, except those listed under "Preserved".

### Preserved in staging

| What | Why |
|---|---|
| `auth.*` tables | Excluded from pg_dump via `--schema=public` — never touched |
| `profiles` table | Skipped by `sanitize-dump.mjs` (`skipTables` set) — not truncated, not inserted |
| `managers.user_id` | Nullified by `sanitize-dump.mjs` — staging managers won't be linked to wrong prod user UUIDs |
| `draft_fines.applied_by` | Nullified by `sanitize-dump.mjs` |
| `draft_transfers.registered_by` | Nullified by `sanitize-dump.mjs` |

### Replaced in staging

All other `public` schema tables — championships, phases, groups, group_slots, standings, teams, players, managers (data), matches, match_events, penalty_shootouts, balance_transactions, pots, draft_* tables, organizer_evaluations, etc.

## New Artifacts

### `scripts/sync-prod-to-staging.sh`

Step-by-step flow:

1. Validate `.secrets/production.env` exists and has all required vars (`REMOTE_DB_HOST`, `REMOTE_DB_PORT`, `REMOTE_DB_NAME`, `REMOTE_DB_USER`, `REMOTE_DB_PASSWORD`)
2. Validate `.secrets/staging.env` exists and has all required vars
3. Safety prompt: user must type `PROD2STG` to continue
4. Create `dumps/` directory if missing
5. Run `pg_dump` from production via `docker-compose.prod.yml`:
   - Flags: `--data-only --inserts --column-inserts --schema=public --no-owner --no-privileges`
   - Output: `dumps/.prod-to-stg_TIMESTAMP.raw.sql` (hidden, temporary)
6. Sanitize via `node scripts/sanitize-dump.mjs`:
   - Input: raw dump
   - Output: `dumps/prod-to-stg_TIMESTAMP.sql`
   - Deletes raw dump after sanitization
7. Prepend a dynamic TRUNCATE block to the sanitized dump:
   - Queries staging for all `public` table names
   - Excludes `profiles`
   - Emits `TRUNCATE TABLE ... CASCADE` for all others (handles FK order automatically)
8. Restore sanitized+truncated dump to staging via `docker-compose.staging.yml` using `psql`
9. Print success message with dump path

### `package.json` — new script entry

```json
"sync:prod-to-staging": "sh scripts/sync-prod-to-staging.sh"
```

## Safety

- Requires explicit `PROD2STG` confirmation before any write to staging
- Raw dump is always deleted after sanitization
- Sanitized dump is retained in `dumps/` for audit/rollback reference
- Script fails fast (`set -eu`) on any error

## MCP Configuration

`.mcp.json` is configured with the Supabase MCP server for staging (`ydcevehrbmzkqqqcssvm`) including the personal access token in the Authorization header. This enables post-sync verification directly from Claude Code.

## What Does NOT Change

- `sanitize-dump.mjs` — reused as-is, no modifications
- `docker-compose.prod.yml` — reused as-is
- `docker-compose.staging.yml` — reused as-is
- All existing local pull scripts — untouched

## Sequence Diagram

```
sync-prod-to-staging.sh
  │
  ├─ [validate] production.env + staging.env
  ├─ [prompt]   type PROD2STG to continue
  │
  ├─ docker-compose.prod.yml → pg_dump ──────────────────► .raw.sql
  ├─ sanitize-dump.mjs (.raw.sql → .sql, deletes .raw)
  ├─ prepend TRUNCATE block (queries staging for table list)
  │
  └─ docker-compose.staging.yml → psql ──────────────────► staging DB
                                                            (profiles untouched)
```
