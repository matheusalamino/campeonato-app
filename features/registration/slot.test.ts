import { describe, it, expect } from "vitest";
import { canOpenStep, type SlotReservation } from "./slot";

const RESERVADA: SlotReservation = {
  ok: true,
  isWaitlist: false,
  expiresAt: "2026-08-19T12:00:00.000Z",
};
const ESGOTOU: SlotReservation = { ok: false, reason: "full" };
const FALHOU: SlotReservation = { ok: false, reason: "error" };

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
    expect(canOpenStep(6, ESGOTOU, {})).toBe(false);
  });

  it("com a reserva recusada, fecha tambem os passos do meio", () => {
    expect(canOpenStep(2, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(3, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(4, ESGOTOU, {})).toBe(false);
    expect(canOpenStep(5, ESGOTOU, {})).toBe(false);
  });

  it("mantem o passo do CPF aberto, senao a falha de rede prende para sempre", () => {
    expect(canOpenStep(1, FALHOU, {})).toBe(true);
  });

  it("deixa fechar o passo que esta aberto", () => {
    expect(canOpenStep(0, ESGOTOU, {})).toBe(true);
  });

  it("deixa reler um passo ja concluido", () => {
    expect(canOpenStep(4, ESGOTOU, { 4: true })).toBe(true);
  });

  it("nunca libera o envio, mesmo com todos os passos concluidos", () => {
    // O passo 7 nao entra em `done` (o wizard passa `done={false}`), entao a
    // regra dos concluidos nao lhe abre a porta.
    expect(canOpenStep(7, ESGOTOU, TUDO_FEITO)).toBe(false);
  });
});
