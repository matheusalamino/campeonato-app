BEGIN;

-- Create player_saves table to track goalkeeper saves
CREATE TABLE IF NOT EXISTS public.player_saves (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  championship_id  UUID        NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  registration_id  UUID        NOT NULL REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  is_penalty       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_player_saves_match ON public.player_saves(match_id);
CREATE INDEX IF NOT EXISTS idx_player_saves_championship ON public.player_saves(championship_id);
CREATE INDEX IF NOT EXISTS idx_player_saves_registration ON public.player_saves(registration_id);

-- Enable RLS (consistent with all other tables in this project)
ALTER TABLE public.player_saves ENABLE ROW LEVEL SECURITY;

-- Public player saves are viewable by everyone
CREATE POLICY "Public player saves are viewable by everyone"
  ON public.player_saves FOR SELECT
  USING (true);

-- Authenticated users can manage player saves
CREATE POLICY "Authenticated users can manage player saves"
  ON public.player_saves FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;
