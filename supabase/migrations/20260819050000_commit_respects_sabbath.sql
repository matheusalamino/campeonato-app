-- =============================================================================
-- Migration: commit_registration respeita a pausa de sabado, sem excecao
--
-- Esta funcao passa a ter DUAS checagens vizinhas com regras OPOSTAS, e isso e
-- deliberado:
--
--   prazo  -> dentro do IF NOT v_had_reservation. Quem reservou dentro do prazo
--             e enviou depois passa, porque a reserva e a autorizacao.
--   sabado -> antes do ramo da reserva, incondicional. Aceitar aqui seria
--             GRAVAR UMA INSCRICAO DURANTE O SABADO, que e exatamente o que a
--             pausa existe para nao fazer.
--
-- CREATE OR REPLACE sobre a funcao de 20260819020000, que nao pode ser editada
-- porque ja esta em revisao noutra PR.
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
  v_opens_at        timestamptz;
  v_closes_at       timestamptz;
BEGIN
  SELECT status, max_players, max_waitlist_players,
         registration_start_date, registration_end_date
    INTO v_status, v_max_players, v_max_waitlist,
         v_opens_at, v_closes_at
    FROM public.championships
   WHERE id = p_championship_id AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'not_found');
  END IF;

  -- A pausa de sabado, ANTES do ramo da reserva e sem excecao — e aqui que esta
  -- funcao inverte a tolerancia que ela mesma concede ao prazo, algumas linhas
  -- abaixo.
  --
  -- La, aceitar quem reservou dentro do prazo evita o "pagou e foi recusado" na
  -- correria de ultima hora. Aqui, aceitar significaria GRAVAR UMA INSCRICAO
  -- DURANTE O SABADO, que e exatamente o que a pausa existe para nao fazer. A
  -- observancia nao abre excecao, e quem e pego no meio perde a reserva — mas
  -- 24h de pausa tornariam isso inevitavel de qualquer jeito.
  --
  -- Se voce estiver movendo esta checagem para dentro do IF NOT v_had_reservation
  -- "por consistencia": nao. E a inconsistencia que e a decisao.
  --
  -- No topo, e nao logo antes do INSERT, tambem de proposito: assim nenhum
  -- RETURN futuro acrescentado acima dela escapa da pausa por descuido. O preco
  -- e uma divergencia de precedencia com reserve_registration_slot, onde
  -- not_open ganha de sabbath -- aqui, quem chega sem reserva num campeonato
  -- encerrado durante a pausa ouve `sabbath`, nao `not_open`. Aceito de
  -- proposito: numa trava de observancia, falhar fechado cedo vale mais do que
  -- casar a ordem com a funcao irma, e o commit so e alcancado no fim do wizard
  -- -- a pagina ja disse "encerrado" antes disso.
  IF public.is_sabbath(now()) THEN
    RETURN json_build_object('success', false, 'reason', 'sabbath');
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

    -- A janela so vale para quem NAO tem reserva viva. Quem reservou antes do
    -- prazo e enviou depois esta coberto de proposito: a reserva e a
    -- autorizacao, e recusa-lo aqui recriaria o "pagou e foi recusado" na
    -- correria de ultima hora. A tolerancia se limita ao TTL, porque a RPC de
    -- reserva parou de renovar quando o prazo virou.
    IF (v_opens_at IS NOT NULL AND now() < v_opens_at)
       OR (v_closes_at IS NOT NULL AND now() > v_closes_at) THEN
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
--
-- Repetido aqui, e nao herdado de 20260819020000: CREATE OR REPLACE preserva a
-- ACL de uma funcao que ja existe, mas se este arquivo rodar sem que aquele
-- tenha criado a funcao antes — baseline squashada, drop manual, reordenacao —
-- ele a cria do zero, e ela nasce executavel por anon.
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) FROM anon, authenticated;

COMMENT ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb) IS
'Grava inscricao e autoavaliacoes numa transacao, honrando a classificacao prometida pela reserva. So o cliente service-role deve chamar -- anon/authenticated nao tem EXECUTE.

Duas checagens vizinhas com regras OPOSTAS, e a diferenca e a decisao:

  A pausa de sabado (sabbath_windows, ou a regra conservadora quando a tabela
  nao alcanca o instante) e checada ANTES do ramo da reserva, sem excecao:
  aceitar significaria gravar uma inscricao durante o sabado, que e o que a
  pausa existe para nao fazer. Reserva viva NAO atravessa a pausa.

  A janela entre registration_start_date e registration_end_date (bordas
  inclusivas; data nula nao fecha nada) so e checada para quem chega SEM
  reserva viva: quem reservou dentro do prazo e enviou depois e aceito de
  proposito, porque a reserva e a autorizacao e recusa-lo recriaria o "pagou e
  foi recusado" na correria de ultima hora -- a tolerancia se limita ao TTL, ja
  que reserve_registration_slot parou de renovar apos o prazo. Reserva viva
  ATRAVESSA o prazo.

Na pratica a pausa raramente pega reserva viva: como reserve_registration_slot
checa o sabado acima do ramo de renovacao, o heartbeat para de renovar no por
do sol e o que sobra expira em ate um TTL -- quem reservou 17h e termina o
formulario 17h50 chega aqui SEM reserva viva. A trava incondicional cobre o
resto: envio dentro do TTL, e chamada direta a server action.

Retorna {success:true, registration_id, is_waitlist} ou {success:false, reason}
com reason em not_found | sabbath | not_open | already_registered |
reservation_expired.';

COMMIT;
