-- =============================================================================
-- Migration: reserve_registration_slot respeita a pausa de sabado
-- A tela de repouso sozinha nao tranca nada -- reserveSlotAction e uma server
-- action, chamavel direto. Aqui a pausa vira regra do banco, com razao propria
-- `sabbath`, e nao mais um `not_open` generico.
-- CREATE OR REPLACE sobre a funcao de 20260819010000, que nao pode ser editada
-- porque ja esta em revisao noutra PR.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_registration_slot(
  p_championship_id uuid,
  p_cpf text
) RETURNS json AS $$
DECLARE
  -- Mexeu aqui, mexa em IDLE_BUDGET_MS de features/registration/slot-keepalive.ts:
  -- o orcamento de inatividade do heartbeat espelha este valor, e junto com ele
  -- forma o teto de tempo que uma aba abandonada segura a vaga (orcamento +
  -- TTL). Nada em TS le este numero, entao mudar so um lado passa despercebido.
  v_ttl               constant interval := interval '15 minutes';
  v_status            text;
  v_max_players       int;
  v_max_waitlist      int;
  v_opens_at          timestamptz;
  v_closes_at         timestamptz;
  v_expires           timestamptz;
  v_existing_waitlist boolean;
  v_confirmed_main    int;
  v_confirmed_wait    int;
  v_reserved_main     int;
  v_reserved_wait     int;
  v_is_waitlist       boolean;
  v_retry_at          timestamptz;
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

  IF v_status <> 'subscribing' THEN
    RETURN json_build_object('success', false, 'reason', 'not_open');
  END IF;

  -- A janela de inscricao fecha a porta de verdade. A tela sozinha nao bastaria:
  -- a server action e chamavel direto.
  --
  -- Fechar aqui tambem e o que faz a tolerancia do commit morrer sozinha: sem
  -- conceder nem renovar reserva, o heartbeat do wizard para de esticar prazo e
  -- o que sobra expira em no maximo um TTL.
  --
  -- Data nula nao e borda: campeonato sem data configurada se comporta como
  -- antes do A5, em vez de trancar todo mundo do lado de fora.
  IF (v_opens_at IS NOT NULL AND now() < v_opens_at)
     OR (v_closes_at IS NOT NULL AND now() > v_closes_at) THEN
    RETURN json_build_object('success', false, 'reason', 'not_open');
  END IF;

  -- A pausa de sabado, do por do sol de sexta ao de sabado. Observancia
  -- religiosa da comunidade, nao configuracao de campeonato -- por isso
  -- is_sabbath nao recebe p_championship_id.
  --
  -- Razao propria, e nao not_open: a faixa do wizard renderiza not_open como
  -- "as inscricoes nao estao abertas", que num sabado e justo a frase vaga que
  -- a tela de repouso existe para substituir.
  --
  -- DEPOIS de status e janela, e ANTES de already_registered, e a ordem importa
  -- nas duas pontas:
  --
  --   Depois da janela porque `sabbath` promete "volte apos o por do sol", e
  --   essa promessa seria mentira num campeonato encerrado ou fora do status --
  --   voltar no domingo nao abriria porta nenhuma. Quando os dois valem, o
  --   motivo terminal ganha do temporario.
  --
  --   Antes de already_registered porque durante a pausa o fluxo de inscricao
  --   da UMA resposta so, a mesma que a tela de repouso da a todo mundo, sem
  --   antes consultar quem a pessoa e. E o que mantem a server action e a
  --   pagina dizendo a mesma coisa -- que e a razao desta trava existir. Custa
  --   uma viagem a toa a quem ja esta inscrito e insiste num sabado; na duvida
  --   entre pausar a mais e pausar a menos, este projeto pausa a mais.
  IF public.is_sabbath(now()) THEN
    RETURN json_build_object('success', false, 'reason', 'sabbath');
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

-- O schema public concede EXECUTE a anon/authenticated por default privileges
-- no momento da criacao da funcao -- REVOKE FROM PUBLIC sozinho nao basta,
-- porque isso so remove o grant via a pseudo-role PUBLIC, nao os grants
-- explicitos que anon/authenticated ja recebem. So o cliente service-role
-- (createAdminClient() em services/public-registration.ts) deve chamar isto;
-- sem o revoke por nome, qualquer um na internet forja CPFs via PostgREST e
-- esgota max_players/max_waitlist com reservas falsas.
--
-- Repetido aqui, e nao herdado de 20260818040000: CREATE OR REPLACE preserva a
-- ACL de uma funcao que ja existe, mas se este arquivo rodar sem que aquele
-- tenha criado a funcao antes -- baseline squashada, drop manual, reordenacao
-- -- ele a cria do zero, e ela nasce executavel por anon. Idempotente e de
-- graca; a alternativa e reabrir um incidente que ja aconteceu uma vez.
REVOKE ALL ON FUNCTION public.reserve_registration_slot(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_registration_slot(uuid, text) FROM anon, authenticated;

COMMENT ON FUNCTION public.reserve_registration_slot(uuid, text) IS
'Reserva a vaga do jogador (por CPF) sob lock da linha do campeonato. So o
cliente service-role deve chamar -- anon/authenticated nao tem EXECUTE.

Retorno tem seis formatos:
  success=true -> {success, is_waitlist, expires_at}: vaga reservada ou
    renovada (principal ou espera).
  success=false, reason=not_found: campeonato inexistente ou apagado.
  success=false, reason=not_open: campeonato fora do status subscribing, ou
    fora da janela entre registration_start_date e registration_end_date
    (bordas inclusivas; data nula nao fecha nada).
  success=false, reason=sabbath: e sabado -- do por do sol de sexta ao de
    sabado, pela tabela sabbath_windows ou pela regra conservadora quando ela
    nao alcanca o instante. Sem excecao para quem ja tem reserva.
  success=false, reason=already_registered: CPF ja tem inscricao gravada;
    checado antes da poda e da contagem, para nao gastar vaga a toa.
  success=false, reason=full: lotacao real -- principal e espera cheios por
    inscricoes confirmadas. Nao adianta tentar de novo.
  success=false, reason=all_reserved, retry_at=<timestamptz|null>: vagas
    seguradas por reservas vivas, que vencem. Vale tentar de novo a partir
    de retry_at.

A ordem da lista e a ordem das checagens, e nao e enfeite: not_open ganha de
sabbath porque "volte apos o por do sol" seria mentira num campeonato
encerrado, e sabbath ganha de already_registered porque durante a pausa o
fluxo responde a mesma coisa a todo mundo, sem antes olhar quem e.';

COMMIT;
