-- =============================================================================
-- Migration: o commit reconfere a cota de goleiro, e grava o balde
--
-- A reserva ja checa a cota (20260820030000). Isso nao basta: a reserva pode ter
-- VENCIDO entre o passo 1 e o envio, e o commit aceita de proposito quem chega
-- sem reserva viva, desde que ainda haja vaga. Ate aqui "vaga" olhava so a
-- lotacao do campeonato -- entao um goleiro cuja reserva venceu entrava POR CIMA
-- da cota, sem erro e sem rastro. E defesa em profundidade: a mesma forma que a
-- pausa de sabado ja usa nesta funcao.
--
-- ── A cota vai DENTRO do ramo da reserva, junto da janela ────────────────────
--
-- Esta funcao ja tinha duas checagens vizinhas com regras OPOSTAS. Agora sao
-- tres, em dois grupos:
--
--   sabado -> ANTES do ramo, incondicional. Aceitar significaria GRAVAR UMA
--             INSCRICAO DURANTE O SABADO, que e o que a pausa existe para nao
--             fazer.
--   prazo  -> DENTRO do `IF NOT v_had_reservation`.
--   cota   -> DENTRO tambem, ao lado do prazo.
--
-- A cota acompanha o PRAZO, e nao o sabado, e o motivo nao e gosto: quem tem
-- reserva viva de goleiro JA FOI CONTADO na cota quando reservou. Recusa-lo aqui
-- o barraria por uma vaga que ele mesmo esta ocupando -- de novo o "pagou e foi
-- recusado" que a reserva existe para prevenir, e agora no pior lugar possivel,
-- depois do formulario inteiro.
--
-- As duas regras convivem porque protegem coisas diferentes: a cota protege o
-- FORMATO do campeonato, e um time com um goleiro a mais se conserta depois; a
-- pausa protege uma OBSERVANCIA, e essa nao se conserta depois. Quem vier
-- "harmonizar" as tres por consistencia -- em qualquer um dos dois sentidos --
-- esta apagando a decisao. O par de cenarios de
-- scripts/test-registration-slots.sh e o que mantem a diferenca viva: um goleiro
-- SEM reserva e recusado, um goleiro COM reserva grava. Mover este bloco para
-- fora do ramo derruba so o segundo.
--
-- ── O balde e um BOOLEAN, e nunca uma palavra ────────────────────────────────
--
-- Nada aqui compara nada com o valor que representa goleiro em
-- `players.preferred_position`, e esta funcao nao le essa coluna. O criterio
-- chega pronto, ja reduzido a "e goleiro ou nao e", por tres caminhos:
--
--   1. `registration_slot_reservations.is_goalkeeper` (20260820020000), quando
--      ha reserva viva;
--   2. o argumento `p_is_goalkeeper`, quando nao ha;
--   3. `championship_registrations.is_goalkeeper` (20260820030000), que e o que
--      a contagem le -- e o que esta funcao passa a ESCREVER.
--
-- O cabecalho de 20260820030000 registra por extenso por que uma RPC que citasse
-- a grafia de hoje contaria ZERO goleiros em silencio depois de uma conversao de
-- vocabulario, e por que este repo ja pagou por isso uma vez. A regra que aquele
-- arquivo estabeleceu vale igual aqui, e por isso NENHUMA frase deste arquivo
-- cita grafia de posicao: migration aplicada nao se edita -- o arquivo INTEIRO
-- fica gravado em `supabase_migrations.schema_migrations.statements`, cabecalho
-- incluido --, e prosa que fixa o vocabulario de hoje vira registro falso
-- amanha. Aqui nao ha nem a excecao do backfill: 20260820030000 ja o fez.
--
-- ── A lacuna que esta migration fecha ────────────────────────────────────────
--
-- `championship_registrations.is_goalkeeper` nasceu em 20260820030000 com
-- backfill, e ate aqui NINGUEM a alimentava: inscricao nova confirmada nascia
-- `false` pelo DEFAULT, entao todo goleiro recem-confirmado contava como jogador
-- de linha e a cota SUBCONTAVA -- indefinidamente, e cada vez mais. A coluna so
-- vira dado vivo quando o commit a escreve, e e o que ele passa a fazer.
--
-- ── DROP antes do CREATE, e nao CREATE OR REPLACE ────────────────────────────
--
-- A funcao ganha um sexto parametro. `CREATE OR REPLACE FUNCTION` com um
-- parametro a mais NAO substitui a antiga: cria uma SOBRECARGA. Medido nesta
-- base, nesta funcao, antes de escrever isto -- `pg_proc` passa a ter DUAS
-- linhas com este nome, e a chamada de cinco argumentos morre com
-- `function commit_registration(...) is not unique`. Como a de cinco argumentos
-- e a que esta NO AR (`services/public-registration.ts`), esquecer o DROP
-- derrubaria o envio de toda inscricao.
--
-- O parametro nasce com DEFAULT justamente para essa chamada de cinco
-- argumentos continuar valendo enquanto o app nao passa o balde.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.commit_registration(uuid, uuid, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.commit_registration(
  p_championship_id uuid,
  p_player_id uuid,
  p_cpf text,
  p_registration jsonb,
  p_skills jsonb,
  -- O balde do jogador, ja decidido por quem chama. Boolean, e nao a posicao em
  -- texto, pelo motivo do cabecalho, e com a mesma forma do parametro irmao em
  -- reserve_registration_slot: a conversao posicao -> balde acontece UMA vez, no
  -- lado que ja e dono do vocabulario.
  --
  -- So e consultado por quem chega SEM reserva viva. Com reserva viva, o balde
  -- vem da RESERVA, e nao daqui -- ver o SELECT que le a reserva, la embaixo.
  --
  -- DEFAULT NULL, e nulo conta como LINHA, o balde mais largo: a chamada de
  -- cinco argumentos que esta no ar continua valendo, e um argumento faltando
  -- erra a favor de deixar o jogador entrar em vez de tranca-lo por uma
  -- informacao que ninguem lhe pediu.
  p_is_goalkeeper boolean DEFAULT NULL
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

  -- O formato, lido junto com o resto sob o mesmo lock.
  v_teams           int;
  v_per_team        int;
  v_gk_per_team     int;
  v_wait_gk         int;
  v_wait_out        int;

  -- O balde deste jogador e as cotas dele.
  v_is_gk           boolean;
  v_cap_total       int;
  v_cap_gk          int;
  v_cap_out         int;
  v_cap_main        int;
  v_cap_wait        int;
  v_quota_binds     boolean;

  -- As contagens do balde deste jogador (as sem sufixo contam o campeonato
  -- inteiro, e sao as mesmas de antes).
  v_confirmed_main_b int;
  v_confirmed_wait_b int;

  -- Se o CAMPEONATO tinha vaga, ignorando a cota. E o que separa "sua cota
  -- acabou" de "acabou para todo mundo".
  v_champ_main_room boolean;
  v_champ_wait_room boolean;
BEGIN
  -- As cinco colunas do formato entram NESTE select, e nao num segundo: um
  -- SELECT separado leria fora do lock, e dois commits simultaneos poderiam
  -- derivar cotas diferentes da mesma linha.
  SELECT status, max_players, max_waitlist_players,
         registration_start_date, registration_end_date,
         teams_count, players_per_team, goalkeepers_per_team,
         waitlist_goalkeepers, waitlist_outfield
    INTO v_status, v_max_players, v_max_waitlist,
         v_opens_at, v_closes_at,
         v_teams, v_per_team, v_gk_per_team,
         v_wait_gk, v_wait_out
    FROM public.championships
   WHERE id = p_championship_id AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'not_found');
  END IF;

  -- A pausa de sabado, ANTES do ramo da reserva e sem excecao — e aqui que esta
  -- funcao inverte a tolerancia que ela mesma concede ao prazo e a cota, algumas
  -- linhas abaixo.
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
  -- No topo, e nao logo antes do INSERT, tambem de proposito: daqui ela cobre
  -- TODA escrita ABAIXO dela, inclusive a que alguem acrescentar depois. Note o
  -- que isso NAO diz: ela nao cobre o que for posto ACIMA. Uma ESCRITA nova ali
  -- rodaria DURANTE O SABADO, e a suite passava verde -- medido por mutacao, nao
  -- suposto. Por isso o script assere a POSICAO ("a trava do sabado vem ANTES de
  -- qualquer escrita"), e nao so o efeito: e a unica coisa que pega isso. Um
  -- RETURN novo acima continua escapando, e nada o pega -- se voce vem inserir
  -- checagem nova nesta funcao, ponha DEPOIS deste bloco. O preco
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
  --
  -- O BALDE sai daqui junto com a classificacao, e pela mesma razao: os dois
  -- foram CONCEDIDOS na reserva, e sao o que a cota ja contou. Ler o balde do
  -- argumento quando ha reserva viva abriria um buraco silencioso -- reservar
  -- no balde largo e enviar no estreito gravaria um goleiro que a cota nunca
  -- contou, com a reserva de linha servindo de passe. A reserva diz em que balde
  -- a vaga foi dada; o argumento so vale para quem nao tem vaga dada.
  SELECT is_waitlist, is_goalkeeper
    INTO v_is_waitlist, v_is_gk
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

    -- Sem reserva nao ha balde concedido, entao o balde vem do argumento. Nulo
    -- cai na linha. A regra mora aqui, sozinha, e o resto da funcao le so
    -- `v_is_gk`.
    v_is_gk := coalesce(p_is_goalkeeper, false);

    -- As cotas, derivadas do formato -- mesma aritmetica de
    -- reserve_registration_slot e de features/championships/capacity.ts. A
    -- duplicacao e CONSCIENTE pelo motivo que 20260820030000 registra: a trava
    -- precisa valer no servidor, e o Postgres nao importa TypeScript. Herda dali
    -- a mesma divida conhecida, tambem: formato absurdo estoura a multiplicacao
    -- com `integer out of range` em vez de responder JSON, e quem o impede hoje
    -- e so o Zod do admin.
    --
    -- O `least` contra o total nao e defensividade vaga: cota por time maior que
    -- o time inteiro faria a cota de goleiro admitir MAIS goleiros do que o
    -- campeonato tem vaga.
    v_cap_total := coalesce(v_teams, 0) * coalesce(v_per_team, 0);
    v_cap_gk    := least(v_cap_total, coalesce(v_teams, 0) * coalesce(v_gk_per_team, 0));
    v_cap_out   := v_cap_total - v_cap_gk;

    -- A cota so morde quando o formato diz alguma coisa. Sem esta guarda,
    -- campeonato com o formato ainda nao preenchido derivaria cota ZERO nos dois
    -- baldes e recusaria TODO MUNDO -- inclusive quem tem `max_players` posto na
    -- mao e inscricao aberta hoje.
    v_quota_binds := v_cap_total > 0;

    IF v_is_gk THEN
      v_cap_main := v_cap_gk;
      v_cap_wait := coalesce(v_wait_gk, 0);
    ELSE
      v_cap_main := v_cap_out;
      v_cap_wait := coalesce(v_wait_out, 0);
    END IF;

    -- Duas contagens, quatro numeros: o campeonato inteiro (a trava antiga,
    -- intacta) e o balde deste jogador (a cota nova).
    --
    -- `cr.is_goalkeeper`, e nao um JOIN com `players`. Sao duas razoes, e as
    -- duas bastam sozinhas. A primeira e a do cabecalho: o JOIN citaria grafia
    -- de posicao, e uma conversao de vocabulario o faria contar zero em
    -- silencio. A segunda e independente de vocabulario: a vaga foi concedida
    -- para um BALDE, e ler a posicao do perfil deixaria quem a edita DEPOIS de
    -- inscrito mudar de balde retroativamente -- a cota passaria a contar 9 de 8
    -- sem ninguem ter se inscrito.
    --
    -- So inscricoes CONFIRMADAS entram na conta, sem as reservas vivas de
    -- terceiros. E a mesma escolha que a checagem de lotacao ao lado ja fazia, e
    -- e deliberada nos dois casos: quem chegou ate aqui esta enviando o
    -- formulario -- possivelmente com o PIX ja pago --, e ceder a vaga a uma
    -- reserva que pode nunca virar inscricao inverteria a prioridade. E tambem
    -- por isso a recusa daqui nao traz `retry_at`: nao ha nada vencendo para
    -- esperar, ao contrario da recusa da reserva.
    SELECT count(*) FILTER (WHERE NOT is_waitlist),
           count(*) FILTER (WHERE is_waitlist),
           count(*) FILTER (WHERE NOT is_waitlist AND is_goalkeeper = v_is_gk),
           count(*) FILTER (WHERE is_waitlist AND is_goalkeeper = v_is_gk)
      INTO v_confirmed_main, v_confirmed_wait, v_confirmed_main_b, v_confirmed_wait_b
      FROM public.championship_registrations
     WHERE championship_id = p_championship_id;

    -- O campeonato tem vaga? E a pergunta antiga, e ela continua valendo
    -- sozinha: a cota nova APERTA, nunca afrouxa.
    v_champ_main_room := v_max_players IS NULL OR v_confirmed_main < v_max_players;
    v_champ_wait_room := v_confirmed_wait < COALESCE(v_max_waitlist, 0);

    IF v_champ_main_room
       AND (NOT v_quota_binds OR v_confirmed_main_b < v_cap_main) THEN
      v_is_waitlist := false;

    ELSIF v_champ_wait_room
       AND (NOT v_quota_binds OR v_confirmed_wait_b < v_cap_wait) THEN
      v_is_waitlist := true;

    -- Razao propria para a cota, pelo mesmo motivo da funcao irma:
    -- `reservation_expired` diz "sua vaga expirou e as inscricoes lotaram", e
    -- num campeonato de 80 com 8 goleiros essa frase e falsa exatamente quando
    -- mais importa -- a cota de goleiro fecha com 72 vagas de linha abertas. A
    -- condicao e "o CAMPEONATO tinha vaga": se nem ele tinha, quem fechou a
    -- porta foi a lotacao, e a razao generica e a verdadeira.
    ELSIF v_is_gk AND (v_champ_main_room OR v_champ_wait_room) THEN
      RETURN json_build_object('success', false, 'reason', 'goalkeepers_full');

    ELSE
      RETURN json_build_object('success', false, 'reason', 'reservation_expired');
    END IF;
  END IF;

  INSERT INTO public.championship_registrations (
    championship_id, player_id, is_waitlist, is_goalkeeper,
    group_affiliation, shirt_size, invite_code, extra_tickets_count,
    tickets_total, profile_photo_link, payment_receipt_link,
    legal_authorization_link, pix_txid
  ) VALUES (
    p_championship_id, p_player_id, v_is_waitlist, v_is_gk,
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
-- default privileges. Sem revogar, a funcao fica exposta via PostgREST — e esta
-- grava inscricao. O chamador previsto e sempre server-side com service-role.
--
-- Aqui o revoke deixou de ser seguro extra e virou OBRIGATORIO: o DROP acima
-- apaga a funcao antiga com a ACL dela junto, e a nova nasce do zero, com os
-- default privileges do schema -- ou seja, executavel por anon. E REVOKE FROM
-- PUBLIC sozinho NAO fecha: ele so remove o grant via a pseudo-role PUBLIC, e
-- nao os grants nominais que anon/authenticated ja receberam. Sem as duas linhas
-- abaixo esta migration ABRIRIA o buraco que 20260818050000 fechou.
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb, boolean) FROM anon, authenticated;

COMMENT ON FUNCTION public.commit_registration(uuid, uuid, text, jsonb, jsonb, boolean) IS
'Grava inscricao e autoavaliacoes numa transacao, honrando a classificacao e o
balde prometidos pela reserva. So o cliente service-role deve chamar --
anon/authenticated nao tem EXECUTE.

p_is_goalkeeper e o BALDE, ja decidido por quem chama, e nao a posicao: a funcao
nunca compara com grafia de posicao nenhuma, e nao le o perfil do jogador. Nulo
(o default) conta como linha, o balde largo. So e consultado por quem chega SEM
reserva viva -- com reserva viva o balde vem da propria reserva, que e onde ele
foi concedido e contado.

O balde fica gravado em championship_registrations.is_goalkeeper, e e de la que
a cota conta -- nunca de um JOIN com players. Duas razoes: nao citar grafia de
posicao, e nao deixar quem edita a posicao no perfil depois de inscrito mudar de
balde retroativamente.

Tres checagens vizinhas, em dois grupos, e a diferenca e a decisao:

  A pausa de sabado (sabbath_windows, ou a regra conservadora quando a tabela
  nao alcanca o instante) e checada ANTES do ramo da reserva, sem excecao:
  aceitar significaria gravar uma inscricao durante o sabado, que e o que a
  pausa existe para nao fazer. Reserva viva NAO atravessa a pausa.

  A janela entre registration_start_date e registration_end_date (bordas
  inclusivas; data nula nao fecha nada) e a cota do balde so valem para quem
  chega SEM reserva viva. Quem reservou dentro do prazo e enviou depois e
  aceito de proposito, porque a reserva e a autorizacao e recusa-lo recriaria o
  "pagou e foi recusado" na correria de ultima hora -- a tolerancia se limita ao
  TTL, ja que reserve_registration_slot parou de renovar apos o prazo. E quem
  tem reserva viva de goleiro ja foi contado na cota quando reservou, entao
  recusa-lo aqui o barraria por uma vaga que ele mesmo ocupa. Reserva viva
  ATRAVESSA o prazo e a cota.

Na pratica a pausa raramente pega reserva viva: como reserve_registration_slot
checa o sabado acima do ramo de renovacao, o heartbeat para de renovar no por
do sol e o que sobra expira em ate um TTL -- quem reservou 17h e termina o
formulario 17h50 chega aqui SEM reserva viva. A trava incondicional cobre o
resto: envio dentro do TTL, e chamada direta a server action.

A cota, quando morde, e a mesma de reserve_registration_slot: quatro baldes
(goleiro/linha x principal/espera) derivados do formato, e so vale quando o
formato esta preenchido. Ela sempre APERTA, nunca afrouxa a lotacao. A conta
aqui olha so inscricoes CONFIRMADAS, sem as reservas vivas de terceiros -- ao
contrario da conta da reserva --, porque quem chegou ao envio nao deve ceder
vaga a uma reserva que pode nunca virar inscricao. E por isso a recusa daqui nao
traz retry_at: nao ha nada vencendo para esperar.

Retorna {success:true, registration_id, is_waitlist} ou {success:false, reason}
com reason em not_found | sabbath | not_open | already_registered |
goalkeepers_full | reservation_expired.

goalkeepers_full sai quando a cota de goleiro acabou e o CAMPEONATO ainda tinha
vaga -- ou seja, ha vaga de linha aberta e nao ha de goleiro. Nao e
reservation_expired porque aquela frase promete "as inscricoes lotaram", e num
campeonato de 80 com 8 goleiros isso e falso justo quando mais importa.';

COMMIT;
