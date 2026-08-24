import { describe, it, expect } from "vitest";
import { derivedCapacity, shouldCloseForCapacity } from "./capacity";

describe("shouldCloseForCapacity", () => {
  const base = { status: "subscribing" as const, maxPlayers: 20, maxWaitlist: 5 };

  it("closes when registrations reach players + waitlist", () => {
    expect(shouldCloseForCapacity({ ...base, registrationCount: 25 })).toBe(true);
  });
  it("does not close below capacity", () => {
    expect(shouldCloseForCapacity({ ...base, registrationCount: 24 })).toBe(false);
  });
  it("does nothing when status is not subscribing", () => {
    expect(
      shouldCloseForCapacity({ ...base, status: "draft", registrationCount: 99 }),
    ).toBe(false);
  });
  it("does nothing when maxPlayers is null", () => {
    expect(
      shouldCloseForCapacity({
        status: "subscribing",
        maxPlayers: null,
        maxWaitlist: 0,
        registrationCount: 99,
      }),
    ).toBe(false);
  });
  it("treats null waitlist as zero", () => {
    expect(
      shouldCloseForCapacity({
        status: "subscribing",
        maxPlayers: 10,
        maxWaitlist: null,
        registrationCount: 10,
      }),
    ).toBe(true);
  });
});

describe("derivedCapacity", () => {
  /** O formato de 2026. Os testes variam um fator por vez a partir dele. */
  const hoje = {
    teamsCount: 8, playersPerTeam: 10, goalkeepersPerTeam: 1,
    waitlistGoalkeepers: 1, waitlistOutfield: 4,
  };

  it("o formato de hoje: 8 times de 10 dao 80 vagas, 8 de goleiro e 72 de linha", () => {
    expect(derivedCapacity(hoje)).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("mudar o numero de times reajusta tudo, sem ninguem digitar", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 10 })).toEqual({
      total: 100, goalkeepers: 10, outfield: 90,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("campeonato sem cota de goleiro poe todas as vagas na linha", () => {
    expect(derivedCapacity({
      ...hoje, goalkeepersPerTeam: 0, waitlistGoalkeepers: 0, waitlistOutfield: 5,
    })).toEqual({
      total: 80, goalkeepers: 0, outfield: 80,
      waitlistGoalkeepers: 0, waitlistOutfield: 5, waitlistTotal: 5,
    });
  });

  it("goleiros nunca passam do total: linha nao pode ficar negativa", () => {
    expect(derivedCapacity({ ...hoje, goalkeepersPerTeam: 11 })).toEqual({
      total: 80, goalkeepers: 80, outfield: 0,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("cota absurda continua presa ao total, e nao vira zero goleiro", () => {
    expect(derivedCapacity({
      ...hoje, teamsCount: 3000, playersPerTeam: 10, goalkeepersPerTeam: 800000,
    })).toEqual({
      total: 30000, goalkeepers: 30000, outfield: 0,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("sem formato nao ha fila: a espera fecha junto, mesmo configurada", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 0 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("cota de goleiro negativa zera a cota, em vez de estourar a linha", () => {
    expect(derivedCapacity({ ...hoje, goalkeepersPerTeam: -1 })).toEqual({
      total: 80, goalkeepers: 0, outfield: 80,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("espera negativa zera a fila, em vez de encolher o total dela", () => {
    expect(derivedCapacity({ ...hoje, waitlistGoalkeepers: -1, waitlistOutfield: -4 })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("dois campos negativos nao se multiplicam num campeonato inteiro", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: -8, playersPerTeam: -10 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("NaN no formato fecha, em vez de virar NULL e valer ilimitado", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: Number.NaN })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("NaN na espera de goleiro zera aquele balde, e nao a fila toda", () => {
    expect(derivedCapacity({ ...hoje, waitlistGoalkeepers: Number.NaN })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 0, waitlistOutfield: 4, waitlistTotal: 4,
    });
  });

  it("NaN na espera de linha zera aquele balde, e nao a fila toda", () => {
    expect(derivedCapacity({ ...hoje, waitlistOutfield: Number.NaN })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 1, waitlistOutfield: 0, waitlistTotal: 1,
    });
  });

  it("total que nao cabe em int4 fecha, em vez de estourar a coluna", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 3000, playersPerTeam: 800000 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("fila que nao cabe em int4 fecha a fila inteira, sem mentir no total dela", () => {
    expect(derivedCapacity({ ...hoje, waitlistGoalkeepers: 2e9, waitlistOutfield: 2e9 })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("time e cota fracionarios sao chao antes de multiplicar", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 8.5, goalkeepersPerTeam: 1.5 })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("meio jogador nao existe: 3 times de 10,5 dao 30 vagas, e nao 31", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 3, playersPerTeam: 10.5 })).toEqual({
      total: 30, goalkeepers: 3, outfield: 27,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });
});
