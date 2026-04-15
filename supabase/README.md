# Supabase Database Migrations

## Environment References

| Environment | Project Ref                  |
|-------------|------------------------------|
| Staging     | `ydcevehrbmzkqqqcssvm`       |
| Production  | `blcsqyawytmbnbpbzlvs`       |

## Prerequisites

```bash
brew install supabase/tap/supabase
supabase login
```

## Migration Files

Migrations live in `supabase/migrations/` and follow the `YYYYMMDDHHMMSS_name.sql` timestamp format.

| Version          | Name                     | Description                                                              |
|------------------|--------------------------|--------------------------------------------------------------------------|
| `20260411000000` | `initial_schema`         | Baseline schema: profiles, players, teams, managers, championships, etc. |
| `20260412000000` | `draft_tables`           | Draft-specific tables and columns for the auction system                 |
| `20260412000001` | `team_manager_portal`    | Team manager portal: user linking, favorites, special card RPC           |

## Daily Workflow

### Link to an environment

Before running any remote command (`db push`, `migration list`, `migration repair`), you must link to the target project:

```bash
# Link to staging (default day-to-day work)
npm run db:link:staging

# Link to production (deploy time)
npm run db:link:production
```

### Create a new migration

```bash
npm run db:new -- <descriptive_name>
# Example: npm run db:new -- add_match_lineups
```

This creates an empty file in `supabase/migrations/` with the correct timestamp prefix.

### Preview pending migrations (dry run)

```bash
npm run db:push:dry
```

### Push migrations to the linked project

```bash
npm run db:push
```

### List migration status

```bash
npm run db:migrations
```

## First-Time Setup (Repair Existing Environments)

Both staging and production databases were created before migrations were tracked. You must mark already-applied migrations as `applied` so `db push` only runs the pending ones.

### Staging

Staging already has the initial schema and the draft tables applied manually. The team manager portal is pending.

```bash
# 1. Link to staging
npm run db:link:staging

# 2. Mark the two already-applied migrations
supabase migration repair 20260411000000 --status applied
supabase migration repair 20260412000000 --status applied

# 3. Dry-run to confirm only team_manager_portal is pending
npm run db:push:dry

# 4. Push the pending migration
npm run db:push
```

### Production

Production only has the initial schema (no draft tables, no team manager portal).

```bash
# 1. Link to production
npm run db:link:production

# 2. Mark only the baseline as applied
supabase migration repair 20260411000000 --status applied

# 3. Dry-run to confirm draft_tables + team_manager_portal are pending
npm run db:push:dry

# 4. Push when ready
npm run db:push
```

## Deployment Checklist

1. Create and test migrations locally or on staging first
2. `npm run db:link:staging` then `npm run db:push`
3. Verify staging works correctly
4. `npm run db:link:production` then `npm run db:push:dry` to preview
5. `npm run db:push` to apply to production
