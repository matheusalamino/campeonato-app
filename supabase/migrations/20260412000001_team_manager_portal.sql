-- =============================================================================
-- Migration: Team Manager Portal
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1a. Link managers to auth users
-- ---------------------------------------------------------------------------
ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id);

-- ---------------------------------------------------------------------------
-- 1b. Player favorites table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.draft_player_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_manager_id uuid NOT NULL REFERENCES public.championship_managers(id),
  registration_id uuid NOT NULL REFERENCES public.championship_registrations(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (championship_manager_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_dpf_cm
  ON public.draft_player_favorites (championship_manager_id);

-- ---------------------------------------------------------------------------
-- 1c. Atomic special card activation RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_special_card(
  p_championship_id uuid,
  p_cm_id uuid,
  p_pot_number integer,
  p_pot_position text,
  p_target_registration_id uuid
) RETURNS json AS $$
DECLARE
  v_already_used boolean;
  v_player_card_exists boolean;
  v_new_id uuid;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM draft_special_card_uses
    WHERE championship_id = p_championship_id
      AND activated_by_cm_id = p_cm_id
    FOR UPDATE
  ) INTO v_already_used;

  IF v_already_used THEN
    RETURN json_build_object('success', false, 'reason', 'card_already_used');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM draft_special_card_uses
    WHERE championship_id = p_championship_id
      AND target_registration_id = p_target_registration_id
    FOR UPDATE
  ) INTO v_player_card_exists;

  IF v_player_card_exists THEN
    RETURN json_build_object('success', false, 'reason', 'player_already_has_card');
  END IF;

  INSERT INTO draft_special_card_uses (
    championship_id, activated_by_cm_id, pot_number,
    pot_position, target_registration_id, result
  ) VALUES (
    p_championship_id, p_cm_id, p_pot_number,
    p_pot_position, p_target_registration_id, 'purchased'
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'id', v_new_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'reason', 'card_already_used');
END;
$$ LANGUAGE plpgsql;

COMMIT;
