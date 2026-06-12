ALTER TABLE public.knockout_matches
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_knockout_matches_phase_scheduled_at
ON public.knockout_matches (phase_id, scheduled_at);
