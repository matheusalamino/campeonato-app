import { describe, it, expect } from "vitest";
import { brasiliaInputToIso, isoToBrasiliaInput, brasiliaParts, CHAMPIONSHIP_TIME_ZONE } from "./datetime-br";

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

  it("aceita segundos e os ignora, porque step=\"1\" no input os emite", () => {
    expect(brasiliaInputToIso("2026-08-12T00:00:30")).toBe("2026-08-12T03:00:00.000Z");
  });

  it("recusa um ISO completo em vez de casar so o prefixo", () => {
    // Sem o `$` no regex, isto casaria "2026-08-12T03:00" e devolveria um
    // instante deslocado 3h em vez de recusar — o caso de chamar esta
    // funcao com o ISO que `isoToBrasiliaInput` deveria ter recebido.
    expect(brasiliaInputToIso("2026-08-12T03:00:00.000Z")).toBeUndefined();
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
    // Este assert sozinho so prende o valor da constante — nao pega alguem
    // trocando `timeZone: CHAMPIONSHIP_TIME_ZONE` por `undefined` dentro de
    // zoneOffsetMinutes, porque a constante em si continuaria intacta. Quem
    // pega essa troca e o `TZ: "UTC"` fixado em vitest.config.ts: como UTC e
    // America/Sao_Paulo tem offsets diferentes, "usar o fuso local" erra por
    // 3h e os testes acima falham, em qualquer maquina que rode a suite —
    // nao so na de quem mora fora de Sao Paulo.
    expect(CHAMPIONSHIP_TIME_ZONE).toBe("America/Sao_Paulo");
  });
});

describe("brasiliaParts", () => {
  it("le a data, o minuto do dia e o dia da semana em Brasilia", () => {
    // 21/08/2026 e uma sexta. 20:00Z sao 17:00 em Brasilia.
    expect(brasiliaParts(new Date("2026-08-21T20:00:00.000Z")))
      .toEqual({ date: "2026-08-21", minutes: 17 * 60, dow: 5 });
  });

  it("nao vira o dia junto com o UTC", () => {
    // 22/08 as 02:00Z ainda e 21/08, 23h, em Brasilia — e ainda e sexta. Sem o
    // fuso, este caso viraria sabado e a regra conservadora mudaria de lado.
    expect(brasiliaParts(new Date("2026-08-22T02:00:00.000Z")))
      .toEqual({ date: "2026-08-21", minutes: 23 * 60, dow: 5 });
  });

  it("conta o sabado como 6 e o domingo como 0", () => {
    expect(brasiliaParts(new Date("2026-08-22T22:00:00.000Z")).dow).toBe(6);
    expect(brasiliaParts(new Date("2026-08-23T22:00:00.000Z")).dow).toBe(0);
  });
});
