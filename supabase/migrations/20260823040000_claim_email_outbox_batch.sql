-- =============================================================================
-- Migration: quem TIRA da caixa de saida
--
-- A migration 20260823010000 criou a tabela e a 20260823030000 pos um gatilho
-- para enche-la. Desde entao a fila so cresce: nao ha ninguem do outro lado.
-- Esta migration cria a UNICA instrucao SQL do dreno -- pegar o proximo lote --
-- e ela precisa existir aqui, e nao no TypeScript, por um motivo so: o cliente
-- do Supabase nao manda SQL cru, e sem SQL cru nao ha `FOR UPDATE SKIP LOCKED`.
--
-- ── Por que o lock, e por que ELE e a razao de esta funcao existir ───────────
--
-- O dreno vai rodar por cron. Cron dispara duas vezes: por reentrega da
-- plataforma, por implantacao no meio de um disparo, por alguem chamando o
-- endpoint a mao enquanto o agendado corre. Se os dois disparos lerem as mesmas
-- linhas pendentes, os dois mandam os mesmos e-mails -- e a unicidade
-- (kind, dedupe_key) da tabela NAO protege disso: ela impede a linha repetida,
-- nao o envio repetido da mesma linha.
--
-- O que protege e pegar e marcar na MESMA instrucao, com a linha travada. Com
-- SKIP LOCKED o segundo disparo nao espera nem estoura: ele pula o que o
-- primeiro pegou e leva o resto.
--
-- ATENCAO a forma do lock, porque a forma errada existe neste repo: em
-- `activate_special_card` ha um `SELECT EXISTS(... FOR UPDATE)`, e aquilo NAO
-- trava nada -- o EXISTS descarta as linhas antes de haver o que travar. O lock
-- tem de ficar no SELECT que devolve as LINHAS, e e por isso que a consulta
-- abaixo escolhe ids num CTE e o UPDATE se junta a ele.
--
-- ── Por que `claimed_at`, e o que ele conserta ──────────────────────────────
--
-- `status = 'sending'` sem carimbo de quando e uma armadilha: se o processo
-- morrer entre o claim e a gravacao do resultado -- estouro de tempo da funcao,
-- implantacao no meio, processo derrubado --, a linha fica em 'sending' para
-- sempre. Ela nao esta pendente, entao nenhum disparo futuro a pega; e nao
-- esta enviada, entao ninguem recebeu. E um e-mail perdido em silencio, que e
-- exatamente o defeito que a caixa de saida existe para nao ter.
--
-- Com o carimbo, a propria funcao de claim recolhe o que ficou parado alem do
-- limite. O limite e generoso de proposito: um lote de 25 com o teto de espera
-- do Brevo em 15s (lib/email/brevo.ts) leva menos de sete minutos no pior caso,
-- e recolher cedo demais e mandar de novo o que ja saiu.
--
-- Na data desta migration a coluna nasce nula em toda linha existente, e isso e
-- o estado correto dela: nenhuma dessas linhas foi pega por ninguem.
--
-- ── Permissoes ──────────────────────────────────────────────────────────────
--
-- Mesma regra da tabela: `REVOKE ... FROM PUBLIC` NAO fecha nada sozinho neste
-- projeto, porque `anon` e `authenticated` recebem privilegio nominal por
-- ALTER DEFAULT PRIVILEGES, e privilegio nominal so sai por REVOKE nominal.
-- O `service_role` continua com EXECUTE, e e com ele que o dreno chama.
-- =============================================================================
BEGIN;

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.email_outbox.claimed_at IS
'Quando esta linha foi pega por um dreno, ou seja, quando ela entrou em
''sending''. Serve para uma coisa so: recolher a linha que ficou em ''sending''
porque o processo morreu antes de gravar o resultado. Sem ele, ''sending'' e um
estado sem saida -- nem pendente para ser tentada, nem enviada para alguem ter
recebido.';

CREATE INDEX IF NOT EXISTS email_outbox_sending
  ON public.email_outbox (claimed_at)
  WHERE status = 'sending';

-- Quanto tempo uma linha pode ficar em 'sending' antes de ser considerada
-- abandonada. Escrito no corpo da funcao e nao em coluna nenhuma: e politica do
-- dreno, e muda por ALTER FUNCTION.
CREATE OR REPLACE FUNCTION public.claim_email_outbox_batch(
  p_limit int,
  p_now   timestamptz
)
RETURNS TABLE (
  id         uuid,
  kind       text,
  dedupe_key text,
  payload    jsonb,
  attempts   int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH escolhidas AS (
    SELECT o.id
      FROM public.email_outbox o
     WHERE (o.status = 'pending' AND o.next_attempt_at <= p_now)
        -- O recolhimento do que ficou parado. `claimed_at IS NULL` entra junto
        -- porque linha em 'sending' sem carimbo so pode ter vindo de antes
        -- desta migration, e essas tambem estao abandonadas.
        OR (o.status = 'sending'
            AND (o.claimed_at IS NULL OR o.claimed_at <= p_now - interval '30 minutes'))
     ORDER BY o.next_attempt_at, o.created_at
     LIMIT GREATEST(COALESCE(p_limit, 0), 0)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox o
     SET status = 'sending',
         claimed_at = p_now
    FROM escolhidas e
   WHERE o.id = e.id
  RETURNING o.id, o.kind, o.dedupe_key, o.payload, o.attempts;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(int, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(int, timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.claim_email_outbox_batch(int, timestamptz) IS
'Pega o proximo lote da fila e o marca ''sending'' na MESMA instrucao, com
FOR UPDATE SKIP LOCKED, para dois disparos do dreno nao mandarem os mesmos
e-mails. Tambem recolhe o que ficou em ''sending'' por mais de 30 minutos, que e
como uma linha se perde quando o processo morre no meio do envio.

O instante e ARGUMENTO e nao now(): o dreno inteiro recebe o relogio de fora,
para que a suite consiga exercitar a pausa de sabado em qualquer dia da semana.
scripts/test-registration-slots.sh nao tem essa injecao, e por isso falha
inteiro durante a pausa -- um portao cego 24 horas por semana.';

COMMIT;
