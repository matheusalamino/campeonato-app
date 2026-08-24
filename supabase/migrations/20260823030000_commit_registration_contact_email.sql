-- =============================================================================
-- Migration: commit_registration passa a gravar o e-mail de contato, e a
--            inscricao passa a enfileirar e-mail
--
-- Duas coisas neste arquivo, e elas so andam juntas: a funcao que grava a
-- inscricao e o gatilho que reage a essa gravacao. Separa-las em duas
-- migrations criaria um intervalo em que uma inscricao entra na fila SEM
-- endereco para onde ir.
--
-- ── Isto e uma SUBSTITUICAO, e nao uma edicao ────────────────────────────────
--
-- Migration aplicada nao se edita: o arquivo INTEIRO fica gravado em
-- `supabase_migrations.schema_migrations.statements`, e um banco que ja rodou
-- 20260820040000 nunca releria aquele arquivo se ele mudasse. Por isso o corpo
-- da funcao aparece aqui de novo, por extenso.
--
-- O corpo veio COPIADO da versao vigente, e nao reescrito de memoria. A
-- diferenca importa: aquela versao carrega tres checagens que este arquivo nao
-- tem assunto para mexer -- a pausa de sabado, a janela de inscricao e a cota
-- de goleiro --, e reescrever de cabeca perde um ramo sem que nada quebre alto.
-- A UNICA mudanca no corpo e `contact_email`, no INSERT. Quem for conferir:
-- compare este bloco com o de 20260820040000 e nao deve achar mais nada.
--
-- ── CREATE OR REPLACE, sem DROP ──────────────────────────────────────────────
--
-- Ao contrario de 20260820040000, aqui NAO ha DROP antes. Aquela migration
-- precisava dele porque ACRESCENTAVA um sexto parametro, e `CREATE OR REPLACE`
-- com um parametro a mais nao substitui: cria uma SOBRECARGA, e a chamada
-- antiga passa a morrer com "function ... is not unique". Este arquivo nao mexe
-- na assinatura -- continuam os mesmos seis parametros --, entao o REPLACE
-- substitui a funcao no lugar.
--
-- Os REVOKE seguem obrigatorios mesmo assim, e repetem a assinatura de SEIS
-- parametros por extenso. Assinatura errada nao e erro: ela simplesmente NAO
-- ALCANCA esta funcao, e o resultado e uma funcao que grava inscricao ficar
-- executavel por `anon` via PostgREST sem ninguem notar.
--
-- ── Por que o e-mail entra no INSERT, e nao num UPDATE depois ────────────────
--
-- Duas razoes independentes, e cada uma sozinha ja decide:
--
--   A lista de colunas do INSERT e EXPLICITA. Acrescentar `contact_email` ao
--   jsonb `p_registration` do lado do TypeScript, sem acrescentar a coluna
--   aqui, NAO grava nada e NAO levanta erro -- o valor some no caminho. Este
--   repo ja perdeu trabalho para essa armadilha.
--
--   O gatilho que este arquivo cria dispara no AFTER INSERT. Um UPDATE logo
--   depois da RPC chegaria tarde: a linha da fila ja teria nascido, e nascido
--   apontando para uma inscricao sem endereco.
--
-- ── O gatilho: UM gatilho, DUAS linhas ───────────────────────────────────────
--
-- `enqueue_registration_emails` nao e um gatilho por mensagem. E um so, que
-- insere duas linhas: a confirmacao para quem se inscreveu e o aviso para a
-- organizacao. Sao dois destinatarios do MESMO acontecimento, e um acontecimento
-- so tem um momento.
--
-- A funcao nao sabe o que e um e-mail. Ela nao monta assunto, nao escolhe
-- remetente e nao le endereco: registra que uma inscricao foi gravada. Quem
-- decide em que mensagem isso vira e o TypeScript, no momento do envio -- e e
-- por isso que o payload leva IDENTIFICADOR e nao texto: o corpo montado na
-- hora do envio pega o dado ja corrigido, entao arrumar um nome e reenviar sai
-- certo, em vez de reenviar o erro congelado.
--
-- O `ON CONFLICT (kind, dedupe_key) DO NOTHING` existe porque um gatilho pode
-- disparar de novo -- num restore, numa reinsercao manual -- e sem ele a
-- segunda passagem derrubaria a transacao de quem esta gravando a inscricao.
-- Passar calado e o comportamento certo aqui: a fila ja tem o acontecimento.
--
-- O gatilho tambem nao distingue de ONDE veio a inscricao. Toda linha nova de
-- championship_registrations enfileira, inclusive a criada pelo admin, e nessas
-- `contact_email` fica nula. Quem enviar resolve o endereco na hora, a partir do
-- identificador -- que e o outro motivo de o payload nao carregar texto pronto.
--
-- Na data desta migration ainda nao existe quem drene a fila: as linhas nascem
-- `pending` e assim ficam ate o passo do envio chegar. Enfileirar sem drenar e
-- o estado correto aqui, e nao um defeito -- o que se ganha agora e que o
-- acontecimento passa a ser REGISTRADO, na mesma transacao da inscricao. Se a
-- inscricao for desfeita, a linha da fila e desfeita junto, e ninguem recebe
-- confirmacao de uma inscricao que nao existe.
-- =============================================================================
BEGIN;

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
    -- com `integer out of range` em vez de responder JSON, e hoje NADA o impede
    -- -- o CHECK `championships_capacity_nonneg` so exige nao-negativo, e o Zod
    -- do admin so tem `.min(0)`, sem teto nenhum. Medido nos dois lados.
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

  -- `contact_email` entra AQUI, na lista explicita de colunas, e nao num UPDATE
  -- depois da chamada. Duas razoes, e as duas mordem calado:
  --
  --   1. a lista e EXPLICITA -- acrescentar a chave ao jsonb `p_registration`
  --      sem acrescentar a coluna aqui nao grava nada, e nao levanta erro: o
  --      valor simplesmente some;
  --   2. o gatilho da fila de e-mail dispara no AFTER INSERT desta tabela. Se o
  --      endereco chegasse por um UPDATE posterior, a linha da fila ja teria
  --      nascido -- e nascido sem destino.
  INSERT INTO public.championship_registrations (
    championship_id, player_id, is_waitlist, is_goalkeeper,
    group_affiliation, shirt_size, invite_code, extra_tickets_count,
    tickets_total, profile_photo_link, payment_receipt_link,
    legal_authorization_link, pix_txid, contact_email
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
    NULLIF(p_registration->>'pix_txid', ''),
    NULLIF(p_registration->>'contact_email', '')
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
-- default privileges. Sem revogar, a funcao fica exposta via PostgREST -- e
-- esta grava inscricao. O chamador previsto e sempre server-side com
-- service-role. Repare na assinatura COMPLETA, de seis parametros: escrita com
-- cinco, cada linha abaixo apontaria para uma funcao que nao existe.
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
campeonato de 80 com 8 goleiros isso e falso justo quando mais importa.

p_registration ganhou a chave `contact_email`, e ela cai na coluna de mesmo nome
de championship_registrations. E o endereco digitado NESTA inscricao, que nao e
o mesmo que players.email: a submissao publica so grava identidade para CPF
novo, entao para quem ja tem cadastro o endereco de la pode estar velho.';


-- =============================================================================
-- O gatilho que enfileira
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_registration_emails()
RETURNS trigger AS $$
BEGIN
  -- Duas linhas, um acontecimento. `dedupe_key` e o id da inscricao nos dois
  -- casos, e e o `kind` que os separa -- por isso a unicidade da fila e o PAR
  -- (kind, dedupe_key), e nao a chave sozinha.
  INSERT INTO public.email_outbox (kind, dedupe_key, payload)
  VALUES
    ('registration_committed', NEW.id::text,
     jsonb_build_object('registration_id', NEW.id)),
    ('organizer_new_registration', NEW.id::text,
     jsonb_build_object('registration_id', NEW.id))
  ON CONFLICT (kind, dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enqueue_registration_emails
  ON public.championship_registrations;

CREATE TRIGGER trg_enqueue_registration_emails
  AFTER INSERT ON public.championship_registrations
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_registration_emails();

-- SECURITY DEFINER porque `email_outbox` tem RLS ligada e NENHUMA policy: sem o
-- definer, o INSERT do gatilho seria feito com o papel de quem gravou a
-- inscricao e seria negado. E, sendo definer, o REVOKE nominal vale pelo mesmo
-- motivo da tabela: `REVOKE ... FROM PUBLIC` sozinho nao tira o privilegio que
-- `anon` e `authenticated` recebem nominalmente por default privileges.
--
-- Funcao de gatilho nao e chamavel por PostgREST hoje, mas o EXECUTE aberto e
-- privilegio que ninguem precisa ter.
REVOKE ALL ON FUNCTION public.enqueue_registration_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_registration_emails() FROM anon, authenticated;

COMMENT ON FUNCTION public.enqueue_registration_emails() IS
'Enfileira, na MESMA transacao da inscricao, as duas linhas de email_outbox que
uma inscricao nova gera: a confirmacao de quem se inscreveu e o aviso da
organizacao. Nao monta mensagem nenhuma -- o payload leva o identificador da
inscricao, e o corpo e montado na hora do envio.';

COMMENT ON TRIGGER trg_enqueue_registration_emails
  ON public.championship_registrations IS
'AFTER INSERT, para a fila enxergar a linha ja gravada e com id. Rodar na mesma
transacao e a propriedade central: inscricao desfeita nao deixa e-mail para
tras.';

COMMIT;
