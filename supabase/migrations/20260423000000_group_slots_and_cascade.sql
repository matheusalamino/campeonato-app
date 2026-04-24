-- =============================================================================
-- Migration: group_slots + ON DELETE CASCADE em todas as FKs de phases
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nova tabela: group_slots
--    Representa a posição estrutural de um time num grupo (A1, A2, A3...).
--    É a fonte da verdade para atribuição de times em fases de grupo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.group_slots (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  phase_id             uuid        NOT NULL,
  group_letter         text        NOT NULL,   -- 'A', 'B', 'C'...
  position             integer     NOT NULL,   -- 1, 2, 3, 4...
  label                text        NOT NULL,   -- 'A1', 'A2', 'B3'...
  championship_team_id uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT group_slots_pkey PRIMARY KEY (id),
  CONSTRAINT group_slots_unique UNIQUE (phase_id, label),

  CONSTRAINT group_slots_phase_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE,

  CONSTRAINT group_slots_team_fkey
    FOREIGN KEY (championship_team_id) REFERENCES public.championship_teams(id)
);

CREATE INDEX idx_group_slots_phase ON public.group_slots (phase_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ON DELETE CASCADE nas FKs que hoje bloqueiam remoção de phases
-- ─────────────────────────────────────────────────────────────────────────────

-- phase_group_settings
ALTER TABLE public.phase_group_settings
  DROP CONSTRAINT IF EXISTS phase_group_settings_phase_id_fkey;
ALTER TABLE public.phase_group_settings
  ADD CONSTRAINT phase_group_settings_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;

-- phase_knockout_settings
ALTER TABLE public.phase_knockout_settings
  DROP CONSTRAINT IF EXISTS phase_knockout_settings_phase_id_fkey;
ALTER TABLE public.phase_knockout_settings
  ADD CONSTRAINT phase_knockout_settings_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;

-- groups
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_phase_id_fkey;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;

-- knockout_matches
ALTER TABLE public.knockout_matches
  DROP CONSTRAINT IF EXISTS knockout_matches_phase_id_fkey;
ALTER TABLE public.knockout_matches
  ADD CONSTRAINT knockout_matches_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;

-- match_slots → knockout_matches cascade
ALTER TABLE public.match_slots
  DROP CONSTRAINT IF EXISTS match_slots_match_id_fkey;
ALTER TABLE public.match_slots
  ADD CONSTRAINT match_slots_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.knockout_matches(id) ON DELETE CASCADE;

-- knockout_match_sources → knockout_matches cascade
ALTER TABLE public.knockout_match_sources
  DROP CONSTRAINT IF EXISTS knockout_match_sources_knockout_match_id_fkey;
ALTER TABLE public.knockout_match_sources
  ADD CONSTRAINT knockout_match_sources_knockout_match_id_fkey
    FOREIGN KEY (knockout_match_id) REFERENCES public.knockout_matches(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS para group_slots (segue padrão do projeto — public read, auth write)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.group_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read group_slots"
  ON public.group_slots FOR SELECT USING (true);

CREATE POLICY "auth write group_slots"
  ON public.group_slots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;
