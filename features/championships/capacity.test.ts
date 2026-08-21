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
  /** O formato de 2026, que os testes abaixo variam um fator por vez. */
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

  it("zero times fecha tudo, em vez de abrir tudo", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 0, waitlistGoalkeepers: 0, waitlistOutfield: 0 }))
      .toEqual({
        total: 0, goalkeepers: 0, outfield: 0,
        waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
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

  it("numero de times negativo fecha o campeonato", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: -8 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("dois campos negativos nao se multiplicam num campeonato inteiro", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: -8, playersPerTeam: -10 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("campo vazio no admin fecha, em vez de virar NULL no banco", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: Number.NaN })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("infinito fecha, em vez de virar NaN na subtracao da linha", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: Number.POSITIVE_INFINITY })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("produto que estoura para infinito fecha, em vez de virar NaN", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 1e308, playersPerTeam: 1e308 })).toEqual({
      total: 0, goalkeepers: 0, outfield: 0,
      waitlistGoalkeepers: 0, waitlistOutfield: 0, waitlistTotal: 0,
    });
  });

  it("meio jogador nao existe: o piso vale por fator, e max_players e inteiro", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 3, playersPerTeam: 10.5 })).toEqual({
      total: 30, goalkeepers: 3, outfield: 27,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("o piso vale em cada um dos tres fatores, nao no produto", () => {
    expect(derivedCapacity({ ...hoje, teamsCount: 8.5, playersPerTeam: 10.5, goalkeepersPerTeam: 1.5 })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });

  it("fila fracionaria tambem vira inteiro", () => {
    expect(derivedCapacity({ ...hoje, waitlistGoalkeepers: 1.9, waitlistOutfield: 4.9 })).toEqual({
      total: 80, goalkeepers: 8, outfield: 72,
      waitlistGoalkeepers: 1, waitlistOutfield: 4, waitlistTotal: 5,
    });
  });
});
