import { describe, it, expect } from "vitest";
import {
  isSabbath, sabbathEndsAt, sabbathStartsAt, sunsetAlert, sabbathView,
  type SabbathWindow,
} from "./sabbath";

/** 21/08/2026 e uma sexta; 22/08 um sabado. Por do sol ficticio as 17h50. */
const JANELA: SabbathWindow = {
  startsAt: "2026-08-21T20:50:00.000Z", // sexta 17h50 em Brasilia
  endsAt: "2026-08-22T20:51:00.000Z",   // sabado 17h51
};

const em = (iso: string) => new Date(iso);

describe("isSabbath com a janela da tabela", () => {
  it("pausa no instante exato do inicio", () => {
    expect(isSabbath(em(JANELA.startsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo antes do inicio", () => {
    expect(isSabbath(em("2026-08-21T20:49:59.999Z"), JANELA)).toBe(false);
  });

  it("ainda pausa no instante exato do fim", () => {
    expect(isSabbath(em(JANELA.endsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo depois do fim", () => {
    expect(isSabbath(em("2026-08-22T20:51:00.001Z"), JANELA)).toBe(false);
  });

  it("NAO cai na regra conservadora quando a janela e futura", () => {
    /*
     * O erro mais facil deste modulo. Sexta as 17h30 em Brasilia, com a tabela
     * funcionando e o por do sol as 17h50: faltam vinte minutos, e o site tem
     * que continuar aberto. Ler `window` como "a linha que cobre agora" e cair
     * na regra conservadora quando ela nao cobre pausaria TODA sexta as 17h,
     * para sempre, mesmo com a tabela perfeita.
     */
    expect(isSabbath(em("2026-08-21T20:30:00.000Z"), JANELA)).toBe(false);
  });
});

describe("isSabbath sem janela — a regra conservadora", () => {
  it("nao pausa na sexta as 16h59", () => {
    expect(isSabbath(em("2026-08-21T19:59:00.000Z"), null)).toBe(false);
  });

  it("pausa na sexta as 17h em ponto", () => {
    expect(isSabbath(em("2026-08-21T20:00:00.000Z"), null)).toBe(true);
  });

  it("pausa na madrugada de sabado", () => {
    expect(isSabbath(em("2026-08-22T05:00:00.000Z"), null)).toBe(true);
  });

  it("ainda pausa no sabado as 20h30 em ponto", () => {
    expect(isSabbath(em("2026-08-22T23:30:00.000Z"), null)).toBe(true);
  });

  it("nao pausa no sabado as 20h31", () => {
    expect(isSabbath(em("2026-08-22T23:31:00.000Z"), null)).toBe(false);
  });

  it("ainda pausa as 19h02 de um sabado de janeiro, quando o sol se poe 19h01", () => {
    // O caso que tirou o corte das 19h. Sem ele, alguem "arruma" a constante de
    // volta e o ramo conservador passa a errar contra a observancia — em dez
    // sabados por decada, calado.
    expect(isSabbath(em("2029-01-13T22:02:00.000Z"), null)).toBe(true);
  });

  it("ainda pausa sob horario de verao, quando o por do sol marca 20h01", () => {
    // 12/01/2019 foi sabado, e o Brasil estava em horario de verao. Este
    // instante — a mesma hora UTC do por do sol de sabado mais tardio da tabela
    // — le 20:01:47 no relogio de parede, contra 19:01:47 sem DST. Com o corte
    // em 19h30 este caso devolveria false: a pausa encerrada 31 min antes do
    // sol se por. As bordas acima tambem quebram se alguem voltar para 19h30,
    // mas so por repetirem o numero da constante; este e o unico que quebra
    // por causa de um por do sol real.
    expect(isSabbath(em("2019-01-12T22:01:47.000Z"), null)).toBe(true);
  });

  it("nao pausa nos outros dias, a qualquer hora", () => {
    // Quarta 18h, domingo 18h, quinta 23h — todos em Brasilia.
    expect(isSabbath(em("2026-08-19T21:00:00.000Z"), null)).toBe(false);
    expect(isSabbath(em("2026-08-23T21:00:00.000Z"), null)).toBe(false);
    expect(isSabbath(em("2026-08-21T02:00:00.000Z"), null)).toBe(false);
  });
});

describe("sabbathEndsAt", () => {
  it("com janela, devolve o fim da janela", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), JANELA)).toBe(JANELA.endsAt);
  });

  it("sem janela, numa sexta, aponta as 20h30 do sabado seguinte", () => {
    expect(sabbathEndsAt(em("2026-08-21T20:30:00.000Z"), null))
      .toBe("2026-08-22T23:30:00.000Z");
  });

  it("sem janela, num sabado, aponta as 20h30 do mesmo dia", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), null))
      .toBe("2026-08-22T23:30:00.000Z");
  });

  it("sem janela, numa sexta que vira o mes, aponta o sabado do mes seguinte", () => {
    // 31/07/2026 e uma sexta. Isto prende a SAIDA da virada de mes, nao a
    // implementacao: trocar `addDays` por aritmetica de texto passaria aqui,
    // porque "2026-07-32" NAO e recusado — o regex de `brasiliaInputToIso`
    // aceita \d{2} e o `Date.UTC` normaliza para 1o de agosto. Verificado; nao
    // conte com uma recusa que nao existe.
    expect(sabbathEndsAt(em("2026-07-31T20:30:00.000Z"), null))
      .toBe("2026-08-01T23:30:00.000Z");
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

describe("janela podre — cai na regra conservadora, nunca em 'nao e sabado'", () => {
  const PODRE: SabbathWindow = { startsAt: "banana", endsAt: "banana" };
  /** So a ponta final podrida: prende a guarda em `||`, que um `&&` afrouxaria. */
  const MEIO_PODRE: SabbathWindow = { startsAt: JANELA.startsAt, endsAt: "banana" };
  /** As pontas de JANELA trocadas — o que um mapeamento manual produz. */
  const INVERTIDA: SabbathWindow = { startsAt: JANELA.endsAt, endsAt: JANELA.startsAt };
  const SABADO_2H = "2026-08-22T05:00:00.000Z";

  it("pausa num sabado, em vez de abrir a inscricao", () => {
    // Comparar com NaN e sempre falso, entao sem a guarda `t >= NaN && t <= NaN`
    // da false — "nao e sabado" — e a inscricao ABRIRIA no sabado. E a unica
    // direcao que esta feature nao pode errar.
    expect(isSabbath(em(SABADO_2H), PODRE)).toBe(true);
  });

  it("pausa tambem quando so uma das pontas esta podre", () => {
    expect(isSabbath(em(SABADO_2H), MEIO_PODRE)).toBe(true);
  });

  it("sabbathEndsAt nao entrega a string podre para a tela", () => {
    expect(sabbathEndsAt(em(SABADO_2H), PODRE)).toBe("2026-08-22T23:30:00.000Z");
  });

  it("sabbathStartsAt nao entrega a string podre para a tela", () => {
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), PODRE))
      .toBe("2026-08-21T20:00:00.000Z");
  });

  it("pausa com a janela INVERTIDA, que o typecheck nao pega", () => {
    /*
     * Mesma forma do caso podre, uma casa ao lado: com as pontas trocadas
     * nenhum instante satisfaz `t >= start && t <= end`, entao sem a guarda a
     * resposta seria "nao e sabado" e a inscricao abriria. O CHECK do banco
     * fecha a origem; a porta que sobra e o mapeamento manual de quem consome,
     * onde `starts_at` e `ends_at` sao dois `string` e a troca e invisivel.
     */
    expect(isSabbath(em(SABADO_2H), INVERTIDA)).toBe(true);
  });

  it("nao entrega os instantes trocados para a tela", () => {
    // Sem a guarda, `sabbathEndsAt` devolveria um instante ANTERIOR ao inicio.
    expect(sabbathEndsAt(em(SABADO_2H), INVERTIDA)).toBe("2026-08-22T23:30:00.000Z");
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), INVERTIDA))
      .toBe("2026-08-21T20:00:00.000Z");
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

/*
 * A pagina nao decide nada sozinha, e estes testes sao a razao.
 *
 * As tres expressoes que montavam esta decisao viviam no Server Component, que
 * a suite nao alcanca: quatro mutacoes passavam no `tsc` E nos testes. A pior
 * — usar o fim do sabado sem antes perguntar se e sabado — devolvia `rest` para
 * todo campeonato, em qualquer dia, e matava a inscricao em definitivo.
 */
describe("sabbathView — a decisao da pagina num lugar so", () => {
  it("pausado: entrega o fim da pausa e CALA o por do sol", () => {
    // O sunsetAt null e a invariante. Quem ja esta pausado ve a tela de
    // repouso, com a contagem do FIM; avisar do por do sol que ja passou seria
    // contar a hora errada.
    expect(sabbathView(em("2026-08-22T05:00:00.000Z"), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("nao pausado com janela futura: sem pausa, e com o por do sol da janela", () => {
    // Sexta 17h30 em Brasilia, vinte minutos antes do por do sol.
    expect(sabbathView(em("2026-08-21T20:30:00.000Z"), JANELA))
      .toEqual({ pause: null, sunsetAt: JANELA.startsAt });
  });

  it("no instante exato do inicio ja pausa, e o por do sol some", () => {
    expect(sabbathView(em(JANELA.startsAt), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("no instante exato do fim ainda pausa", () => {
    expect(sabbathView(em(JANELA.endsAt), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("uma janela VENCIDA devolve um inicio no passado — o filtro da consulta e que impede", () => {
    /*
     * Nao e alcancavel em producao, e vale saber por que: `getSabbathWindow`
     * filtra `ends_at >= now`, entao uma janela vencida nunca chega aqui.
     *
     * Esta assercao existe para nomear o UNICO ponto em que este modulo ainda
     * depende daquele filtro. Com uma janela vencida o `sunsetAt` aponta para
     * tras, e `sunsetAlert` responderia "cutoff" para sempre — o bloco de
     * pagamento sumiria do formulario e nunca mais voltaria. Quem mexer no
     * filtro da consulta quebra isto aqui, e nao la.
     */
    expect(sabbathView(em("2026-08-22T20:51:00.001Z"), JANELA))
      .toEqual({ pause: null, sunsetAt: JANELA.startsAt });
  });

  it("sem janela, num dia comum: nao pausa e nao ha o que avisar", () => {
    // Terca, 18/08/2026.
    expect(sabbathView(em("2026-08-18T15:00:00.000Z"), null))
      .toEqual({ pause: null, sunsetAt: null });
  });

  it("sem janela, numa sexta de manha: a regra conservadora sabe o inicio", () => {
    // Sexta 10h em Brasilia; o fallback comeca as 17h = 20h UTC.
    expect(sabbathView(em("2026-08-21T13:00:00.000Z"), null))
      .toEqual({ pause: null, sunsetAt: "2026-08-21T20:00:00.000Z" });
  });

  it("sem janela, num sabado de manha: a regra conservadora pausa ate 20h30", () => {
    // Sabado 02h em Brasilia; o fallback termina as 20h30 = 23h30 UTC.
    expect(sabbathView(em("2026-08-22T05:00:00.000Z"), null))
      .toEqual({ pause: { endsAt: "2026-08-22T23:30:00.000Z" }, sunsetAt: null });
  });

  it("janela podre pausa pela regra conservadora, e nao vaza o inicio podre", () => {
    // Invertida: `parseWindow` recusa, e o sabado a noite cai no fallback.
    const invertida: SabbathWindow = { startsAt: JANELA.endsAt, endsAt: JANELA.startsAt };
    expect(sabbathView(em("2026-08-22T05:00:00.000Z"), invertida))
      .toEqual({ pause: { endsAt: "2026-08-22T23:30:00.000Z" }, sunsetAt: null });
  });
});
