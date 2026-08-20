import { describe, it, expect } from "vitest";
import { canOpenStep, isSlotVerdict, type SlotReservation } from "./slot";
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
