import { describe, it, expect } from "vitest";
import {
  markPaymentVerifiedPatch,
  paymentCheckView,
  PAYMENT_CHECK_CONFIRM,
  PAYMENT_CHECK_LABEL_PENDING,
  PAYMENT_CHECK_LABEL_VERIFIED,
} from "./payment-check";

describe("paymentCheckView", () => {
  it("conferido: mostra o estado e nao oferece mais clique", () => {
    expect(paymentCheckView({ paymentVerified: true })).toEqual({
      verified: true,
      label: PAYMENT_CHECK_LABEL_VERIFIED,
      canMark: false,
    });
  });

  it("nao conferido: oferece marcar", () => {
    expect(paymentCheckView({ paymentVerified: false })).toEqual({
      verified: false,
      label: PAYMENT_CHECK_LABEL_PENDING,
      canMark: true,
    });
  });

  it("AUSENTE e NULO contam como nao conferido, nunca como conferido", () => {
    // ── A ASSERTIVA QUE SE PAGA ──
    //
    // `payment_verified` e `boolean NOT NULL DEFAULT false` no banco, mas
    // `payment_verified?: boolean` em `types/registration.ts`, e a string de
    // `select()` do PostgREST nao passa por typecheck nenhum. Esquecer a coluna
    // no `select` faz o campo chegar `undefined` -- sem erro, sem sintoma.
    //
    // Falhar para "conferido" nesse caso mostraria TODA inscricao como
    // conferida e o admin nunca marcaria ninguem -- ninguem receberia o aviso,
    // e a tela pareceria certa. Falhar para "nao conferido" so custa um clique
    // repetido, e o `WHEN` do gatilho engole clique repetido sem enfileirar.
    //
    // MUTACAO que esta assertiva prende: trocar `=== true` por `!== false` em
    // paymentCheckView. Com ela, `undefined` e `null` viram conferido, e os
    // dois casos abaixo acendem.
    for (const ausente of [undefined, null] as const) {
      const v = paymentCheckView({ paymentVerified: ausente });
      expect(v.verified, `paymentVerified=${String(ausente)}`).toBe(false);
      expect(v.canMark).toBe(true);
      expect(v.label).toBe(PAYMENT_CHECK_LABEL_PENDING);
    }
  });

  it("os dois rotulos sao DIFERENTES", () => {
    // Sem isto, um copiar-colar que deixasse os dois iguais passaria em todas
    // as assertivas de cima -- elas comparam contra as constantes, e as
    // constantes seriam a mesma string. A tela mostraria o mesmo texto nos dois
    // estados e ninguem saberia quem ja foi conferido.
    expect(PAYMENT_CHECK_LABEL_VERIFIED).not.toBe(PAYMENT_CHECK_LABEL_PENDING);
  });
});

describe("PAYMENT_CHECK_CONFIRM", () => {
  it("avisa que o e-mail sai, e que sai UMA VEZ SO", () => {
    // As duas metades importam, e a segunda e a que ninguem escreveria sozinho:
    // a `dedupe_key` e o id da inscricao e o par (kind, dedupe_key) e UNIQUE,
    // entao desmarcar e marcar de novo NAO reenvia. Um aviso que so dissesse
    // "vai mandar um e-mail" deixaria quem clica achando que da para desfazer.
    expect(PAYMENT_CHECK_CONFIRM.body).toMatch(/e-mail/i);
    expect(PAYMENT_CHECK_CONFIRM.body).toMatch(/uma vez só/i);
    expect(PAYMENT_CHECK_CONFIRM.body).toMatch(/desmarcar/i);
    expect(PAYMENT_CHECK_CONFIRM.body).toMatch(/não manda outro/i);
  });

  it("tem os tres textos que o modal precisa, e nenhum vazio", () => {
    for (const [chave, valor] of Object.entries(PAYMENT_CHECK_CONFIRM)) {
      expect(typeof valor, chave).toBe("string");
      expect(valor.trim().length, chave).toBeGreaterThan(0);
    }
  });
});

describe("markPaymentVerifiedPatch", () => {
  it("grava a coluna payment_verified, com o nome EXATO da coluna", () => {
    // A licao da allowlist do `toRow`: nome de coluna escrito a mao dentro de
    // `app/**` nao passa por typecheck -- o cliente do Supabase aceita a string
    // --, e um typo grava em lugar nenhum, calado. Aqui o typo vira vermelho.
    expect(markPaymentVerifiedPatch()).toEqual({ payment_verified: true });
    expect(Object.keys(markPaymentVerifiedPatch())).toEqual(["payment_verified"]);
  });

  it("so marca: nao existe caminho de desmarcar por aqui", () => {
    // A mao unica. Se um dia houver desmarcar, ele nao pode nascer como um
    // segundo valor deste mesmo patch -- ver o docblock de payment-check.ts:
    // desmarcar nao desfaz o e-mail.
    expect(markPaymentVerifiedPatch().payment_verified).toBe(true);
  });

  it("devolve um objeto NOVO a cada chamada", () => {
    // Se fosse uma constante compartilhada, um chamador que a mutasse
    // envenenaria todos os outros -- e o cliente do Supabase recebe este objeto
    // e pode guarda-lo.
    expect(markPaymentVerifiedPatch()).not.toBe(markPaymentVerifiedPatch());
  });
});
