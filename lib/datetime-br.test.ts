import { describe, it, expect } from "vitest";
import { brasiliaInputToIso, isoToBrasiliaInput, CHAMPIONSHIP_TIME_ZONE } from "./datetime-br";

describe("brasiliaInputToIso", () => {
  it("le o texto do input como hora de Brasilia, nao como UTC", () => {
    // Meia-noite em Brasilia e 03:00 UTC. O bug que esta funcao existe para
    // matar gravava 00:00 UTC, tres horas antes do que o admin quis dizer.
    expect(brasiliaInputToIso("2026-08-12T00:00")).toBe("2026-08-12T03:00:00.000Z");
  });

  it("converte o fim do dia, que e a borda do encerramento", () => {
    expect(brasiliaInputToIso("2026-09-27T23:59")).toBe("2026-09-28T02:59:00.000Z");
  });

  it("devolve undefined para texto vazio, para o campo opcional continuar opcional", () => {
    expect(brasiliaInputToIso("")).toBeUndefined();
  });

  it("devolve undefined para texto que nao e datetime-local", () => {
    expect(brasiliaInputToIso("12/08/2026")).toBeUndefined();
  });

  it("usa o offset de horario de verao quando o Brasil tinha (ex: jan/2018)", () => {
    // O horario de verao foi abolido por decreto em 2019, nao por lei, e pode
    // voltar do mesmo jeito. Sem este caso, a suite nunca exercita o ramo que
    // consulta o Intl: os outros 9 testes usam datas so com offset -03, entao
    // fixar zoneOffsetMinutes em -180 tambem passaria nelas.
    expect(brasiliaInputToIso("2018-01-15T00:00")).toBe("2018-01-15T02:00:00.000Z");
  });
});

describe("isoToBrasiliaInput", () => {
  it("mostra o instante em hora de Brasilia", () => {
    expect(isoToBrasiliaInput("2026-08-12T03:00:00.000Z")).toBe("2026-08-12T00:00");
  });

  it("expoe a verdade dos dados antigos, gravados como meia-noite UTC", () => {
    // Nao e bug: e o conserto aparecendo. O admin ve que a data que ele achava
    // ser 12/08 esta gravada como 21h do dia 11, e corrige.
    expect(isoToBrasiliaInput("2026-08-12T00:00:00.000Z")).toBe("2026-08-11T21:00");
  });

  it("devolve vazio para nulo e para data invalida", () => {
    expect(isoToBrasiliaInput(null)).toBe("");
    expect(isoToBrasiliaInput("banana")).toBe("");
  });
});

describe("ida e volta", () => {
  it("sobrevive ao ciclo completo", () => {
    const original = "2026-10-03T19:30";
    expect(isoToBrasiliaInput(brasiliaInputToIso(original)!)).toBe(original);
  });

  it("o fuso e o do campeonato, nao o da maquina que roda o teste", () => {
    // Sentinela: se alguem trocar por `undefined` para "usar o fuso local", os
    // testes acima passariam na maquina de um dev em Sao Paulo e quebrariam no
    // servidor, que roda em UTC.
    expect(CHAMPIONSHIP_TIME_ZONE).toBe("America/Sao_Paulo");
  });
});
