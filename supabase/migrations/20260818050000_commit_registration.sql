-- =============================================================================
-- Migration: commit_registration
-- Grava inscricao e autoavaliacoes na mesma transacao. Hoje as autoavaliacoes
-- sao inseridas com o erro descartado: se falham, a inscricao ja existe e as
-- seis habilidades somem em silencio.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.commit_registration(
  p_championship_id uuid,
  p_player_id uuid,
  p_cpf text,
  p_registration jsonb,
  p_skills jsonb
) RETURNS json AS $$
DECLARE
  v_status          text;
  v_max_players     int;
  v_max_waitlist    int;
  v_is_waitlist     boolean;
  v_had_reservation boolean;
  v_confirmed_main  int;
  v_confirmed_wait  int;
  v_registration_id uuid;
  v_skill           text;
  v_rating          int;
  v_total           int;
BEGIN
  SELECT status, max_players, max_waitlist_players
    INTO v_status, v_max_players, v_max_waitlist
    FROM public.championships
   WHERE id = p_championship_id AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'not_found');
  END IF;

  -- A reserva e a autorizacao, nao o status. O campeonato pode ter fechado por
  -- lotacao enquanto o jogador preenchia, e recusa-lo aqui seria recriar o
  -- proprio defeito que esta funcao existe para corrigir.
  SELECT is_waitlist INTO v_is_waitlist
    FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id
     AND cpf = p_cpf
     AND expires_at >= now();

  v_had_reservation := FOUND;

  IF NOT v_had_reservation THEN
    -- Reserva vencida: aceita se ainda houver vaga, recalculando a
    -- classificacao. So recusa se venceu E nao ha mais vaga.
    IF v_status <> 'subscribing' THEN
      RETURN json_build_object('success', false, 'reason', 'not_open');
    END IF;

    SELECT count(*) FILTER (WHERE NOT is_waitlist),
           count(*) FILTER (WHERE is_waitlist)
      INTO v_confirmed_main, v_confirmed_wait
      FROM public.championship_registrations
     WHERE championship_id = p_championship_id;

    IF v_max_players IS NULL OR v_confirmed_main < v_max_players THEN
      v_is_waitlist := false;
    ELSIF v_confirmed_wait < COALESCE(v_max_waitlist, 0) THEN
      v_is_waitlist := true;
    ELSE
      RETURN json_build_object('success', false, 'reason', 'reservation_expired');
    END IF;
  END IF;

  INSERT INTO public.championship_registrations (
    championship_id, player_id, is_waitlist,
    group_affiliation, shirt_size, invite_code, extra_tickets_count,
    tickets_total, profile_photo_link, payment_receipt_link,
    legal_authorization_link, pix_txid
  ) VALUES (
    p_championship_id, p_player_id, v_is_waitlist,
    p_registration->>'group_affiliation',
    p_registration->>'shirt_size',
    NULLIF(p_registration->>'invite_code', ''),
    COALESCE((p_registration->>'extra_tickets_count')::int, 0),
    (p_registration->>'tickets_total')::numeric,
    p_registration->>'profile_photo_link',
    NULLIF(p_registration->>'payment_receipt_link', ''),
    NULLIF(p_registration->>'legal_authorization_link', ''),
    NULLIF(p_registration->>'pix_txid', '')
  )
  RETURNING id INTO v_registration_id;

  -- Mesma transacao que o insert acima: se uma habilidade falhar, a inscricao
  -- inteira e desfeita, em vez de sobrar um jogador sem perfil.
  FOR v_skill, v_rating IN
    SELECT key, value::int FROM jsonb_each_text(p_skills)
  LOOP
    INSERT INTO public.self_evaluations (registration_id, skill, rating)
    VALUES (v_registration_id, v_skill, v_rating);
  END LOOP;

  DELETE FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id AND cpf = p_cpf;

  SELECT count(*) INTO v_total
    FROM public.championship_registrations
   WHERE championship_id = p_championship_id;

  IF v_status = 'subscribing'
     AND v_max_players IS NOT NULL
     AND v_total >= v_max_players + COALESCE(v_max_waitlist, 0) THEN
    UPDATE public.championships SET status = 'subscribed' WHERE id = p_championship_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'is_waitlist', v_is_waitlist
  );

EXCEPTION
  -- O indice unico (championship_id, player_id) e a trava real contra inscricao
  -- duplicada; aqui ela vira uma resposta em vez de um erro 500.
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'reason', 'already_registered');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- O schema public do Supabase concede EXECUTE a anon e authenticated por
-- default privileges. Sem revogar, a funcao fica exposta via PostgREST — e
-- esta grava inscricao. O chamador previsto e sempre server-side com
-- service-role. Mesmo padrao de 20260615000000_public_pages.sql.
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) FROM anon, authenticated;

COMMENT ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) IS
  'Grava inscricao e autoavaliacoes numa transacao, honrando a classificacao prometida pela reserva. Retorna {success:true, registration_id, is_waitlist} ou {success:false, reason} com reason em not_found | not_open | already_registered | reservation_expired.';

COMMIT;
