-- =============================================================================
-- Migration: players.position compatibility
-- Mantem compatibilidade entre o schema versionado e consultas que ainda leem
-- players.position em vez de preferred_position.
-- =============================================================================

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS position text
  GENERATED ALWAYS AS (preferred_position) STORED;

COMMIT;
