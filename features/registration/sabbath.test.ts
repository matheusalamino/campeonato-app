import { describe, it, expect } from "vitest";
import {
  sabbathState, sabbathEndsAt, sabbathStartsAt, sunsetAlert,
  type SabbathWindow,
} from "./sabbath";

/** 21/08/2026 e uma sexta; 22/08 um sabado. Por do sol ficticio as 17h50. */
const JANELA: SabbathWindow = {
  startsAt: "2026-08-21T20:50:00.000Z", // sexta 17h50 em Brasilia
  endsAt: "2026-08-22T20:51:00.000Z",   // sabado 17h51
};

const em = (iso: string) => new Date(iso);

describe("sabbathState com a janela da tabela", () => {
  it("pausa no instante exato do inicio", () => {
    expect(sabbathState(em(JANELA.startsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo antes do inicio", () => {
    expect(sabbathState(em("2026-08-21T20:49:59.999Z"), JANELA)).toBe(false);
  });

  it("ainda pausa no instante exato do fim", () => {
    expect(sabbathState(em(JANELA.endsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo depois do fim", () => {
    expect(sabbathState(em("2026-08-22T20:51:00.001Z"), JANELA)).toBe(false);
  });

  it("NAO cai na regra conservadora quando a janela e futura", () => {
    /*
     * O erro mais facil deste modulo. Sexta as 17h30 em Brasilia, com a tabela
     * funcionando e o por do sol as 17h50: faltam vinte minutos, e o site tem
     * que continuar aberto. Ler `window` como "a linha que cobre agora" e cair
     * na regra conservadora quando ela nao cobre pausaria TODA sexta as 17h,
     * para sempre, mesmo com a tabela perfeita.
     */
    expect(sabbathState(em("2026-08-21T20:30:00.000Z"), JANELA)).toBe(false);
  });
});

describe("sabbathState sem janela — a regra conservadora", () => {
  it("nao pausa na sexta as 16h59", () => {
    expect(sabbathState(em("2026-08-21T19:59:00.000Z"), null)).toBe(false);
  });

  it("pausa na sexta as 17h em ponto", () => {
    expect(sabbathState(em("2026-08-21T20:00:00.000Z"), null)).toBe(true);
  });

  it("pausa na madrugada de sabado", () => {
    expect(sabbathState(em("2026-08-22T05:00:00.000Z"), null)).toBe(true);
  });

  it("ainda pausa no sabado as 19h30 em ponto", () => {
    expect(sabbathState(em("2026-08-22T22:30:00.000Z"), null)).toBe(true);
  });

  it("nao pausa no sabado as 19h31", () => {
    expect(sabbathState(em("2026-08-22T22:31:00.000Z"), null)).toBe(false);
  });

  it("ainda pausa as 19h02 de um sabado de janeiro, quando o sol se poe 19h01", () => {
    // O caso que fez o corte sair de 19h para 19h30. Sem ele, alguem "arruma" a
    // constante de volta e o ramo conservador passa a errar contra a
    // observancia — em dez sabados por decada, calado.
    expect(sabbathState(em("2029-01-13T22:02:00.000Z"), null)).toBe(true);
  });

  it("nao pausa nos outros dias, a qualquer hora", () => {
    // Quarta 18h, domingo 18h, quinta 23h — todos em Brasilia.
    expect(sabbathState(em("2026-08-19T21:00:00.000Z"), null)).toBe(false);
    expect(sabbathState(em("2026-08-23T21:00:00.000Z"), null)).toBe(false);
    expect(sabbathState(em("2026-08-21T02:00:00.000Z"), null)).toBe(false);
  });
});

describe("sabbathEndsAt", () => {
  it("com janela, devolve o fim da janela", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), JANELA)).toBe(JANELA.endsAt);
  });

  it("sem janela, numa sexta, aponta as 19h30 do sabado seguinte", () => {
    expect(sabbathEndsAt(em("2026-08-21T20:30:00.000Z"), null))
      .toBe("2026-08-22T22:30:00.000Z");
  });

  it("sem janela, num sabado, aponta as 19h30 do mesmo dia", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), null))
      .toBe("2026-08-22T22:30:00.000Z");
  });

  it("sem janela, numa sexta que vira o mes, nao inventa o dia 32", () => {
    // 31/07/2026 e uma sexta. `addDays` anda pelo UTC de propriedade: somar 1
    // no texto daria "2026-07-32" e `brasiliaAt` recusaria.
    expect(sabbathEndsAt(em("2026-07-31T20:30:00.000Z"), null))
      .toBe("2026-08-01T22:30:00.000Z");
  });
});

describe("sabbathStartsAt", () => {
  it("com janela, devolve o inicio da janela", () => {
    expect(sabbathStartsAt(em("2026-08-21T18:00:00.000Z"), JANELA)).toBe(JANELA.startsAt);
  });

  it("sem janela, numa sexta, aponta as 17h do mesmo dia", () => {
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), null))
      .toBe("2026-08-21T20:00:00.000Z");
  });

  it("sem janela, fora da sexta, devolve null — nao ha o que avisar", () => {
    expect(sabbathStartsAt(em("2026-08-19T13:00:00.000Z"), null)).toBeNull();
  });
});

describe("sunsetAlert", () => {
  const inicio = JANELA.startsAt; // sexta 17h50

  it("fica calado a 31 minutos", () => {
    expect(sunsetAlert(em("2026-08-21T20:19:00.000Z"), inicio)).toBe("none");
  });

  it("avisa a 30 minutos em ponto", () => {
    expect(sunsetAlert(em("2026-08-21T20:20:00.000Z"), inicio)).toBe("notice");
  });

  it("ainda so avisa a 11 minutos", () => {
    expect(sunsetAlert(em("2026-08-21T20:39:00.000Z"), inicio)).toBe("notice");
  });

  it("corta o pagamento a 10 minutos em ponto", () => {
    // Dez minutos e tempo insuficiente para trocar para o app do banco, pagar,
    // tirar print e subir. E a porta do "pagou e foi recusado".
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), inicio)).toBe("cutoff");
  });

  it("continua cortando depois do por do sol", () => {
    expect(sunsetAlert(em("2026-08-21T21:00:00.000Z"), inicio)).toBe("cutoff");
  });

  it("fica calado sem inicio conhecido e com inicio ilegivel", () => {
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), null)).toBe("none");
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), "banana")).toBe("none");
  });
});
