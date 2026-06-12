-- supabase/migrations/20260612000000_best_player.sql

-- 1. Add vote_weight to phases (defaults to 1 so existing phases are unaffected)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS vote_weight INTEGER NOT NULL DEFAULT 1;

-- 2. Create best_player_votes table
CREATE TABLE IF NOT EXISTS best_player_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  voter_role      TEXT NOT NULL CHECK (voter_role IN ('home_manager', 'away_manager', 'referee')),
  points          INTEGER NOT NULL CHECK (points > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT best_player_votes_match_voter_unique UNIQUE (match_id, voter_role)
);

-- 3. Enable RLS (consistent with all other tables in this project)
ALTER TABLE best_player_votes ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated users (same pattern as match_events_v2)
CREATE POLICY "authenticated full access" ON best_player_votes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
