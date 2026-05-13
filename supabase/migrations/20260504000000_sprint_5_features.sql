-- =============================================================================
-- Migration 6: Sprint 5 Features
-- Adição de colunas e tabelas para assistências, substituições, escalação e final.
-- =============================================================================

BEGIN;

-- 1. match_events_v2: Adicionar colunas para assistência e substituição
ALTER TABLE public.match_events_v2 
  ADD COLUMN assist_player_id UUID REFERENCES public.championship_registrations(id) ON DELETE SET NULL,
  ADD COLUMN player_in_id UUID REFERENCES public.championship_registrations(id) ON DELETE SET NULL;

-- 2. match_lineups: Nova tabela para escalação e capitão
CREATE TABLE IF NOT EXISTS public.match_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knockout_match_id UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
  championship_team_id UUID NOT NULL REFERENCES public.championship_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.championship_registrations(id) ON DELETE CASCADE,
  is_starter BOOLEAN DEFAULT false,
  is_captain BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(knockout_match_id, player_id)
);

ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read match_lineups"
  ON public.match_lineups FOR SELECT USING (true);

CREATE POLICY "Auth write match_lineups"
  ON public.match_lineups FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. knockout_matches: Flag is_final
ALTER TABLE public.knockout_matches
  ADD COLUMN is_final BOOLEAN DEFAULT false;

-- 4. championships: champion_team_id
ALTER TABLE public.championships
  ADD COLUMN champion_team_id UUID REFERENCES public.championship_teams(id) ON DELETE SET NULL;

COMMIT;
