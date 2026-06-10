-- Allow suspended_match_id to be NULL for cross-phase suspensions
-- where the team's next match is not yet determined by group standings.
ALTER TABLE public.suspensions
  ALTER COLUMN suspended_match_id DROP NOT NULL;
