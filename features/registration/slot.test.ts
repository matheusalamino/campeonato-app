import { describe, it, expect } from "vitest";
import {
  canOpenStep,
  isSlotVerdict,
  paymentGate,
  reservationFromRpc,
  type SimpleRefusalReason,
  type SlotReservation,
} from "./slot";
import type { SunsetAlert } from "./sabbath";
import { PAYMENT_STEP, UNIFORM_STEP } from "./field-steps";

const RESERVADA: SlotReservation = {
  ok: true,
  isWaitlist: false,
  expiresAt: "2026-08-19T12:00:00.000Z",
};
const ESGOTOU: SlotReservation = { ok: false, reason: "full" };
const FALHOU: SlotReservation = { ok: false, reason: "error" };
const SABADO: SlotReservation = { ok: false, reason: "sabbath" };

/** Quem chegou ao passo da revisao concluiu todos os anteriores. */
const TUDO_FEITO = { 1: true, 2: true, 4: true, 5: true, 6: true };

describe("canOpenStep", () => {
  it("nao bloqueia antes do CPF, quando nao ha veredito nenhum", () => {
    expect(canOpenStep(6, null, {})).toBe(true);
  });

  it("com a vaga reservada, libera qualquer passo", () => {
    expect(canOpenStep(6, RESERVADA, {})).toBe(true);
    expect(canOpenStep(7, RESERVADA, {})).toBe(true);
  });

  it("com a reserva recusada, fecha o passo do pagamento", () => {
    expect(canOpenStep(PAYMENT_STEP, ESGOTOU, {})).toBe(false);
  });

  it("com a reserva recusada, fecha tambem os passos do meio", () => {
    expect(canOpenStep(2, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(3, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(4, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(UNIFORM_STEP, ESGOTOU, {})).toBe(false);
  });

  it("com a pausa do sabado, fecha o pagamento e os passos do meio", () => {
    // A pausa e veredito do servidor, nao soluco de rede: durante ela nem a
    // reserva nem o commit passam. Abrir o pagamento aqui levaria o jogador a
    // pagar o PIX por uma inscricao que a RPC vai recusar de qualquer jeito — o
    // mesmo dano que esta guarda existe para evitar, so que sem nem a desculpa
    // de a lotacao ter enchido.
    expect(canOpenStep(PAYMENT_STEP, SABADO, {})).toBe(false);
    expect(canOpenStep(2, SABADO, {})).toBe(false);
    expect(canOpenStep(UNIFORM_STEP, SABADO, {})).toBe(false);
    // Com `done` vazio as duas linhas de cima nao distinguem "nunca reabre o
    // pagamento" de "este passo nao esta concluido". Esta distingue.
    expect(canOpenStep(PAYMENT_STEP, SABADO, { [PAYMENT_STEP]: true })).toBe(false);
  });

  it("na pausa, o passo do CPF continua aberto: fecha-lo trancaria o jogador por 24h", () => {
    // A pausa e a unica recusa que dura um dia inteiro, e o passo do CPF e a
    // unica porta de volta — e dele que sai uma reserva nova. Fechado aqui, e
    // com `done` vazio, NAO SOBRA passo abrivel nenhum: o acordeao inteiro fica
    // trancado ate o por do sol de sabado para quem nao recarregar a pagina.
    // Sem esta linha, um `reservation.reason !== "sabbath"` no lugar do `true`
    // passa nos tres portoes.
    expect(canOpenStep(1, SABADO, {})).toBe(true);
  });

  it("mantem o passo do CPF aberto, senao a falha de rede prende para sempre", () => {
    expect(canOpenStep(1, FALHOU, {})).toBe(true);
  });

  it("deixa fechar o passo que esta aberto", () => {
    expect(canOpenStep(0, ESGOTOU, {})).toBe(true);
  });

  it("deixa reler um passo ja concluido", () => {
    expect(canOpenStep(4, ESGOTOU, { 4: true })).toBe(true);
    expect(canOpenStep(UNIFORM_STEP, ESGOTOU, { [UNIFORM_STEP]: true })).toBe(true);
  });

  it("nao reabre o pagamento nem depois de concluido", () => {
    // `done` no pagamento nao prova que houve pagamento: o schema do cliente
    // deixa o comprovante opcional, entao quem clicou em "Revisar" de maos
    // vazias tambem chega aqui marcado. Reabrir levaria esse jogador a pagar o
    // PIX sem vaga e depois esbarrar no envio, que segue fechado.
    expect(canOpenStep(PAYMENT_STEP, ESGOTOU, { [PAYMENT_STEP]: true })).toBe(false);
  });

  it("a excecao do pagamento nao vira bloqueio geral", () => {
    // A regra dos concluidos continua valendo em todos os outros passos.
    expect(canOpenStep(2, ESGOTOU, TUDO_FEITO)).toBe(true);
    expect(canOpenStep(4, ESGOTOU, TUDO_FEITO)).toBe(true);
    expect(canOpenStep(UNIFORM_STEP, ESGOTOU, TUDO_FEITO)).toBe(true);
    expect(canOpenStep(PAYMENT_STEP, ESGOTOU, TUDO_FEITO)).toBe(false);
  });

  it("com a vaga reservada, o pagamento concluido reabre normalmente", () => {
    // A excecao e da reserva recusada; quem tem vaga navega como antes.
    expect(canOpenStep(PAYMENT_STEP, RESERVADA, { [PAYMENT_STEP]: true })).toBe(true);
  });

  it("nunca libera o envio, mesmo com todos os passos concluidos", () => {
    // O passo 7 nao entra em `done` (o wizard passa `done={false}`), entao a
    // regra dos concluidos nao lhe abre a porta.
    expect(canOpenStep(7, ESGOTOU, TUDO_FEITO)).toBe(false);
  });
});

describe("isSlotVerdict", () => {
  it("falha de chamada nao derruba a reserva viva", () => {
    // `error` e a chamada que nao completou. Numa batida de fundo ele pintaria a
    // faixa de vermelho e trancaria o pagamento com a vaga intacta no servidor.
    expect(isSlotVerdict(FALHOU)).toBe(false);
  });

  it("reserva boa e veredito, e substitui a anterior", () => {
    expect(isSlotVerdict(RESERVADA)).toBe(true);
  });

  it("a pausa do sabado derruba a reserva viva, ao contrario da falha", () => {
    // Quem recebe `sabbath` esta preenchendo no instante do por do sol e leva a
    // recusa pelo heartbeat, sem ter tocado em nada — do mesmo jeito que leva um
    // `error`. Chegam pela mesma porta e precisam de respostas opostas: `error`
    // nao sabe se ha vaga e nao pode derrubar reserva boa nenhuma; a pausa e
    // resposta do servidor, e depois dela a reserva nao e mais renovada.
    expect(isSlotVerdict(SABADO)).toBe(true);
    expect(isSlotVerdict(FALHOU)).toBe(false);
  });

  it("recusa de verdade derruba: e para isso que a reserva existe", () => {
    expect(isSlotVerdict(ESGOTOU)).toBe(true);
    expect(isSlotVerdict({ ok: false, reason: "all_reserved", retryAt: null })).toBe(true);
    expect(isSlotVerdict({ ok: false, reason: "not_open" })).toBe(true);
    expect(isSlotVerdict({ ok: false, reason: "not_found" })).toBe(true);
    expect(isSlotVerdict({ ok: false, reason: "already_registered" })).toBe(true);
  });
});

/**
 * O gatilho do pagamento, com os dois motivos que o desligam.
 *
 * Era uma expressao solta no wizard, e o unico teste possivel de la procurava
 * pedaco de texto: `(...) || true` passava, e um parenteses movido tambem.
 * Aqui a regra e chamavel, entao afrouxa-la nao tem como passar calado.
 */
describe("paymentGate", () => {
  const CALADO: SunsetAlert = { level: "none" };
  const AVISO: SunsetAlert = { level: "notice", at: "2026-08-21T20:50:00.000Z" };
  const CORTE: SunsetAlert = { level: "cutoff", at: "2026-08-21T20:50:00.000Z" };

  it("antes do CPF, sem veredito e sem sol, o pagamento aparece", () => {
    expect(paymentGate(null, CALADO)).toEqual({ open: true });
  });

  it("com a vaga reservada e o sol longe, o pagamento aparece", () => {
    expect(paymentGate(RESERVADA, CALADO)).toEqual({ open: true });
  });

  it("o AVISO de trinta minutos nao fecha nada", () => {
    // Fechar em "notice" custaria trinta minutos de pagamento por semana a quem
    // ainda tem tempo de sobra para pagar — e o aviso existe justamente para
    // dizer "se for pagar, pague agora".
    expect(paymentGate(null, AVISO)).toEqual({ open: true });
    expect(paymentGate(RESERVADA, AVISO)).toEqual({ open: true });
  });

  it("o CORTE fecha, e a razao e o sol", () => {
    // Dez minutos e tempo insuficiente para trocar para o app do banco, pagar,
    // tirar print e subir: quem comeca agora paga e e recusado.
    expect(paymentGate(null, CORTE)).toEqual({ open: false, reason: "sunset" });
    expect(paymentGate(RESERVADA, CORTE)).toEqual({ open: false, reason: "sunset" });
  });

  it("sem vaga fecha, e a razao e a vaga", () => {
    expect(paymentGate(ESGOTOU, CALADO)).toEqual({ open: false, reason: "slot" });
    expect(paymentGate(FALHOU, CALADO)).toEqual({ open: false, reason: "slot" });
  });

  it("com os dois motivos, a VAGA e a que fala", () => {
    // Sem vaga nao ha inscricao, com ou sem sol: e a recusa mais dura, e a que
    // continua valendo depois que o sabado passar. Invertida a ordem, quem
    // perdeu a vaga leria que e so esperar o por do sol e voltar.
    expect(paymentGate(ESGOTOU, CORTE)).toEqual({ open: false, reason: "slot" });
  });
});

/**
 * A traducao da resposta da RPC — o elo em que `sabbath` deixa de ser texto do
 * Postgres e passa a ser tipo que a tela conhece.
 *
 * Ela morava em `services/public-registration.ts`, e la NADA a segurava: o
 * arquivo inteiro tem zero assertivas, porque `vitest.config.ts` inclui
 * `lib/**`, `features/**` e `scripts/**` — e nao `services/**`.
 *
 * A config e o que fecha a porta HOJE, e nao o `import "server-only"`: MEDIDO,
 * um alias de `server-only` para `next/dist/compiled/server-only/empty.js` mais
 * `services/**` no `include` faz um teste escrito la rodar. Quem quiser tentar,
 * tente — o que espera do outro lado e o motivo de verdade: toda funcao
 * exportada do servico monta o cliente do Supabase la dentro
 * (`createAdminClient()`, `createClient()`), entao a primeira assertiva sobre
 * COMPORTAMENTO comeca dublando o banco. Essa obra esta adiada de proposito, e
 * enquanto durar a traducao coberta aqui custa nada e vale tudo.
 *
 * O que sobrou de fiacao no servico — a chamada e o `error ? null : data` — tem
 * rede propria em service-wiring.test.ts, lida como texto.
 *
 * O que passava verde com ela invisivel: dobrar `sabbath` em `error` — e ai a
 * faixa convida a "tentar novamente em instantes" durante 24h de pausa —, tirar
 * a anotacao `Record<...>` junto com a chave, e trocar o `Object.hasOwn` por
 * `in`.
 */
describe("reservationFromRpc", () => {
  it("a pausa do sabado atravessa com o nome dela", () => {
    // O elo inteiro da T9 em uma linha: dobrada em `error`, a faixa convida a
    // insistir por 24h; dobrada em `not_open`, diz a frase vaga que a tela de
    // repouso existe para substituir.
    expect(reservationFromRpc({ success: false, reason: "sabbath" })).toEqual({
      ok: false,
      reason: "sabbath",
    });
  });

  it("cada razao da RPC chega com o proprio nome", () => {
    // Em lote porque a mutacao que interessa e a mesma para todas: tirar a
    // anotacao `Record<SimpleRefusalReason, true>` junto com uma chave passa no
    // `tsc` (o type guard so fica mais estreito) e faz a razao perdida chegar na
    // tela como `error`.
    const razoes: SimpleRefusalReason[] = [
      "not_found",
      "not_open",
      "already_registered",
      "full",
      "sabbath",
    ];
    for (const reason of razoes) {
      expect(reservationFromRpc({ success: false, reason })).toEqual({ ok: false, reason });
    }
  });

  it("nome vindo do prototipo NAO e razao conhecida", () => {
    // A unica coisa que segura o `Object.hasOwn`. Com `value in RPC_REASONS`
    // todos estes passam por razao valida, e o estrago nao e "lixo com a frase
    // errada": `noticeFor` nao tem `case` para nenhum deles, cai no fim do
    // `switch` e devolve `undefined`, entao as duas regioes live saem VAZIAS — a
    // faixa desaparece inteira e o jogador fica com os passos trancados por
    // `canOpenStep` e nenhuma explicacao na tela. Nao lanca e nao deixa rastro.
    for (const reason of [
      "toString",
      "constructor",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "isPrototypeOf",
    ]) {
      expect(reservationFromRpc({ success: false, reason })).toEqual({
        ok: false,
        reason: "error",
      });
    }
  });

  it("razao que nao conhecemos e `error`, e nao um veredito inventado", () => {
    // Uma razao nova na RPC, ou uma resposta malformada. Nao ha lotacao a
    // declarar: `error` convida a tentar de novo, que e a unica resposta honesta.
    expect(reservationFromRpc({ success: false, reason: "banana" })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(reservationFromRpc({ success: false })).toEqual({ ok: false, reason: "error" });
  });

  it("`all_reserved` mantem a forma propria, com o horario da volta", () => {
    expect(reservationFromRpc({ success: false, reason: "all_reserved", retry_at: "2026-08-19T12:00:00.000Z" })).toEqual({
      ok: false,
      reason: "all_reserved",
      retryAt: "2026-08-19T12:00:00.000Z",
    });
    // Sem horario a faixa troca de frase, entao `undefined` precisa virar `null`.
    expect(reservationFromRpc({ success: false, reason: "all_reserved" })).toEqual({
      ok: false,
      reason: "all_reserved",
      retryAt: null,
    });
  });

  it("sem resposta e `error`, e nunca `not_found`", () => {
    // PostgREST fora do ar, timeout, rede. Nada disso diz se ha vaga — e
    // `not_found`, como era antes, dizia ao jogador que o campeonato esgotou.
    expect(reservationFromRpc(null)).toEqual({ ok: false, reason: "error" });
    expect(reservationFromRpc(undefined)).toEqual({ ok: false, reason: "error" });
  });

  it("a reserva boa atravessa com a lista de espera e o prazo", () => {
    expect(
      reservationFromRpc({ success: true, is_waitlist: true, expires_at: "2026-08-19T12:00:00.000Z" }),
    ).toEqual({ ok: true, isWaitlist: true, expiresAt: "2026-08-19T12:00:00.000Z" });
    expect(
      reservationFromRpc({ success: true, expires_at: "2026-08-19T12:00:00.000Z" }),
    ).toEqual({ ok: true, isWaitlist: false, expiresAt: "2026-08-19T12:00:00.000Z" });
  });
});
