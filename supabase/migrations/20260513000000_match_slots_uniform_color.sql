-- =============================================================================
-- Migration: Add uniform_color to match_slots
-- =============================================================================

BEGIN;

ALTER TABLE public.match_slots
  ADD COLUMN uniform_color TEXT;

COMMIT;
