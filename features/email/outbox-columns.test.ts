import { describe, it, expect } from "vitest";
import {
  deferColumns,
  failedPermanentColumns,
  outboxRowFrom,
  outboxRowsFrom,
  requeueColumns,
  sentColumns,
  type ClaimedOutboxRow,
} from "./outbox-columns";

/**
 * ── O QUE ESTAS ASSERTIVAS SAO, E O QUE ELAS DE PROPOSITO NAO SAO ──
 *
 * Elas NAO repetem os objetos campo a campo. Um teste assim seria detector de
 * mudanca: o codigo escrito duas vezes, verde em qualquer mutacao que mexesse
 * nos dois lados, e vermelho em toda edicao inocente.
 *
 * O que elas prendem sao os INVARIANTES que os comentarios do modulo afirmam --
 * o que cada gravacao PODE e NAO PODE tocar. Cada um deles tem um dano
 * concreto escrito junto, e nenhum deles tem sintoma de tipo.
 */

const CLAIMED: ClaimedOutboxRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "registration_committed",
  dedupe_key: "99999999-9999-4999-8999-999999999999",
  payload: { registration_id: "99999999-9999-4999-8999-999999999999" },
  attempts: 2,
};

const AGORA = new Date("2026-08-24T12:00:00.000Z");

describe("outboxRowFrom", () => {
  it("nao troca o id da linha pela chave de deduplicacao", () => {
    // Os dois sao `string` e o `tsc` nao ve diferenca. MEDIDO com o mapeamento
    // no servico: a troca passava os quatro portoes.
    //
    // O dano: `row.id` e o que volta em markSent/requeue/defer. Uma dedupe_key
    // no lugar dele faz o UPDATE nao casar linha nenhuma -- e um UPDATE que nao
    // casa nada e um UPDATE bem-sucedido. A linha fica em `sending`, o
    // recolhimento a repesca em 30 minutos, e o MESMO e-mail sai de novo a cada
    // disparo do cron.
    const row = outboxRowFrom(CLAIMED);

    expect(row.id).toBe(CLAIMED.id);
    expect(row.dedupeKey).toBe(CLAIMED.dedupe_key);
    expect(row.id).not.toBe(row.dedupeKey);
  });

  it("leva kind, payload e attempts sem mexer", () => {
    const row = outboxRowFrom(CLAIMED);

    expect(row.kind).toBe("registration_committed");
    expect(row.payload).toEqual({ registration_id: CLAIMED.dedupe_key });
    expect(row.attempts).toBe(2);
  });

  it("troca payload nulo por objeto vazio, e nao por undefined", () => {
    // `registrationIdFrom` faz `row.payload?.["registration_id"]`; um payload
    // undefined ali viraria linha morta por "sem destinatario" -- motivo errado
    // para o defeito certo.
    expect(outboxRowFrom({ ...CLAIMED, payload: null }).payload).toEqual({});
  });

  it("preserva a ordem do lote", () => {
    // A ordem vem do `ORDER BY next_attempt_at, created_at` da RPC, e o dreno
    // conta com ela para a cota parar no lugar certo quando o teto e atingido
    // no meio do lote.
    const b = { ...CLAIMED, id: "22222222-2222-4222-8222-222222222222" };

    expect(outboxRowsFrom([CLAIMED, b]).map((r) => r.id)).toEqual([CLAIMED.id, b.id]);
  });
});

describe("as colunas de cada gravacao", () => {
  it("sucesso carimba o envio e limpa o erro", () => {
    const cols = sentColumns("mid-1", AGORA);

    expect(cols.status).toBe("sent");
    expect(cols.provider_message_id).toBe("mid-1");
    expect(cols.sent_at).toBe(AGORA.toISOString());
    // Erro velho tem de sair: linha entregue com `last_error` preenchido manda
    // quem depura procurar falha num envio que deu certo.
    expect(cols.last_error).toBeNull();
    // Estado terminal GUARDA o carimbo do claim -- ver o docblock de
    // markFailedPermanent em outbox.ts.
    expect(cols).not.toHaveProperty("claimed_at");
  });

  it("a reentrega solta a linha e gasta o degrau que recebeu", () => {
    const proxima = new Date("2026-08-24T12:05:00.000Z");
    const cols = requeueColumns(3, proxima, "500 boom");

    expect(cols.status).toBe("pending");
    expect(cols.attempts).toBe(3);
    expect(cols.next_attempt_at).toBe(proxima.toISOString());
    expect(cols.last_error).toBe("500 boom");
    // Volta para a fila ZERA o carimbo: linha pendente nao esta na mao de
    // ninguem, e o carimbo velho confundiria o recolhimento.
    expect(cols.claimed_at).toBeNull();
  });

  it("o adiamento NAO gasta degrau da escada", () => {
    // O invariante que se paga. Sabado, cota, base de link e template faltando
    // nao sao falha DESTA linha: gastar degrau com eles empurraria para 12 horas
    // de espera um e-mail que so precisava do proximo disparo do cron.
    //
    // MEDIDO com este objeto no servico: acrescentar `attempts` a ele passava os
    // quatro portoes.
    const cols = deferColumns();

    expect(cols.status).toBe("pending");
    expect(cols.claimed_at).toBeNull();
    expect(cols).not.toHaveProperty("attempts");
    expect(cols).not.toHaveProperty("next_attempt_at");
  });

  it("a morte definitiva nao se disfarca de envio", () => {
    // Duas coisas, e as duas custam caro se sairem erradas:
    //  - `status` 'sent' faria a linha morta contar como entregue;
    //  - `sent_at` preenchido gastaria cota do dia por e-mail que ninguem
    //    recebeu (a contagem le status='sent' AND sent_at >= inicio do dia).
    const cols = failedPermanentColumns("400 endereco invalido");

    expect(cols.status).toBe("failed_permanent");
    expect(cols.last_error).toBe("400 endereco invalido");
    expect(cols.sent_at).toBeNull();
  });

  it("so a volta para a fila zera o carimbo do claim", () => {
    // A leitura uniforme das quatro gravacoes, num lugar so: terminal GUARDA o
    // carimbo, volta para a fila ZERA. Sem esta assertiva a regra existia so em
    // prosa, espalhada por quatro docblocks.
    expect(sentColumns("m", AGORA)).not.toHaveProperty("claimed_at");
    expect(failedPermanentColumns("e")).not.toHaveProperty("claimed_at");
    expect(requeueColumns(1, AGORA, "e").claimed_at).toBeNull();
    expect(deferColumns().claimed_at).toBeNull();
  });
});
