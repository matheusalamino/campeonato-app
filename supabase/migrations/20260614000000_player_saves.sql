BEGIN;

-- Create player_saves table to track goalkeeper saves
CREATE TABLE IF NOT EXISTS player_saves (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id  UUID        NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id  UUID        NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  is_penalty       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS player_saves_match_idx        ON player_saves(match_id);
CREATE INDEX IF NOT EXISTS player_saves_championship_idx ON player_saves(championship_id);
CREATE INDEX IF NOT EXISTS player_saves_registration_idx ON player_saves(registration_id);

-- Enable RLS (consistent with all other tables in this project)
ALTER TABLE player_saves ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated users (same pattern as other tables)
CREATE POLICY "authenticated full access" ON player_saves
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
