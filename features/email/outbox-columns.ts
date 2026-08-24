import type { OutboxRow } from "./outbox";

/**
 * As traducoes entre a LINHA da tabela `email_outbox` e o vocabulario do dreno:
 * a leitura do claim, e os quatro conjuntos de colunas que cada gravacao poe.
 *
 * ── POR QUE ISTO SAIU DE services/email-outbox.ts ──
 *
 * Porque la nao ha rede, e a varredura de juntas desta rodada mostrou que isso
 * nao era um buraco pontual: das oito juntas NUAS achadas no caminho `linha do
 * banco -> e-mail enviado`, SEIS eram os seis metodos do store, e todas as
 * dezesseis juntas de `features/**` e `lib/**` estavam presas. A fronteira da
 * nudez era exatamente a fronteira do `include` do `vitest.config.ts`.
 *
 * Consertar caso a caso garantiria uma proxima rodada com o proximo caso. O que
 * fecha a familia e a traducao morar onde ha teste -- que e a regra que o
 * proprio `vitest.config.ts` escreve: regra em `features/**`, so a FIACAO no
 * servico.
 *
 * ── E POR QUE ESTES TESTES NAO SAO ESPELHO DO LITERAL ──
 *
 * Um teste que repetisse o objeto campo a campo seria detector de mudanca:
 * restaria o codigo escrito duas vezes, e passaria em qualquer mutacao que
 * mexesse nos dois lados. As assertivas de `outbox-columns.test.ts` prendem os
 * INVARIANTES que os comentarios daqui ja afirmavam -- o que cada gravacao pode
 * e nao pode tocar -- e nao a forma do literal.
 */

/** A linha como `claim_email_outbox_batch` a devolve. Nomes de coluna, cru. */
export type ClaimedOutboxRow = {
  id: string;
  kind: string;
  dedupe_key: string;
  payload: Record<string, unknown> | null;
  attempts: number;
};

/**
 * ── `id` E `dedupe_key` SAO OS DOIS `string`, E TROCA-LOS E CATASTROFICO ──
 *
 * MEDIDO com este mapeamento ainda no servico: a troca passava os QUATRO
 * portoes. E o dano nao e cosmetico -- `row.id` e o que volta em `markSent`,
 * `requeue` e `defer`, e uma `dedupe_key` no lugar dele faz o UPDATE nao casar
 * NENHUMA linha (a chave primaria e o `id`). A linha fica em `sending` para
 * sempre, o recolhimento a repesca depois de 30 minutos, e o MESMO e-mail sai
 * de novo a cada disparo do cron, queimando a cota de 300/dia.
 *
 * Nada disso levanta erro: o UPDATE que nao casa nada e um UPDATE bem-sucedido.
 */
export function outboxRowFrom(linha: ClaimedOutboxRow): OutboxRow {
  return {
    id: linha.id,
    kind: linha.kind,
    dedupeKey: linha.dedupe_key,
    payload: linha.payload ?? {},
    attempts: linha.attempts,
  };
}

export function outboxRowsFrom(linhas: readonly ClaimedOutboxRow[]): OutboxRow[] {
  return linhas.map(outboxRowFrom);
}

/** O que cada gravacao poe na linha. `unknown` no valor porque quem grava e o
 *  cliente do Supabase, que recebe um objeto de colunas solto. */
export type OutboxColumns = Record<string, unknown>;

/**
 * Estado terminal de sucesso.
 *
 * NAO toca `claimed_at`: estado terminal GUARDA o carimbo do claim. Essa e a
 * leitura uniforme das quatro gravacoes -- terminal guarda, volta para a fila
 * zera -- e ha assertiva sobre ela.
 */
export function sentColumns(providerMessageId: string, at: Date): OutboxColumns {
  return {
    status: "sent",
    sent_at: at.toISOString(),
    provider_message_id: providerMessageId,
    last_error: null,
  };
}

/**
 * Volta para a fila GASTANDO um degrau da escada: e para falha de envio.
 *
 * `claimed_at` volta a nulo junto com o status -- linha pendente nao esta na mao
 * de ninguem, e deixar o carimbo velho confundiria o recolhimento do que ficou
 * parado.
 */
export function requeueColumns(
  attempts: number,
  nextAttemptAt: Date,
  lastError: string,
): OutboxColumns {
  return {
    status: "pending",
    attempts,
    next_attempt_at: nextAttemptAt.toISOString(),
    last_error: lastError,
    claimed_at: null,
  };
}

/**
 * Volta para a fila SEM gastar degrau nem adiar.
 *
 * E para condicao que nao e falha DESTA linha -- sabado, cota, base de link,
 * template faltando. Por isso nao toca `attempts` nem `next_attempt_at`: gastar
 * degrau com isso empurraria para 12 horas de espera um e-mail que so precisava
 * do proximo disparo do cron. E o invariante que o teste deste arquivo prende.
 */
export function deferColumns(): OutboxColumns {
  return { status: "pending", claimed_at: null };
}

/**
 * Estado terminal de fracasso.
 *
 * `sent_at` volta a nulo: a contagem da cota diaria le
 * `status = 'sent' AND sent_at >= <inicio do dia>`, e uma linha morta com
 * carimbo de envio seria cota gasta por e-mail que ninguem recebeu.
 *
 * `claimed_at` fica como estava, igual em `sentColumns`.
 */
export function failedPermanentColumns(lastError: string): OutboxColumns {
  return {
    status: "failed_permanent",
    last_error: lastError,
    sent_at: null,
  };
}
