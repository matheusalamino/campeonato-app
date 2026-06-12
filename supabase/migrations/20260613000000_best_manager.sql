BEGIN;

CREATE TABLE IF NOT EXISTS best_manager_votes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             UUID NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id      UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  championship_team_id UUID NOT NULL REFERENCES championship_teams(id) ON DELETE CASCADE,
  points               INTEGER NOT NULL CHECK (points > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT best_manager_votes_match_unique UNIQUE (match_id)
);

CREATE INDEX IF NOT EXISTS best_manager_votes_championship_id_idx ON best_manager_votes(championship_id);
CREATE INDEX IF NOT EXISTS best_manager_votes_match_id_idx ON best_manager_votes(match_id);
CREATE INDEX IF NOT EXISTS best_manager_votes_team_id_idx ON best_manager_votes(championship_team_id);

ALTER TABLE best_manager_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access" ON best_manager_votes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
