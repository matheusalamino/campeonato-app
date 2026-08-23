-- =============================================================================
-- Migration: a reserva passa a respeitar a cota de goleiro
--
-- Ate aqui a trava contava DUAS coisas -- principal e espera -- e a posicao nao
-- entrava na conta. Um campeonato de 8 times com 1 goleiro cada aceitaria 80
-- goleiros e nenhum jogador de linha, e nada no banco reclamaria. Agora sao
-- QUATRO baldes: goleiro/linha x principal/espera.
--
-- ── O balde e um BOOLEAN, e nunca uma palavra ────────────────────────────────
--
-- Nem a funcao nem a decisao que ela toma citam o valor que representa goleiro
-- em `players.preferred_position`. O criterio chega pronto, ja reduzido a "e
-- goleiro ou nao e", em tres pontos:
--
--   1. o argumento `p_is_goalkeeper`, que quem chama calcula;
--   2. `registration_slot_reservations.is_goalkeeper` (20260820020000);
--   3. `championship_registrations.is_goalkeeper`, criada aqui.
--
-- Isso NAO e preciosismo de estilo. O vocabulario dessa coluna esta em transicao
-- -- ha uma branch irma que converte o dado e poe uma CHECK recusando a grafia
-- antiga -- e ela nao toca em funcao nenhuma. Uma RPC que comparasse com o
-- literal de hoje sobreviveria ao deploy sem erro, contaria ZERO goleiros e
-- deixaria a cota aberta para sempre, EM SILENCIO.
--
-- O terreno ja foi pisado neste repo: a 20260615000000 subiu comparando a
-- coluna com um codigo quando ela guardava a palavra, e a migration seguinte
-- "consertou" alargando a comparacao para aceitar as duas grafias, em vez de
-- converter o dado. Duas migrations para um bug de um literal. Aqui a funcao nao
-- tem literal para envelhecer, entao nao ha o que consertar depois.
--
-- Por isso tambem NENHUMA frase deste arquivo cita a grafia: migration aplicada
-- nao se edita (o arquivo INTEIRO fica gravado em
-- `supabase_migrations.schema_migrations.statements`, cabecalho incluido), e
-- prosa que fixa o vocabulario de hoje vira registro falso amanha. A UNICA
-- excecao e o backfill abaixo, e ela esta explicada la.
--
-- ── DROP antes do CREATE, e nao CREATE OR REPLACE ────────────────────────────
--
-- A funcao ganha um terceiro parametro. `CREATE OR REPLACE FUNCTION` com um
-- parametro a mais NAO substitui a antiga: cria uma SOBRECARGA, e a partir dai
-- toda chamada com dois argumentos morre com `function ... is not unique`.
-- Medido nesta base antes de escrever isto. Como a chamada de dois argumentos e
-- a que esta NO AR (`services/public-registration.ts` passa
-- `p_championship_id` e `p_cpf`), esquecer o DROP derrubaria a inscricao inteira
-- -- e nao so as PRs empilhadas.
--
-- O parametro nasce com DEFAULT justamente para essa chamada de dois argumentos
-- continuar valendo enquanto o app nao passa o balde.
-- =============================================================================
BEGIN;

-- ── 1. A inscricao passa a guardar o balde em que entrou ─────────────────────
--
-- Antes disto a contagem de inscritos so podia sair de um JOIN com `players`, e
-- esse JOIN tinha um furo que nao e teorico: a vaga e concedida para um BALDE, e
-- quem edita a posicao no perfil DEPOIS de inscrito mudaria de balde
-- retroativamente. A cota passaria a contar 9 de 8, ou 7 de 8, sem ninguem ter
-- se inscrito nem desistido -- e no primeiro caso a trava ficaria estourada sem
-- ter deixado passar ninguem.
--
-- Gravar o balde na propria inscricao conserta isso pela raiz: a conta passa a
-- ser sobre o que foi CONCEDIDO, e mudar de ideia depois nao move vaga de lugar.
-- De quebra, e o que tira `preferred_position` do caminho da cota -- ver o
-- cabecalho.
--
-- NOT NULL DEFAULT false pela mesma razao da coluna irma em
-- 20260820020000: linha e o balde largo, e classificar a favor de deixar entrar
-- erra para o lado recuperavel.
ALTER TABLE public.championship_registrations
  ADD COLUMN IF NOT EXISTS is_goalkeeper boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.championship_registrations.is_goalkeeper IS
  'Em que balde a vaga foi CONCEDIDA: true para a cota de goleiro, false para a de linha. Guarda o balde, e nao a posicao -- o balde e binario, e e a unica coisa que a cota precisa. Fica na inscricao, e nao se le do perfil do jogador, de proposito: a vaga foi dada para um balde, e editar a posicao no perfil depois nao pode mover a conta.';

-- O backfill das linhas que ja existem, e o UNICO lugar deste arquivo que cita
-- grafia de posicao.
--
-- Citar aqui e seguro, e o motivo e a natureza do statement: ele roda UMA VEZ,
-- contra o dado que existia naquele instante, e depois nunca mais. Nao e regra
-- viva prometendo entender dois vocabularios -- e uma conversao de dado, a mesma
-- forma que qualquer migration de normalizacao usa. Depois dele, NADA vivo neste
-- caminho le `preferred_position`.
--
-- As duas grafias entram porque o instante em que este arquivo alcanca um banco
-- de verdade nao e conhecido de dentro dele: producao esta varias migrations
-- atras, e ha dumps circulando. As duas nao colidem, entao aceitar ambas nao
-- classifica ninguem errado -- e recusar a que estiver la classificaria TODO
-- goleiro como jogador de linha, calado.
UPDATE public.championship_registrations cr
   SET is_goalkeeper = true
  FROM public.players p
 WHERE p.id = cr.player_id
   AND cr.is_goalkeeper = false
   AND p.preferred_position IN ('Goleiro', 'GOL');

-- Mesma forma e mesma razao do indice de 20260820020000: a contagem por balde
-- roda em TODA reserva, dentro da secao critica que o `FOR UPDATE` do
-- campeonato serializa. A igualdade primeiro, os dois baldes depois.
CREATE INDEX IF NOT EXISTS championship_registrations_champ_bucket
  ON public.championship_registrations (championship_id, is_goalkeeper, is_waitlist);

-- ── 2. A funcao ──────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.reserve_registration_slot(uuid, text);

CREATE OR REPLACE FUNCTION public.reserve_registration_slot(
  p_championship_id uuid,
  p_cpf text,
  -- O balde do jogador, ja decidido por quem chama. Boolean, e nao a posicao em
  -- texto, pelo motivo do cabecalho: assim a conversao posicao -> balde acontece
  -- UMA vez, no lado que ja e dono do vocabulario, e o SQL nunca precisa saber
  -- como a posicao se escreve.
  --
  -- DEFAULT NULL, e nulo conta como LINHA -- o balde mais largo. Duas razoes: a
  -- chamada de dois argumentos que esta no ar continua valendo, e um argumento
  -- faltando erra a favor de deixar o jogador entrar em vez de tranca-lo por
  -- uma informacao que ninguem lhe pediu.
  p_is_goalkeeper boolean DEFAULT NULL
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
  v_existing_gk       boolean;
  v_confirmed_main    int;
  v_confirmed_wait    int;
  v_reserved_main     int;
  v_reserved_wait     int;
  v_is_waitlist       boolean;
  v_retry_at          timestamptz;

  -- O formato, lido junto com o resto sob o mesmo lock.
  v_teams             int;
  v_per_team          int;
  v_gk_per_team       int;
  v_wait_gk           int;
  v_wait_out          int;

  -- O balde deste jogador e as cotas dele.
  v_is_gk             boolean;
  v_cap_total         int;
  v_cap_gk            int;
  v_cap_out           int;
  v_cap_main          int;
  v_cap_wait          int;
  v_quota_binds       boolean;

  -- As contagens do balde deste jogador (as sem sufixo contam o campeonato
  -- inteiro, e sao as mesmas de antes).
  v_confirmed_main_b  int;
  v_confirmed_wait_b  int;
  v_reserved_main_b   int;
  v_reserved_wait_b   int;

  -- Os quatro desfechos possiveis, nomeados. Os dois primeiros decidem onde o
  -- jogador entra; os dois ultimos, sem as reservas na conta, decidem se a
  -- recusa e definitiva ou vale voltar.
  v_main_room         boolean;
  v_wait_room         boolean;
  v_main_room_conf    boolean;
  v_wait_room_conf    boolean;

  -- Se o CAMPEONATO tinha vaga (ignorando a cota do balde). E o que separa
  -- "sua cota acabou" de "acabou para todo mundo".
  v_champ_main_room   boolean;
  v_champ_wait_room   boolean;
BEGIN
  -- O formato entra NESTE select, e nao num segundo: um SELECT separado leria as
  -- colunas fora do lock, e duas reservas simultaneas poderiam derivar cotas
  -- diferentes da mesma linha.
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
  -- Consequencia que o bloco da janela (acima) tem e este repete: como esta
  -- checagem fica ACIMA do ramo que renova reserva viva, durante a pausa o
  -- heartbeat tambem para de renovar, e reserva viva no por do sol morre em ate
  -- um TTL. Importa para o commit, cuja regra e oposta: quem reservou 17h e
  -- termina o formulario 17h50 chega la SEM reserva viva.
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
  --
  --   E esse custo e menor do que parece lido de fora: no sabado a pagina
  --   mostra a tela de repouso e o wizard nem chega a ficar interativo, entao
  --   "ja inscrito tenta reservar no sabado" e praticamente inalcancavel pela
  --   interface -- sobra quem chama a server action por fora. Quem reabrir
  --   este trade-off nao deve superestimar o lado que ele custa.
  IF public.is_sabbath(now()) THEN
    RETURN json_build_object('success', false, 'reason', 'sabbath');
  END IF;

  -- Antes da poda e da contagem: quem ja esta inscrito tomaria uma vaga que
  -- nunca vai usar, e ela so voltaria quinze minutos depois. E ele merece saber
  -- no primeiro passo, nao depois de preencher o formulario inteiro.
  --
  -- Este JOIN com `players` continua, e ele NAO e o furo que a coluna nova
  -- fechou: aqui a tabela e consultada por IDENTIDADE (o CPF), que nao muda de
  -- vocabulario nem de valor. O furo era contar CAPACIDADE por um campo que o
  -- proprio jogador edita depois.
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

  -- Nulo cai no balde de linha. A regra mora aqui, sozinha, e todo o resto da
  -- funcao le so `v_is_gk`.
  v_is_gk := coalesce(p_is_goalkeeper, false);

  -- Reserva viva do mesmo CPF NO MESMO BALDE: renova e devolve a MESMA
  -- classificacao. E isso que faz recarregar a pagina nao vazar uma segunda
  -- vaga.
  --
  -- Trocou de balde, cai fora deste ramo e vai contar de novo -- mas a reserva
  -- antiga NAO e apagada aqui. Solta-la primeiro faria o jogador PERDER a vaga
  -- que ja tinha so para descobrir que o balde novo esta cheio. Quem a move e o
  -- ON CONFLICT do INSERT la embaixo, que so roda quando a vaga nova existe.
  SELECT is_waitlist, is_goalkeeper
    INTO v_existing_waitlist, v_existing_gk
    FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id AND cpf = p_cpf;

  IF FOUND AND v_existing_gk = v_is_gk THEN
    UPDATE public.registration_slot_reservations
       SET expires_at = v_expires
     WHERE championship_id = p_championship_id AND cpf = p_cpf;

    RETURN json_build_object(
      'success', true, 'is_waitlist', v_existing_waitlist, 'expires_at', v_expires
    );
  END IF;

  -- As cotas, derivadas do formato.
  --
  -- O `least` contra o total nao e defensividade vaga: cota por time maior que o
  -- time inteiro faria a cota de goleiro admitir MAIS goleiros do que o
  -- campeonato tem vaga -- 11 goleiros num time de 10 dariam 88 num campeonato
  -- de 80. Cortada no total, a cota no maximo toma o campeonato inteiro.
  --
  -- Esta aritmetica repete a de `features/championships/capacity.ts`, e a
  -- duplicacao e CONSCIENTE: a trava precisa valer no servidor, e o Postgres nao
  -- importa TypeScript. O antidoto e o par de testes das duas pontas, com as
  -- mesmas bordas dos dois lados.
  v_cap_total := coalesce(v_teams, 0) * coalesce(v_per_team, 0);
  v_cap_gk    := least(v_cap_total, coalesce(v_teams, 0) * coalesce(v_gk_per_team, 0));
  v_cap_out   := v_cap_total - v_cap_gk;

  -- A cota so morde quando o formato diz alguma coisa.
  --
  -- Sem esta guarda, campeonato com o formato ainda nao preenchido derivaria
  -- cota ZERO nos dois baldes e recusaria TODO MUNDO -- inclusive quem tem
  -- `max_players` posto na mao e inscricao aberta hoje. Fechar por omissao seria
  -- estragar um campeonato que estava funcionando.
  --
  -- Isso NAO reabre o furo que o bloco inteiro existe para fechar: formato
  -- deliberadamente zerado ja fecha pelo outro lado, porque `derivedCapacity`
  -- devolve `total: 0` e a T2 tornou o zero gravavel em `max_players`, e zero
  -- recusa todo mundo tres blocos abaixo.
  v_quota_binds := v_cap_total > 0;

  IF v_is_gk THEN
    v_cap_main := v_cap_gk;
    v_cap_wait := coalesce(v_wait_gk, 0);
  ELSE
    v_cap_main := v_cap_out;
    v_cap_wait := coalesce(v_wait_out, 0);
  END IF;

  -- Duas contagens, quatro numeros cada: o campeonato inteiro (que preserva a
  -- trava antiga, intacta) e o balde deste jogador (que e a cota nova).
  SELECT count(*) FILTER (WHERE NOT is_waitlist),
         count(*) FILTER (WHERE is_waitlist),
         count(*) FILTER (WHERE NOT is_waitlist AND is_goalkeeper = v_is_gk),
         count(*) FILTER (WHERE is_waitlist AND is_goalkeeper = v_is_gk)
    INTO v_confirmed_main, v_confirmed_wait, v_confirmed_main_b, v_confirmed_wait_b
    FROM public.championship_registrations
   WHERE championship_id = p_championship_id;

  -- `cpf <> p_cpf` para o jogador nao disputar vaga CONSIGO MESMO na troca de
  -- balde: a reserva dele continua na tabela (ver o ramo da renovacao), e sem
  -- este filtro ela contaria contra ele. Fora da troca de balde o filtro nao faz
  -- nada -- quem chega aqui com reserva viva so pode ter vindo por ali.
  SELECT count(*) FILTER (WHERE NOT is_waitlist),
         count(*) FILTER (WHERE is_waitlist),
         count(*) FILTER (WHERE NOT is_waitlist AND is_goalkeeper = v_is_gk),
         count(*) FILTER (WHERE is_waitlist AND is_goalkeeper = v_is_gk)
    INTO v_reserved_main, v_reserved_wait, v_reserved_main_b, v_reserved_wait_b
    FROM public.registration_slot_reservations
   WHERE championship_id = p_championship_id
     AND cpf <> p_cpf;

  -- O campeonato tem vaga? E a pergunta antiga, palavra por palavra, e ela
  -- continua valendo sozinha: a cota nova APERTA, nunca afrouxa.
  v_champ_main_room := v_max_players IS NULL
                       OR (v_confirmed_main + v_reserved_main) < v_max_players;
  v_champ_wait_room := (v_confirmed_wait + v_reserved_wait) < coalesce(v_max_waitlist, 0);

  -- E o balde dele tem vaga? As duas perguntas juntas decidem onde ele entra.
  v_main_room := v_champ_main_room
                 AND (NOT v_quota_binds
                      OR (v_confirmed_main_b + v_reserved_main_b) < v_cap_main);
  v_wait_room := v_champ_wait_room
                 AND (NOT v_quota_binds
                      OR (v_confirmed_wait_b + v_reserved_wait_b) < v_cap_wait);

  -- As mesmas duas perguntas SEM as reservas na conta. E o que distingue "cheio
  -- de verdade" de "cheio por reservas", que significam coisas diferentes para o
  -- jogador: no segundo caso vale voltar, porque reserva vence.
  v_main_room_conf := (v_max_players IS NULL OR v_confirmed_main < v_max_players)
                      AND (NOT v_quota_binds OR v_confirmed_main_b < v_cap_main);
  v_wait_room_conf := v_confirmed_wait < coalesce(v_max_waitlist, 0)
                      AND (NOT v_quota_binds OR v_confirmed_wait_b < v_cap_wait);

  IF v_main_room THEN
    v_is_waitlist := false;

  ELSIF v_wait_room THEN
    v_is_waitlist := true;

  ELSE
    -- Razao propria para a cota de goleiro, e nao `full`.
    --
    -- `full` promete "as vagas se esgotaram", e num campeonato de 80 com 8
    -- goleiros essa promessa e falsa exatamente quando mais importa: a cota de
    -- goleiro fecha com 72 vagas de linha ainda abertas. O goleiro recusado
    -- precisa poder ler "de GOLEIRO" -- e a tela so pode dizer isso se a razao
    -- disser.
    --
    -- A condicao e "o CAMPEONATO tinha vaga": se nem ele tinha, quem fechou a
    -- porta foi a lotacao, `full` e verdade, e dizer `goalkeepers_full` ali
    -- mandaria o goleiro tentar de novo como jogador de linha numa vaga que
    -- tambem nao existe.
    --
    -- `retry_at` vem junto, e carrega a distincao que o NOME nao carrega: nulo
    -- quando a cota esta cheia de INSCRICOES confirmadas (nao adianta voltar) e
    -- preenchido quando ha reserva viva segurando (vale voltar). Foi a saida
    -- para nao dobrar os ramos com um segundo nome por balde -- o sinal ficou,
    -- o nome extra nao.
    IF v_is_gk AND (v_champ_main_room OR v_champ_wait_room) THEN
      SELECT min(expires_at) INTO v_retry_at
        FROM public.registration_slot_reservations
       WHERE championship_id = p_championship_id
         AND is_goalkeeper
         AND cpf <> p_cpf;

      RETURN json_build_object(
        'success', false, 'reason', 'goalkeepers_full', 'retry_at', v_retry_at
      );
    END IF;

    IF NOT v_main_room_conf AND NOT v_wait_room_conf THEN
      RETURN json_build_object('success', false, 'reason', 'full');
    END IF;

    SELECT min(expires_at) INTO v_retry_at
      FROM public.registration_slot_reservations
     WHERE championship_id = p_championship_id
       AND cpf <> p_cpf;

    RETURN json_build_object(
      'success', false, 'reason', 'all_reserved', 'retry_at', v_retry_at
    );
  END IF;

  -- ON CONFLICT DO UPDATE, e nao INSERT seco: e por aqui que a troca de balde
  -- move a reserva que o ramo da renovacao deixou de proposito no lugar. Chegar
  -- aqui ja provou que o balde novo tem vaga.
  INSERT INTO public.registration_slot_reservations
    (championship_id, cpf, is_waitlist, is_goalkeeper, expires_at)
  VALUES
    (p_championship_id, p_cpf, v_is_waitlist, v_is_gk, v_expires)
  ON CONFLICT (championship_id, cpf) DO UPDATE
    SET is_waitlist   = EXCLUDED.is_waitlist,
        is_goalkeeper = EXCLUDED.is_goalkeeper,
        expires_at    = EXCLUDED.expires_at;

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
-- Aqui o revoke deixou de ser seguro extra e virou OBRIGATORIO: o DROP acima
-- apaga a funcao antiga com a ACL dela junto, e a nova nasce do zero, com os
-- default privileges do schema -- ou seja, executavel por anon. Sem estas duas
-- linhas esta migration ABRIRIA o buraco que a de 20260818040000 fechou.
REVOKE ALL ON FUNCTION public.reserve_registration_slot(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_registration_slot(uuid, text, boolean) FROM anon, authenticated;

COMMENT ON FUNCTION public.reserve_registration_slot(uuid, text, boolean) IS
'Reserva a vaga do jogador (por CPF) sob lock da linha do campeonato. So o
cliente service-role deve chamar -- anon/authenticated nao tem EXECUTE.

p_is_goalkeeper e o BALDE, ja decidido por quem chama, e nao a posicao: a funcao
nunca compara com grafia de posicao nenhuma. Nulo (o default) conta como linha,
o balde largo, para a chamada de dois argumentos continuar valendo e para
argumento faltando nao trancar ninguem.

Sao quatro baldes -- goleiro/linha x principal/espera -- e duas travas
sobrepostas: a lotacao do campeonato (max_players / max_waitlist_players) e a
cota do balde, derivada do formato (teams_count, players_per_team,
goalkeepers_per_team, waitlist_goalkeepers, waitlist_outfield). A cota so morde
quando o formato esta preenchido; ela sempre APERTA, nunca afrouxa a lotacao.

Retorno tem sete formatos:
  success=true -> {success, is_waitlist, expires_at}: vaga reservada ou
    renovada (principal ou espera). Reserva viva do mesmo CPF no mesmo balde
    e renovada com a MESMA classificacao; em balde diferente ela e MOVIDA, e so
    depois de o balde novo ter provado que tem vaga -- quem troca de ideia nao
    perde a vaga que ja tinha.
  success=false, reason=not_found: campeonato inexistente ou apagado.
  success=false, reason=not_open: campeonato fora do status subscribing, ou
    fora da janela entre registration_start_date e registration_end_date
    (bordas inclusivas; data nula nao fecha nada).
  success=false, reason=sabbath: e sabado -- do por do sol de sexta ao de
    sabado, pela tabela sabbath_windows ou pela regra conservadora quando ela
    nao alcanca o instante. Sem excecao para quem ja tem reserva.
  success=false, reason=already_registered: CPF ja tem inscricao gravada;
    checado antes da poda e da contagem, para nao gastar vaga a toa.
  success=false, reason=goalkeepers_full, retry_at=<timestamptz|null>: a cota de
    goleiro acabou, e o CAMPEONATO ainda tem vaga -- ou seja, ha vaga de linha
    aberta e nao ha de goleiro. E por isso que nao e `full`: a tela precisa poder
    dizer "de GOLEIRO". retry_at nulo significa cota tomada por inscricoes
    confirmadas (nao adianta voltar); preenchido, ha reserva viva que vence.
  success=false, reason=full: lotacao real -- principal e espera cheios por
    inscricoes confirmadas. Nao adianta tentar de novo.
  success=false, reason=all_reserved, retry_at=<timestamptz|null>: vagas
    seguradas por reservas vivas, que vencem. Vale tentar de novo a partir
    de retry_at.

A ordem da lista e a ordem das checagens, e nao e enfeite: not_open ganha de
sabbath porque "volte apos o por do sol" seria mentira num campeonato
encerrado, e sabbath ganha de already_registered porque durante a pausa o
fluxo responde a mesma coisa a todo mundo, sem antes olhar quem e. E
goalkeepers_full ganha de full pelo motivo inverso: quando as duas descrevem o
estado, a mais especifica e a util.';

COMMIT;
