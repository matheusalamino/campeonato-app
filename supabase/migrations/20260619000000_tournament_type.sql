-- supabase/migrations/20260619000000_tournament_type.sql

-- Tournament type classification
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS tournament_type text
  CHECK (tournament_type IN ('copa_do_mundo', 'champions_league'));

-- Podium positions (runner-up and third place)
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS runner_up_team_id uuid
  REFERENCES public.championship_teams(id) ON DELETE SET NULL;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS third_place_team_id uuid
  REFERENCES public.championship_teams(id) ON DELETE SET NULL;
