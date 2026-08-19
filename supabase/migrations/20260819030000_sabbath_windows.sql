-- =============================================================================
-- Migration: as janelas de sabado, pre-calculadas
--
-- A comunidade do campeonato e Adventista do Setimo Dia, e a pausa das
-- inscricoes do por do sol de sexta ao de sabado e observancia religiosa. Ate
-- aqui ela dependia de um admin trocar o status `rest` na mao, nos dois
-- sentidos — e o texto da tela ja prometia que voltava sozinha.
--
-- Os instantes vem literais, e nao de trigonometria em PL/pgSQL, para ficarem
-- auditaveis no diff da PR: da para conferir contra uma tabela de por do sol
-- publicada. Numa feature em que errar significa o sistema trabalhar no sabado,
-- poder ler os horarios na revisao vale mais que elegancia.
--
-- COMO REGERAR (a tabela cobre ate 28/12/2029):
--   npm run gen:sabbath -- <inicio> <fim> > /tmp/sabbath-rows.sql
--   e cole a saida num INSERT ... ON CONFLICT (starts_at) DO NOTHING numa
--   migration NOVA. Nunca edite esta.
--
-- QUANDO REGERAR ANTES DA HORA: se o Brasil reinstituir o horario de verao. Os
-- instantes gravados aqui foram calculados com o offset vigente em 2026-08, e
-- passariam a encerrar a pausa uma hora ANTES do por do sol real — errando
-- contra a observancia. Nesse caso, regere o periodo afetado e apague as linhas
-- velhas na mesma migration.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.sabbath_windows (
  starts_at timestamptz PRIMARY KEY,
  ends_at   timestamptz NOT NULL,
  CONSTRAINT sabbath_windows_ordenada CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.sabbath_windows IS
'Janelas de repouso: do por do sol de sexta ao de sabado, calculados para
Sorocaba/SP por scripts/generate-sabbath-windows.mjs. Sem vinculo com
campeonato de proposito — a observancia e da comunidade, nao de uma edicao.';

ALTER TABLE public.sabbath_windows ENABLE ROW LEVEL SECURITY;

-- Leitura aberta, diferente de registration_slot_reservations: aqui nao ha dado
-- de pessoa nenhuma, so astronomia publica. Sem a policy, um futuro consumidor
-- client-side leria zero linhas e concluiria, calado, que nunca e sabado.
CREATE POLICY "sabbath windows public read"
  ON public.sabbath_windows FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.sabbath_windows (starts_at, ends_at) VALUES
  ('2026-08-07T20:50:18.000Z', '2026-08-08T20:50:43.000Z'),
  ('2026-08-14T20:53:02.000Z', '2026-08-15T20:53:26.000Z'),
  ('2026-08-21T20:55:36.000Z', '2026-08-22T20:55:58.000Z'),
  ('2026-08-28T20:58:00.000Z', '2026-08-29T20:58:21.000Z'),
  ('2026-09-04T21:00:16.000Z', '2026-09-05T21:00:36.000Z'),
  ('2026-09-11T21:02:28.000Z', '2026-09-12T21:02:48.000Z'),
  ('2026-09-18T21:04:40.000Z', '2026-09-19T21:05:00.000Z'),
  ('2026-09-25T21:06:56.000Z', '2026-09-26T21:07:17.000Z'),
  ('2026-10-02T21:09:22.000Z', '2026-10-03T21:09:45.000Z'),
  ('2026-10-09T21:12:02.000Z', '2026-10-10T21:12:27.000Z'),
  ('2026-10-16T21:15:01.000Z', '2026-10-17T21:15:29.000Z'),
  ('2026-10-23T21:18:22.000Z', '2026-10-24T21:18:54.000Z'),
  ('2026-10-30T21:22:07.000Z', '2026-10-31T21:22:43.000Z'),
  ('2026-11-06T21:26:16.000Z', '2026-11-07T21:26:55.000Z'),
  ('2026-11-13T21:30:47.000Z', '2026-11-14T21:31:28.000Z'),
  ('2026-11-20T21:35:33.000Z', '2026-11-21T21:36:16.000Z'),
  ('2026-11-27T21:40:27.000Z', '2026-11-28T21:41:10.000Z'),
  ('2026-12-04T21:45:19.000Z', '2026-12-05T21:46:01.000Z'),
  ('2026-12-11T21:49:55.000Z', '2026-12-12T21:50:33.000Z'),
  ('2026-12-18T21:54:02.000Z', '2026-12-19T21:54:35.000Z'),
  ('2026-12-25T21:57:27.000Z', '2026-12-26T21:57:53.000Z'),
  ('2027-01-01T21:59:57.000Z', '2027-01-02T22:00:15.000Z'),
  ('2027-01-08T22:01:25.000Z', '2027-01-09T22:01:33.000Z'),
  ('2027-01-15T22:01:45.000Z', '2027-01-16T22:01:43.000Z'),
  ('2027-01-22T22:00:54.000Z', '2027-01-23T22:00:42.000Z'),
  ('2027-01-29T21:58:55.000Z', '2027-01-30T21:58:33.000Z'),
  ('2027-02-05T21:55:51.000Z', '2027-02-06T21:55:20.000Z'),
  ('2027-02-12T21:51:48.000Z', '2027-02-13T21:51:10.000Z'),
  ('2027-02-19T21:46:55.000Z', '2027-02-20T21:46:10.000Z'),
  ('2027-02-26T21:41:19.000Z', '2027-02-27T21:40:29.000Z'),
  ('2027-03-05T21:35:10.000Z', '2027-03-06T21:34:16.000Z'),
  ('2027-03-12T21:28:37.000Z', '2027-03-13T21:27:40.000Z'),
  ('2027-03-19T21:21:49.000Z', '2027-03-20T21:20:51.000Z'),
  ('2027-03-26T21:14:56.000Z', '2027-03-27T21:13:58.000Z'),
  ('2027-04-02T21:08:06.000Z', '2027-04-03T21:07:09.000Z'),
  ('2027-04-09T21:01:29.000Z', '2027-04-10T21:00:34.000Z'),
  ('2027-04-16T20:55:12.000Z', '2027-04-17T20:54:21.000Z'),
  ('2027-04-23T20:49:25.000Z', '2027-04-24T20:48:39.000Z'),
  ('2027-04-30T20:44:14.000Z', '2027-05-01T20:43:34.000Z'),
  ('2027-05-07T20:39:46.000Z', '2027-05-08T20:39:13.000Z'),
  ('2027-05-14T20:36:08.000Z', '2027-05-15T20:35:42.000Z'),
  ('2027-05-21T20:33:24.000Z', '2027-05-22T20:33:06.000Z'),
  ('2027-05-28T20:31:35.000Z', '2027-05-29T20:31:26.000Z'),
  ('2027-06-04T20:30:43.000Z', '2027-06-05T20:30:42.000Z'),
  ('2027-06-11T20:30:46.000Z', '2027-06-12T20:30:51.000Z'),
  ('2027-06-18T20:31:38.000Z', '2027-06-19T20:31:50.000Z'),
  ('2027-06-25T20:33:14.000Z', '2027-06-26T20:33:31.000Z'),
  ('2027-07-02T20:35:24.000Z', '2027-07-03T20:35:46.000Z'),
  ('2027-07-09T20:38:00.000Z', '2027-07-10T20:38:25.000Z'),
  ('2027-07-16T20:40:53.000Z', '2027-07-17T20:41:19.000Z'),
  ('2027-07-23T20:43:53.000Z', '2027-07-24T20:44:20.000Z'),
  ('2027-07-30T20:46:53.000Z', '2027-07-31T20:47:19.000Z'),
  ('2027-08-06T20:49:48.000Z', '2027-08-07T20:50:13.000Z'),
  ('2027-08-13T20:52:34.000Z', '2027-08-14T20:52:58.000Z'),
  ('2027-08-20T20:55:10.000Z', '2027-08-21T20:55:32.000Z'),
  ('2027-08-27T20:57:36.000Z', '2027-08-28T20:57:57.000Z'),
  ('2027-09-03T20:59:53.000Z', '2027-09-04T21:00:13.000Z'),
  ('2027-09-10T21:02:05.000Z', '2027-09-11T21:02:25.000Z'),
  ('2027-09-17T21:04:16.000Z', '2027-09-18T21:04:36.000Z'),
  ('2027-09-24T21:06:31.000Z', '2027-09-25T21:06:52.000Z'),
  ('2027-10-01T21:08:55.000Z', '2027-10-02T21:09:18.000Z'),
  ('2027-10-08T21:11:33.000Z', '2027-10-09T21:11:57.000Z'),
  ('2027-10-15T21:14:28.000Z', '2027-10-16T21:14:56.000Z'),
  ('2027-10-22T21:17:45.000Z', '2027-10-23T21:18:16.000Z'),
  ('2027-10-29T21:21:26.000Z', '2027-10-30T21:22:01.000Z'),
  ('2027-11-05T21:25:31.000Z', '2027-11-06T21:26:09.000Z'),
  ('2027-11-12T21:29:58.000Z', '2027-11-13T21:30:38.000Z'),
  ('2027-11-19T21:34:42.000Z', '2027-11-20T21:35:24.000Z'),
  ('2027-11-26T21:39:35.000Z', '2027-11-27T21:40:18.000Z'),
  ('2027-12-03T21:44:28.000Z', '2027-12-04T21:45:10.000Z'),
  ('2027-12-10T21:49:08.000Z', '2027-12-11T21:49:47.000Z'),
  ('2027-12-17T21:53:21.000Z', '2027-12-18T21:53:55.000Z'),
  ('2027-12-24T21:56:54.000Z', '2027-12-25T21:57:21.000Z'),
  ('2027-12-31T21:59:35.000Z', '2028-01-01T21:59:54.000Z'),
  ('2028-01-07T22:01:14.000Z', '2028-01-08T22:01:24.000Z'),
  ('2028-01-14T22:01:46.000Z', '2028-01-15T22:01:46.000Z'),
  ('2028-01-21T22:01:08.000Z', '2028-01-22T22:00:58.000Z'),
  ('2028-01-28T21:59:21.000Z', '2028-01-29T21:59:01.000Z'),
  ('2028-02-04T21:56:28.000Z', '2028-02-05T21:55:59.000Z'),
  ('2028-02-11T21:52:35.000Z', '2028-02-12T21:51:58.000Z'),
  ('2028-02-18T21:47:50.000Z', '2028-02-19T21:47:07.000Z'),
  ('2028-02-25T21:42:21.000Z', '2028-02-26T21:41:32.000Z'),
  ('2028-03-03T21:36:17.000Z', '2028-03-04T21:35:24.000Z'),
  ('2028-03-10T21:29:48.000Z', '2028-03-11T21:28:52.000Z'),
  ('2028-03-17T21:23:02.000Z', '2028-03-18T21:22:04.000Z'),
  ('2028-03-24T21:16:09.000Z', '2028-03-25T21:15:11.000Z'),
  ('2028-03-31T21:09:18.000Z', '2028-04-01T21:08:21.000Z'),
  ('2028-04-07T21:02:38.000Z', '2028-04-08T21:01:43.000Z'),
  ('2028-04-14T20:56:17.000Z', '2028-04-15T20:55:26.000Z'),
  ('2028-04-21T20:50:24.000Z', '2028-04-22T20:49:37.000Z'),
  ('2028-04-28T20:45:06.000Z', '2028-04-29T20:44:25.000Z'),
  ('2028-05-05T20:40:31.000Z', '2028-05-06T20:39:56.000Z'),
  ('2028-05-12T20:36:44.000Z', '2028-05-13T20:36:16.000Z'),
  ('2028-05-19T20:33:49.000Z', '2028-05-20T20:33:30.000Z'),
  ('2028-05-26T20:31:51.000Z', '2028-05-27T20:31:40.000Z'),
  ('2028-06-02T20:30:49.000Z', '2028-06-03T20:30:46.000Z'),
  ('2028-06-09T20:30:42.000Z', '2028-06-10T20:30:46.000Z'),
  ('2028-06-16T20:31:26.000Z', '2028-06-17T20:31:37.000Z'),
  ('2028-06-23T20:32:54.000Z', '2028-06-24T20:33:11.000Z'),
  ('2028-06-30T20:34:59.000Z', '2028-07-01T20:35:21.000Z'),
  ('2028-07-07T20:37:32.000Z', '2028-07-08T20:37:56.000Z'),
  ('2028-07-14T20:40:22.000Z', '2028-07-15T20:40:48.000Z'),
  ('2028-07-21T20:43:21.000Z', '2028-07-22T20:43:48.000Z'),
  ('2028-07-28T20:46:22.000Z', '2028-07-29T20:46:48.000Z'),
  ('2028-08-04T20:49:18.000Z', '2028-08-05T20:49:44.000Z'),
  ('2028-08-11T20:52:06.000Z', '2028-08-12T20:52:30.000Z'),
  ('2028-08-18T20:54:43.000Z', '2028-08-19T20:55:06.000Z'),
  ('2028-08-25T20:57:11.000Z', '2028-08-26T20:57:32.000Z'),
  ('2028-09-01T20:59:29.000Z', '2028-09-02T20:59:50.000Z'),
  ('2028-09-08T21:01:42.000Z', '2028-09-09T21:02:02.000Z'),
  ('2028-09-15T21:03:53.000Z', '2028-09-16T21:04:13.000Z'),
  ('2028-09-22T21:06:07.000Z', '2028-09-23T21:06:28.000Z'),
  ('2028-09-29T21:08:29.000Z', '2028-09-30T21:08:51.000Z'),
  ('2028-10-06T21:11:04.000Z', '2028-10-07T21:11:28.000Z'),
  ('2028-10-13T21:13:56.000Z', '2028-10-14T21:14:23.000Z'),
  ('2028-10-20T21:17:09.000Z', '2028-10-21T21:17:39.000Z'),
  ('2028-10-27T21:20:45.000Z', '2028-10-28T21:21:19.000Z'),
  ('2028-11-03T21:24:46.000Z', '2028-11-04T21:25:23.000Z'),
  ('2028-11-10T21:29:09.000Z', '2028-11-11T21:29:49.000Z'),
  ('2028-11-17T21:33:50.000Z', '2028-11-18T21:34:33.000Z'),
  ('2028-11-24T21:38:43.000Z', '2028-11-25T21:39:26.000Z'),
  ('2028-12-01T21:43:37.000Z', '2028-12-02T21:44:19.000Z'),
  ('2028-12-08T21:48:20.000Z', '2028-12-09T21:48:59.000Z'),
  ('2028-12-15T21:52:38.000Z', '2028-12-16T21:53:14.000Z'),
  ('2028-12-22T21:56:20.000Z', '2028-12-23T21:56:48.000Z'),
  ('2028-12-29T21:59:10.000Z', '2028-12-30T21:59:31.000Z'),
  ('2029-01-05T22:01:01.000Z', '2029-01-06T22:01:13.000Z'),
  ('2029-01-12T22:01:46.000Z', '2029-01-13T22:01:47.000Z'),
  ('2029-01-19T22:01:20.000Z', '2029-01-20T22:01:12.000Z'),
  ('2029-01-26T21:59:45.000Z', '2029-01-27T21:59:26.000Z'),
  ('2029-02-02T21:57:03.000Z', '2029-02-03T21:56:36.000Z'),
  ('2029-02-09T21:53:20.000Z', '2029-02-10T21:52:45.000Z'),
  ('2029-02-16T21:48:44.000Z', '2029-02-17T21:48:02.000Z'),
  ('2029-02-23T21:43:22.000Z', '2029-02-24T21:42:34.000Z'),
  ('2029-03-02T21:37:24.000Z', '2029-03-03T21:36:31.000Z'),
  ('2029-03-09T21:30:59.000Z', '2029-03-10T21:30:03.000Z'),
  ('2029-03-16T21:24:15.000Z', '2029-03-17T21:23:17.000Z'),
  ('2029-03-23T21:17:23.000Z', '2029-03-24T21:16:25.000Z'),
  ('2029-03-30T21:10:31.000Z', '2029-03-31T21:09:34.000Z'),
  ('2029-04-06T21:03:48.000Z', '2029-04-07T21:02:53.000Z'),
  ('2029-04-13T20:57:23.000Z', '2029-04-14T20:56:31.000Z'),
  ('2029-04-20T20:51:25.000Z', '2029-04-21T20:50:37.000Z'),
  ('2029-04-27T20:46:00.000Z', '2029-04-28T20:45:18.000Z'),
  ('2029-05-04T20:41:17.000Z', '2029-05-05T20:40:41.000Z'),
  ('2029-05-11T20:37:20.000Z', '2029-05-12T20:36:52.000Z'),
  ('2029-05-18T20:34:17.000Z', '2029-05-19T20:33:56.000Z'),
  ('2029-05-25T20:32:08.000Z', '2029-05-26T20:31:55.000Z'),
  ('2029-06-01T20:30:56.000Z', '2029-06-02T20:30:52.000Z'),
  ('2029-06-08T20:30:40.000Z', '2029-06-09T20:30:43.000Z'),
  ('2029-06-15T20:31:15.000Z', '2029-06-16T20:31:25.000Z'),
  ('2029-06-22T20:32:36.000Z', '2029-06-23T20:32:52.000Z'),
  ('2029-06-29T20:34:35.000Z', '2029-06-30T20:34:56.000Z'),
  ('2029-07-06T20:37:03.000Z', '2029-07-07T20:37:27.000Z'),
  ('2029-07-13T20:39:51.000Z', '2029-07-14T20:40:17.000Z'),
  ('2029-07-20T20:42:49.000Z', '2029-07-21T20:43:16.000Z'),
  ('2029-07-27T20:45:50.000Z', '2029-07-28T20:46:17.000Z'),
  ('2029-08-03T20:48:47.000Z', '2029-08-04T20:49:13.000Z'),
  ('2029-08-10T20:51:37.000Z', '2029-08-11T20:52:01.000Z'),
  ('2029-08-17T20:54:16.000Z', '2029-08-18T20:54:39.000Z'),
  ('2029-08-24T20:56:45.000Z', '2029-08-25T20:57:07.000Z'),
  ('2029-08-31T20:59:05.000Z', '2029-09-01T20:59:26.000Z'),
  ('2029-09-07T21:01:19.000Z', '2029-09-08T21:01:39.000Z'),
  ('2029-09-14T21:03:30.000Z', '2029-09-15T21:03:50.000Z'),
  ('2029-09-21T21:05:43.000Z', '2029-09-22T21:06:04.000Z'),
  ('2029-09-28T21:08:03.000Z', '2029-09-29T21:08:25.000Z'),
  ('2029-10-05T21:10:35.000Z', '2029-10-06T21:10:59.000Z'),
  ('2029-10-12T21:13:24.000Z', '2029-10-13T21:13:50.000Z'),
  ('2029-10-19T21:16:33.000Z', '2029-10-20T21:17:03.000Z'),
  ('2029-10-26T21:20:05.000Z', '2029-10-27T21:20:38.000Z'),
  ('2029-11-02T21:24:01.000Z', '2029-11-03T21:24:38.000Z'),
  ('2029-11-09T21:28:21.000Z', '2029-11-10T21:29:00.000Z'),
  ('2029-11-16T21:32:59.000Z', '2029-11-17T21:33:41.000Z'),
  ('2029-11-23T21:37:50.000Z', '2029-11-24T21:38:34.000Z'),
  ('2029-11-30T21:42:45.000Z', '2029-12-01T21:43:27.000Z'),
  ('2029-12-07T21:47:31.000Z', '2029-12-08T21:48:11.000Z'),
  ('2029-12-14T21:51:55.000Z', '2029-12-15T21:52:31.000Z'),
  ('2029-12-21T21:55:43.000Z', '2029-12-22T21:56:13.000Z'),
  ('2029-12-28T21:58:44.000Z', '2029-12-29T21:59:06.000Z')
ON CONFLICT (starts_at) DO NOTHING;

-- =============================================================================
-- A autoridade do banco sobre "e sabado agora?".
--
-- `p_at` por parametro, e nao now() por dentro: e o que permite exercitar as
-- bordas exatas e a regra conservadora em scripts/test-registration-slots.sh
-- sem congelar o relogio numa transacao.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_sabbath(p_at timestamptz)
RETURNS boolean AS $$
DECLARE
  v_local timestamp;
  v_dow   int;
  v_hora  time;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sabbath_windows
     WHERE p_at >= starts_at AND p_at <= ends_at
  ) THEN
    RETURN true;
  END IF;

  -- Ha janela cobrindo o futuro: a tabela funciona, e simplesmente nao e
  -- sabado. Sem esta saida, toda sexta das 17h ao por do sol real (~17h50 no
  -- inverno) a regra conservadora abaixo pausaria por engano, TODA semana,
  -- mesmo com a tabela perfeita — e o aviso do por do sol mentiria o horario.
  IF EXISTS (SELECT 1 FROM public.sabbath_windows WHERE ends_at >= p_at) THEN
    RETURN false;
  END IF;

  -- A tabela acabou. Falha a favor da observancia: sexta 17h a sabado 19h30,
  -- horario de Brasilia. Errar pausando a mais custa algumas horas de
  -- inscricao; errar pausando a menos custa a observancia.
  --
  -- 19h30, e nao 19h: os proprios dados desta tabela mostram DEZ sabados de
  -- janeiro com por do sol depois das 19h, o ultimo as 19:01:47. Com o corte em
  -- 19h a regra "conservadora" encerraria a pausa ANTES do sol se por — errando
  -- para o lado proibido, justo no ramo que existe para nao errar. A margem
  -- agora espelha a da sexta: o por do sol mais cedo do ano e 17:30:40, ou seja
  -- 30 minutos depois do inicio conservador.
  --
  -- Esticar mais para cobrir um horario de verao reinstituido nao ajudaria:
  -- se o DST voltar, quem quebra primeiro e a tabela — os instantes gravados
  -- encerrariam a pausa uma hora cedo — e nesse estado este ramo nem roda,
  -- porque a tabela nao lapsou. DST e problema da regeracao, nota la em cima.
  --
  -- Espelha SABBATH_FALLBACK_* em features/registration/sabbath.ts. Mexeu aqui,
  -- mexa la — nada cobra os dois lados alem do teste de cada um.
  v_local := p_at AT TIME ZONE 'America/Sao_Paulo';
  v_dow   := extract(dow FROM v_local);
  v_hora  := v_local::time;

  RETURN (v_dow = 5 AND v_hora >= time '17:00')
      OR (v_dow = 6 AND v_hora <= time '19:30');
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Nada no cliente precisa desta funcao: as duas RPCs a chamam de dentro, e o
-- lado TypeScript tem a sua propria copia da regra. Expor via PostgREST so
-- aumentaria a superficie. Ver a nota do REVOKE em
-- 20260819010000_reserve_slot_respects_window.sql.
REVOKE ALL ON FUNCTION public.is_sabbath(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_sabbath(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.is_sabbath(timestamptz) IS
'Diz se o instante cai dentro de uma janela de sabado (bordas inclusivas).
Quando nenhuma linha de sabbath_windows alcanca p_at — a tabela acabou —
aplica a regra conservadora de sexta 17h a sabado 19h30, horario de Brasilia,
que pausa mais do que o real e nunca menos. O 19h30 vem dos dados: o por do sol
mais tardio da tabela e 19:01:47 (sabado 13/01/2029), entao cortar em 19h
encerraria a pausa antes do sol se por.

Guarda a cauda, nao a cabeca: instante anterior a primeira linha devolve false
em qualquer dia da semana, porque ainda existe janela alcancando p_at. A funcao
responde sobre agora e daqui pra frente, e nao afirma nada sobre o passado.';

COMMIT;
