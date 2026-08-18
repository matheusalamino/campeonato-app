-- =============================================================================
-- Migration: reserve_registration_slot
-- Trava a linha do campeonato para contar e classificar sem que outra
-- transacao insira no meio. Nao ha constraint que expresse "no maximo N
-- linhas", entao o lock tem que ser numa linha que existe.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_registration_slot(
  p_championship_id uuid,
  p_cpf text
) RETURNS json AS $$
DECLARE
  v_ttl               constant interval := interval '15 minutes';
  v_status            text;
  v_max_players       int;
  v_max_waitlist      int;
  v_expires           timestamptz;
  v_existing_waitlist boolean;
  v_confirmed_main    int;
  v_confirmed_wait    int;
  v_reserved_main     int;
  v_reserved_wait     int;
  v_is_waitlist       boolean;
  v_retry_at          timestamptz;
BEGIN
  SELECT status, max_players, max_waitlist_players
    INTO v_status, v_max_players, v_max_waitlist
    FROM public.championships
   WHERE id = p_championship_id AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF v_status <> 'subscribing' THEN
    RETURN json_build_object('success', false, 'reason', 'not_open');
  END IF;

  -- Antes de tudo: quem ja esta inscrito tomaria uma vaga que nunca vai usar, e
  -- ela so voltaria quinze minutos depois. E ele merece saber no primeiro passo,
  -- nao depois de preencher o formulario inteiro.
  IF EXISTS (
    SELECT 1
      FROM public.championship_registrations cr
      JOIN public.players p ON p.id = cr.player_id
     WHERE cr.championship_id = p_championship_id
       AND p.cpf = p_cpf
  ) THEN
    RETURN json_build_object('success', false, 'reason', 'already_registered');
  END IF;

  -- Poda oportunista, mesmo padrao que checkLookupRateLimit ja usa: mantem a
  -- tabela limitada sem depender de cron.
  DELETE FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id
     AND expires_at < now();

  v_expires := now() + v_ttl;

  -- Reserva viva do mesmo CPF: renova e devolve a MESMA classificacao. E isso
  -- que faz recarregar a pagina nao vazar uma segunda vaga.
  SELECT is_waitlist INTO v_existing_waitlist
    FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id AND cpf = p_cpf;

  IF FOUND THEN
    UPDATE public.registration_slot_reservations
       SET expires_at = v_expires
     WHERE championship_id = p_championship_id AND cpf = p_cpf;

    RETURN json_build_object(
      'success', true, 'is_waitlist', v_existing_waitlist, 'expires_at', v_expires
    );
  END IF;

  SELECT count(*) FILTER (WHERE NOT is_waitlist),
         count(*) FILTER (WHERE is_waitlist)
    INTO v_confirmed_main, v_confirmed_wait
    FROM public.championship_registrations
   WHERE championship_id = p_championship_id;

  SELECT count(*) FILTER (WHERE NOT is_waitlist),
         count(*) FILTER (WHERE is_waitlist)
    INTO v_reserved_main, v_reserved_wait
    FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id;

  IF v_max_players IS NULL
     OR (v_confirmed_main + v_reserved_main) < v_max_players THEN
    v_is_waitlist := false;

  ELSIF (v_confirmed_wait + v_reserved_wait) < COALESCE(v_max_waitlist, 0) THEN
    v_is_waitlist := true;

  ELSE
    -- "Cheio de verdade" e "cheio por reservas" significam coisas diferentes
    -- para o jogador: no segundo caso vale voltar, porque reserva vence.
    IF v_confirmed_main >= v_max_players
       AND v_confirmed_wait >= COALESCE(v_max_waitlist, 0) THEN
      RETURN json_build_object('success', false, 'reason', 'full');
    END IF;

    SELECT min(expires_at) INTO v_retry_at
      FROM public.registration_slot_reservations
     WHERE championship_id = p_championship_id;

    RETURN json_build_object(
      'success', false, 'reason', 'all_reserved', 'retry_at', v_retry_at
    );
  END IF;

  INSERT INTO public.registration_slot_reservations
    (championship_id, cpf, is_waitlist, expires_at)
  VALUES
    (p_championship_id, p_cpf, v_is_waitlist, v_expires);

  RETURN json_build_object(
    'success', true, 'is_waitlist', v_is_waitlist, 'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
