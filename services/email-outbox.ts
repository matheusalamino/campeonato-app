import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBrevoSender } from "@/lib/email/brevo";
import { siteUrlFrom } from "@/lib/email/site-url";
import {
  drainOutbox,
  type DrainReport,
  type OutboxRow,
  type OutboxStore,
} from "@/features/email/outbox";
import { renderEmail, type EmailRenderer } from "@/features/email/render";
import { summariesById } from "@/features/email/summary-row";
import type { RegistrationSummaryRow } from "@/features/email/summary-row";
import {
  deferColumns,
  failedPermanentColumns,
  outboxRowsFrom,
  requeueColumns,
  sentColumns,
} from "@/features/email/outbox-columns";
import type { ClaimedOutboxRow } from "@/features/email/outbox-columns";

/**
 * A FIACAO do dreno: o cliente do Supabase, as variaveis de ambiente e o
 * remetente do Brevo amarrados as funcoes de `features/email/outbox.ts`.
 *
 * Nao ha decisao nenhuma aqui de proposito. Toda regra -- a ordem das guardas
 * de envio, a escada de reentrega, quem recebe cada `kind` -- esta em
 * `features/`, porque o `include` do `vitest.config.ts` NAO alcanca
 * `services/**`. Isso foi medido: um `services/*.test.ts` afirmando
 * `expect(1).toBe(2)` deixa a suite PRINCIPAL verde.
 *
 * ── MAS O STORE NAO ESTA MAIS NU (T5b) ──
 *
 * `services/email-outbox.contract.ts` exercita os OITO metodos de
 * `createSupabaseOutboxStore` contra o Postgres local, sem dublar nada -- ela e
 * a unica funcao exportada daqui que RECEBE o cliente do Supabase por
 * argumento, e e por essa porta que o contrato entra. Ele mora numa segunda
 * suite, com `include` proprio, porque a principal nao pode precisar de banco.
 * Roda a mao, com o stack local de pe:
 *
 *     npx vitest run --config vitest.contract.config.ts
 *
 * O que continua sem portao neste arquivo e `runOutboxDrain`, que monta o
 * cliente la dentro com `createAdminClient()` e le o ambiente. Leia com isso em
 * mente.
 */

export function createSupabaseOutboxStore(supabase: SupabaseClient): OutboxStore {
  return {
    async claimBatch(limit, now): Promise<OutboxRow[]> {
      // RPC, e nao `.from("email_outbox")`, porque o cliente do Supabase nao
      // manda SQL cru -- e sem SQL cru nao ha `FOR UPDATE SKIP LOCKED`. Sem o
      // lock, dois disparos do cron leem as mesmas linhas pendentes e mandam os
      // mesmos e-mails. Ver a migration 20260823040000.
      const { data, error } = await supabase.rpc("claim_email_outbox_batch", {
        p_limit: limit,
        p_now: now.toISOString(),
      });
      if (error) throw new Error(`claim_email_outbox_batch falhou: ${error.message}`);
      return outboxRowsFrom((data ?? []) as ClaimedOutboxRow[]);
    },

    async isSabbath(at) {
      // `is_sabbath` levou REVOKE de `anon` e `authenticated` na migration
      // 20260819030000; o `service_role` mantem o EXECUTE, e ha assertiva
      // sobre isso -- incluindo pelo caminho do PostgREST, que e ESTE -- em
      // scripts/test-email-outbox.sh.
      const { data, error } = await supabase.rpc("is_sabbath", { p_at: at.toISOString() });
      // Deliberadamente sem `?? false`: nao saber se a pausa comecou nao e a
      // mesma coisa que saber que nao comecou. Enviar durante a pausa por causa
      // de uma consulta quebrada e o unico erro desta funcao que nao da para
      // desfazer.
      if (error) throw new Error(`is_sabbath falhou: ${error.message}`);
      return data === true;
    },

    async countSentSince(since) {
      const { count, error } = await supabase
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", since.toISOString());
      if (error) throw new Error(`contagem da cota falhou: ${error.message}`);
      // Sem `?? 0`: contagem ausente lida como zero libera a cota inteira de
      // novo, e a cota do plano gratuito e 300 no dia -- estourar significa o
      // provedor recusando o resto.
      if (count === null) throw new Error("contagem da cota voltou vazia");
      return count;
    },

    /**
     * A leitura das colunas que a fila precisa saber sobre uma inscricao. Os dois
     * objetos aninhados vem dos relacionamentos por `championship_id` e
     * `player_id`, e os DOIS podem voltar nulos: as duas colunas sao NULLABLE
     * (medido em `\d championship_registrations`).
     *
     * ── O `select` NAO E GUARDA DE NADA, E VOCE PRECISA SABER DISSO ──
     *
     * `RegistrationSummaryRow` descreve o que se ESPERA da resposta, e o
     * `as unknown as` abaixo o impoe sem conferir. A string de `select` nao passa por
     * typecheck nenhum: tirar uma coluna dali deixa `tsc --noEmit` em zero, deixa a
     * suite do vitest verde (ela usa store falso) e faz o campo chegar `undefined`
     * ao template, calado. `services/**` nem sequer e coletado pelo
     * `vitest.config.ts`.
     *
     * E a mesma armadilha da allowlist do `toRow` no admin, e a rede contra ela nao
     * mora aqui. Sao TRES -- a terceira chegou na T5b --, e nenhuma sozinha bastava:
     *
     *  1. `scripts/test-email-outbox.sh`, cenario "as seis colunas do resumo voltam
     *     preenchidas pelo PostgREST": faz esta MESMA leitura contra o banco de
     *     verdade -- PostgREST, chave do service_role, o mesmo embed aninhado -- e
     *     confere que as seis voltam. MEDIDO: tirando `is_waitlist` de la, o
     *     cenario fica vermelho (`sim|nao|sim|sim|sim|sim`).
     *  2. `features/email/service-wiring.test.ts`: le ESTE arquivo e AQUELE script
     *     como texto e confere que os dois pedem a mesma lista. Sem ela, o `select`
     *     do script era uma COPIA que ninguem conferia -- coluna acrescentada so
     *     aqui ficaria sem prova nenhuma, com o script verde provando as seis
     *     velhas. MEDIDO: tirando `is_waitlist` da linha de baixo, `tsc --noEmit`
     *     fica em ZERO e a suite inteira acende UMA assertiva, a dela.
     *  3. `services/email-outbox.contract.ts` ("da a cada inscricao o resumo da
     *     SUA inscricao"): faz esta leitura pelo cliente de verdade e confere os
     *     seis CAMPOS ja traduzidos, em DUAS inscricoes. E a unica das tres que
     *     passa pelo caminho inteiro -- select, embed do PostgREST e
     *     `summariesById` --; as outras duas veem cada uma so um pedaco.
     *
     * ── E A TRADUCAO NAO MORA MAIS AQUI ──
     *
     * `summariesById` / `summaryFromRow` (features/email/summary-row.ts) sao quem
     * poe cada coluna no seu campo e quem indexa o mapa, e estao la porque AQUI
     * nao ha rede -- `services/**` nao e coletado pelo vitest.
     *
     * MEDIDO, com as traducoes neste arquivo: `isWaitlist: !linha.is_waitlist`,
     * a troca de `contactEmail` por `playerEmail` e a chave fixa
     * (`mapa.set(registrationIds[0], ...)`) passavam pelos quatro portoes
     * inteiros. A varredura de juntas da terceira rodada achou OITO juntas nuas
     * no caminho `linha do banco -> e-mail enviado`, e SEIS eram os seis metodos
     * deste store; as dezesseis de `features/**` e `lib/**` estavam presas.
     */
    async loadSummaries(registrationIds) {
      if (registrationIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("championship_registrations")
        .select(
          "id, is_waitlist, contact_email, championships(name), players(email, name, preferred_position)",
        )
        .in("id", registrationIds);
      if (error) throw new Error(`leitura dos resumos falhou: ${error.message}`);
      return summariesById((data ?? []) as unknown as RegistrationSummaryRow[]);
    },

    async markSent(id, providerMessageId, at) {
      await atualizar(supabase, id, sentColumns(providerMessageId, at));
    },

    async requeue(id, attempts, nextAttemptAt, lastError) {
      await atualizar(supabase, id, requeueColumns(attempts, nextAttemptAt, lastError));
    },

    async defer(id) {
      await atualizar(supabase, id, deferColumns());
    },

    async markFailedPermanent(id, lastError) {
      await atualizar(supabase, id, failedPermanentColumns(lastError));
    },
  };
}

async function atualizar(
  supabase: SupabaseClient,
  id: string,
  campos: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("email_outbox").update(campos).eq("id", id);
  // Estourar em vez de engolir: uma gravacao perdida aqui deixa a linha em
  // 'sending' com o e-mail JA ENVIADO, e o recolhimento a mandaria de novo
  // passados os 30 minutos do limite. Esse numero e o `interval '30 minutes'`
  // de claim_email_outbox_batch (migration 20260823040000) -- nao ha constante
  // ligando os dois, e mudar la nao muda esta frase.
  if (error) throw new Error(`gravacao da linha ${id} falhou: ${error.message}`);
}

export type RunDrainOptions = {
  now: Date;
  /**
   * A montagem do corpo. O padrao e `renderEmail`
   * (features/email/render.ts) -- ha template desde a T5, e o stub que recusava
   * toda linha saiu do repo junto.
   *
   * Continua sendo ARGUMENTO, e nao constante, porque e a unica junta por onde
   * um teste de ponta a ponta poderia trocar o texto sem tocar no dreno.
   */
  render?: EmailRenderer;
  batchSize?: number;
  dailyQuota?: number;
};

/**
 * Um disparo do dreno.
 *
 * O instante e ARGUMENTO e nunca `new Date()` la dentro. Vem de cicatriz:
 * `scripts/test-registration-slots.sh` nao tem relogio injetavel -- as funcoes
 * que ele exercita chamam `is_sabbath(now())` --, entao durante a pausa de
 * sabado toda reserva e todo commit devolvem `sabbath` e a suite fica
 * inutilizavel. Um portao cego 24 horas por semana.
 *
 * Na data deste arquivo ninguem chama esta funcao: nao ha rota de cron. Ela e o
 * ponto de entrada que essa rota vai usar.
 */
export async function runOutboxDrain(options: RunDrainOptions): Promise<DrainReport> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME;
  if (!apiKey || !fromEmail || !fromName) {
    throw new Error("Faltam BREVO_API_KEY, EMAIL_FROM ou EMAIL_FROM_NAME");
  }

  const supabase = createAdminClient();
  return drainOutbox({
    store: createSupabaseOutboxStore(supabase),
    send: createBrevoSender({ apiKey, fromEmail, fromName }),
    render: options.render ?? renderEmail,
    // Nao existe registro de descadastro neste repo -- nem tabela, nem coluna.
    // A pergunta ja e feita pelo dreno, e a resposta de hoje e sempre "nao".
    // Trocar isto por uma consulta e o unico ponto que precisa mudar quando o
    // registro existir.
    isOptedOut: async () => false,
    now: options.now,
    // `siteUrlFrom` devolve null em vez de palpite, e null faz o dreno ADIAR em
    // vez de mandar link para o ambiente errado.
    siteUrl: siteUrlFrom(process.env.NEXT_PUBLIC_SITE_URL),
    organizerEmail: process.env.ORGANIZER_EMAIL ?? null,
    batchSize: options.batchSize,
    dailyQuota: options.dailyQuota,
  });
}
