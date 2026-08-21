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
  it("o formato de hoje: 8 times de 10 dao 80 vagas, 8 de goleiro e 72 de linha", () => {
    expect(derivedCapacity({
      teamsCount: 8, playersPerTeam: 10, goalkeepersPerTeam: 1,
      waitlistGoalkeepers: 1, waitlistOutfield: 4,
    })).toEqual({ total: 80, goalkeepers: 8, outfield: 72, waitlistTotal: 5 });
  });

  it("mudar o numero de times reajusta tudo, sem ninguem digitar", () => {
    const dez = derivedCapacity({
      teamsCount: 10, playersPerTeam: 10, goalkeepersPerTeam: 1,
      waitlistGoalkeepers: 1, waitlistOutfield: 4,
    });
    expect(dez.total).toBe(100);
    expect(dez.goalkeepers).toBe(10);
    expect(dez.outfield).toBe(90);
  });

  it("campeonato sem cota de goleiro poe todas as vagas na linha", () => {
    const r = derivedCapacity({
      teamsCount: 8, playersPerTeam: 10, goalkeepersPerTeam: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 5,
    });
    expect(r).toEqual({ total: 80, goalkeepers: 0, outfield: 80, waitlistTotal: 5 });
  });

  it("goleiros nunca passam do total: linha nao pode ficar negativa", () => {
    const r = derivedCapacity({
      teamsCount: 8, playersPerTeam: 10, goalkeepersPerTeam: 11,
      waitlistGoalkeepers: 0, waitlistOutfield: 0,
    });
    expect(r.outfield).toBe(0);
    expect(r.goalkeepers).toBe(80);
  });

  it("zero times fecha tudo, em vez de abrir tudo", () => {
    expect(derivedCapacity({
      teamsCount: 0, playersPerTeam: 10, goalkeepersPerTeam: 1,
      waitlistGoalkeepers: 0, waitlistOutfield: 0,
    })).toEqual({ total: 0, goalkeepers: 0, outfield: 0, waitlistTotal: 0 });
  });

  it("sem formato nao ha fila: a espera fecha junto, mesmo configurada", () => {
    expect(derivedCapacity({
      teamsCount: 0, playersPerTeam: 10, goalkeepersPerTeam: 1,
      waitlistGoalkeepers: 1, waitlistOutfield: 4,
    })).toEqual({ total: 0, goalkeepers: 0, outfield: 0, waitlistTotal: 0 });
  });

  it("numero negativo do admin fecha, em vez de inventar vaga", () => {
    expect(derivedCapacity({
      teamsCount: 8, playersPerTeam: 10, goalkeepersPerTeam: -1,
      waitlistGoalkeepers: -1, waitlistOutfield: -4,
    })).toEqual({ total: 80, goalkeepers: 0, outfield: 80, waitlistTotal: 0 });

    expect(derivedCapacity({
      teamsCount: -8, playersPerTeam: 10, goalkeepersPerTeam: 1,
      waitlistGoalkeepers: 1, waitlistOutfield: 4,
    })).toEqual({ total: 0, goalkeepers: 0, outfield: 0, waitlistTotal: 0 });
  });
});
