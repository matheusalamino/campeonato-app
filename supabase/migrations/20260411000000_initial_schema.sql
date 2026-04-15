-- =============================================================================
-- Migration: Initial Schema — Copa do Mundo Sorocaba 2026
-- Baseline snapshot of the database before draft-specific tables.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Custom enum types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.match_stage AS ENUM ('GROUP', 'PLAYIN', 'SEMIFINAL', 'FINAL', 'THIRD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.event_type AS ENUM ('GOAL', 'ASSIST', 'YELLOW', 'RED', 'SAVE', 'PENALTY_SAVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- profiles (linked to auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'viewer'::text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  preferred_position text,
  created_at timestamp without time zone DEFAULT now(),
  official_name text,
  cpf text,
  email text,
  whatsapp text,
  birth_date date,
  instagram text,
  height numeric,
  weight numeric,
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_cpf_key UNIQUE (cpf)
);

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_id uuid,
  logo_url text,
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- managers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf text,
  email text,
  photo_url text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT managers_pkey PRIMARY KEY (id),
  CONSTRAINT managers_cpf_key UNIQUE (cpf)
);

-- ---------------------------------------------------------------------------
-- championships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.championships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season text,
  status text DEFAULT 'draft'::text,
  created_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp without time zone,
  CONSTRAINT championships_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- championship_managers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.championship_managers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  championship_id uuid NOT NULL,
  inspirational_phrase text,
  team_id uuid,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT championship_managers_pkey PRIMARY KEY (id),
  CONSTRAINT fk_manager FOREIGN KEY (manager_id) REFERENCES public.managers(id),
  CONSTRAINT fk_championship FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT fk_team FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

-- ---------------------------------------------------------------------------
-- championship_teams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.championship_teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  team_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT championship_teams_pkey PRIMARY KEY (id),
  CONSTRAINT championship_teams_championship_id_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT championship_teams_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

-- ---------------------------------------------------------------------------
-- championship_registrations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.championship_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid,
  player_id uuid,
  final_overall numeric,
  created_at timestamp without time zone DEFAULT now(),
  legal_authorization_link text,
  profile_photo_link text,
  CONSTRAINT championship_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT championship_registrations_championship_id_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT championship_registrations_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES public.players(id)
);

-- ---------------------------------------------------------------------------
-- championship_team_players
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.championship_team_players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_team_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT championship_team_players_pkey PRIMARY KEY (id),
  CONSTRAINT championship_team_players_championship_team_id_fkey
    FOREIGN KEY (championship_team_id) REFERENCES public.championship_teams(id),
  CONSTRAINT championship_team_players_registration_id_fkey
    FOREIGN KEY (registration_id) REFERENCES public.championship_registrations(id)
);

-- ---------------------------------------------------------------------------
-- phases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid,
  name text NOT NULL,
  type text NOT NULL,
  order_number integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  abbreviation text,
  is_home_away boolean DEFAULT false,
  CONSTRAINT phases_pkey PRIMARY KEY (id),
  CONSTRAINT phases_championship_id_fkey
    FOREIGN KEY (championship_id) REFERENCES public.championships(id)
);

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  name text NOT NULL,
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- phase_group_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phase_group_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  teams_per_group integer,
  round_type text,
  matches_per_pair integer DEFAULT 1,
  number_of_groups integer,
  CONSTRAINT phase_group_settings_pkey PRIMARY KEY (id),
  CONSTRAINT phase_group_settings_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- phase_knockout_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phase_knockout_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  number_of_matches integer NOT NULL,
  is_home_away boolean DEFAULT false,
  auto_fill boolean DEFAULT false,
  source_phase_id uuid,
  CONSTRAINT phase_knockout_settings_pkey PRIMARY KEY (id),
  CONSTRAINT phase_knockout_settings_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- phase_advancement_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phase_advancement_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  position integer NOT NULL,
  advances_to_phase_id uuid,
  target_slot text,
  CONSTRAINT phase_advancement_rules_pkey PRIMARY KEY (id),
  CONSTRAINT phase_advancement_rules_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id),
  CONSTRAINT phase_advancement_rules_advances_to_phase_id_fkey
    FOREIGN KEY (advances_to_phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- tie_breaker_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tie_breaker_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  rule text NOT NULL,
  priority integer NOT NULL,
  CONSTRAINT tie_breaker_rules_pkey PRIMARY KEY (id),
  CONSTRAINT tie_breaker_rules_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- knockout_matches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knockout_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phase_id uuid,
  name text,
  round_number integer,
  home_source text,
  away_source text,
  winner_to text,
  loser_to text,
  code text,
  group_label text,
  CONSTRAINT knockout_matches_pkey PRIMARY KEY (id),
  CONSTRAINT knockout_matches_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id)
);

-- ---------------------------------------------------------------------------
-- knockout_match_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knockout_match_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  knockout_match_id uuid,
  source_type text NOT NULL,
  source_phase_id uuid,
  source_group text,
  source_position integer,
  source_match_code text,
  is_home boolean NOT NULL,
  slot_order integer NOT NULL,
  CONSTRAINT knockout_match_sources_pkey PRIMARY KEY (id),
  CONSTRAINT knockout_match_sources_knockout_match_id_fkey
    FOREIGN KEY (knockout_match_id) REFERENCES public.knockout_matches(id)
);

-- ---------------------------------------------------------------------------
-- match_slots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  slot_order integer NOT NULL,
  label text,
  championship_team_id uuid,
  CONSTRAINT match_slots_pkey PRIMARY KEY (id),
  CONSTRAINT match_slots_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.knockout_matches(id),
  CONSTRAINT match_slots_team_fkey
    FOREIGN KEY (championship_team_id) REFERENCES public.championship_teams(id)
);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid,
  home_team_id uuid,
  away_team_id uuid,
  stage public.match_stage,
  group_id uuid,
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,
  status text DEFAULT 'NOT_STARTED'::text,
  allow_penalties boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_home_team_id_fkey
    FOREIGN KEY (home_team_id) REFERENCES public.championship_teams(id),
  CONSTRAINT matches_away_team_id_fkey
    FOREIGN KEY (away_team_id) REFERENCES public.championship_teams(id)
);

-- ---------------------------------------------------------------------------
-- match_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid,
  player_id uuid,
  team_id uuid,
  type public.event_type,
  CONSTRAINT match_events_pkey PRIMARY KEY (id),
  CONSTRAINT match_events_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id),
  CONSTRAINT match_events_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.championship_teams(id)
);

-- ---------------------------------------------------------------------------
-- penalties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.penalties (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid,
  team_id uuid,
  scored boolean,
  CONSTRAINT penalties_pkey PRIMARY KEY (id),
  CONSTRAINT penalties_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id),
  CONSTRAINT penalties_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES public.championship_teams(id)
);

-- ---------------------------------------------------------------------------
-- self_evaluations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.self_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registration_id uuid,
  skill text NOT NULL,
  rating integer NOT NULL,
  CONSTRAINT self_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT self_evaluations_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT self_evaluations_registration_id_fkey
    FOREIGN KEY (registration_id) REFERENCES public.championship_registrations(id)
);

-- ---------------------------------------------------------------------------
-- organizer_evaluations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizer_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  registration_id uuid,
  organizer_id uuid,
  skill text NOT NULL,
  rating integer NOT NULL,
  CONSTRAINT organizer_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT organizer_evaluations_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT organizer_evaluations_registration_id_fkey
    FOREIGN KEY (registration_id) REFERENCES public.championship_registrations(id)
);

-- ---------------------------------------------------------------------------
-- draft_pots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draft_pots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL,
  player_id uuid NOT NULL,
  position text NOT NULL,
  pot_number integer NOT NULL,
  pot_order integer NOT NULL,
  max_managers integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT draft_pots_pkey PRIMARY KEY (id),
  CONSTRAINT fk_championship FOREIGN KEY (championship_id) REFERENCES public.championships(id),
  CONSTRAINT fk_player FOREIGN KEY (player_id) REFERENCES public.players(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_player_pot
  ON public.draft_pots (championship_id, player_id);

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_pots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON public.championships FOR SELECT USING (true);
CREATE POLICY "public read" ON public.championship_managers FOR SELECT USING (true);
CREATE POLICY "public read" ON public.championship_teams FOR SELECT USING (true);
CREATE POLICY "public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "public read" ON public.managers FOR SELECT USING (true);

CREATE POLICY "Allow select draft pots" ON public.draft_pots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert draft pots" ON public.draft_pots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow delete draft pots" ON public.draft_pots FOR DELETE TO authenticated USING (true);

COMMIT;
