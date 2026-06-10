-- =============================================================================
-- Migration: Suspensions and Player Card Stats
-- Creates suspensions table, player_card_stats table, and read-only views.
-- No business logic — data model only.
-- =============================================================================

BEGIN;

-- ── TABLE: suspensions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suspensions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID NOT NULL REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  origin_match_id     UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  suspended_match_id  UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL CHECK (reason IN ('red_card', 'two_yellows')),
  served              BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suspensions_registration_id ON public.suspensions(registration_id);
CREATE INDEX idx_suspensions_suspended_match  ON public.suspensions(suspended_match_id);

ALTER TABLE public.suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public suspensions are viewable by everyone"
  ON public.suspensions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage suspensions"
  ON public.suspensions FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── TABLE: player_card_stats ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_card_stats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id      UUID NOT NULL UNIQUE REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  active_yellow_cards  INTEGER NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_player_card_stats_registration ON public.player_card_stats(registration_id);

ALTER TABLE public.player_card_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public player card stats are viewable by everyone"
  ON public.player_card_stats FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage player card stats"
  ON public.player_card_stats FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- ── VIEW: v_suspended_players ────────────────────────────────────────────────
-- Unserved suspensions enriched with championship and player context.
-- Query pattern: WHERE registration_id = ? AND suspended_match_id = ?

CREATE OR REPLACE VIEW public.v_suspended_players AS
SELECT
  s.id                AS suspension_id,
  s.registration_id,
  s.suspended_match_id,
  s.reason,
  s.served,
  cr.championship_id,
  cr.player_id
FROM public.suspensions s
JOIN public.championship_registrations cr ON cr.id = s.registration_id
WHERE s.served = false;

-- ── VIEW: v_booked_players ───────────────────────────────────────────────────
-- Players with at least 1 active yellow card (one away from suspension).
-- Query pattern: WHERE registration_id = ? or WHERE championship_id = ?

CREATE OR REPLACE VIEW public.v_booked_players AS
SELECT
  pcs.registration_id,
  pcs.active_yellow_cards,
  cr.championship_id,
  cr.player_id
FROM public.player_card_stats pcs
JOIN public.championship_registrations cr ON cr.id = pcs.registration_id
WHERE pcs.active_yellow_cards >= 1;

COMMIT;
