import { describe, it, expect } from "vitest";
import { remainingUntil, formatRemaining } from "./countdown";

const ALVO = "2026-08-12T03:00:00.000Z";
const menos = (ms: number) => new Date(Date.parse(ALVO) - ms);

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe("remainingUntil", () => {
  it("quebra o tempo restante em dias, horas e minutos", () => {
    expect(remainingUntil(ALVO, menos(3 * DIA + 14 * HORA + 22 * MIN)))
      .toEqual({ days: 3, hours: 14, minutes: 22, done: false });
  });

  it("marca done no instante do alvo", () => {
    expect(remainingUntil(ALVO, new Date(ALVO)).done).toBe(true);
  });

  it("marca done depois do alvo, sem numero negativo", () => {
    const r = remainingUntil(ALVO, new Date(Date.parse(ALVO) + DIA));
    expect(r).toEqual({ days: 0, hours: 0, minutes: 0, done: true });
  });

  it("alvo ilegivel conta como ja vencido, em vez de NaN na tela", () => {
    expect(remainingUntil("banana", menos(DIA)).done).toBe(true);
  });
});

describe("formatRemaining", () => {
  it("escreve as tres unidades quando ha dias", () => {
    expect(formatRemaining({ days: 3, hours: 14, minutes: 22, done: false }))
      .toBe("faltam 3d 14h 22m");
  });

  it("omite os dias quando nao ha, para nao poluir com zero", () => {
    expect(formatRemaining({ days: 0, hours: 2, minutes: 5, done: false }))
      .toBe("faltam 2h 5m");
  });

  it("no ultimo trecho fala so de minutos", () => {
    expect(formatRemaining({ days: 0, hours: 0, minutes: 7, done: false }))
      .toBe("faltam 7m");
  });

  it("abaixo de um minuto nao mostra zero", () => {
    expect(formatRemaining({ days: 0, hours: 0, minutes: 0, done: false }))
      .toBe("falta menos de 1 minuto");
  });

  it("vencido nao tem o que contar", () => {
    expect(formatRemaining({ days: 0, hours: 0, minutes: 0, done: true })).toBe("");
  });
});
