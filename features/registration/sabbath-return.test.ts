import { describe, it, expect } from "vitest";
import { announceableEndsAt } from "./sabbath-return";

/**
 * A blindagem do dia da semana da tela de repouso.
 *
 * O usuario pediu esta guarda a partir de um screenshot em que a tela anunciava
 * "quinta-feira" — o dia da semana e a unica parte do texto que pode contradizer
 * a razao de a pausa existir.
 *
 * Prova nas DUAS direcoes de proposito. So testar "sabado passa" deixaria a
 * guarda invertida viva; so testar "quinta nao passa" deixaria viva a guarda que
 * recusa tudo. As duas mutacoes existem e as duas quebram a tela.
 */
describe("announceableEndsAt", () => {
  // Todos os instantes abaixo estao em UTC, com a hora de Brasilia no
  // comentario. A suite roda com TZ=UTC (ver vitest.config.ts), entao qualquer
  // leitura por fuso da MAQUINA seria UTC — e e exatamente o que a guarda nao
  // pode fazer.

  it("anuncia o fim de uma janela real, que cai num sabado", () => {
    // 2026-08-22 17:55:58 em Brasilia — o por do sol gravado em sabbath_windows.
    const real = "2026-08-22T20:55:58.000Z";
    expect(announceableEndsAt(real)).toBe(real);
  });

  it("anuncia o fim da regra conservadora, sabado as 20h30", () => {
    // 2026-08-22 20:30 em Brasilia.
    const conservador = "2026-08-22T23:30:00.000Z";
    expect(announceableEndsAt(conservador)).toBe(conservador);
  });

  /**
   * O caso que separa `brasiliaParts` de `getUTCDay()`, e o unico que separa.
   *
   * Nenhuma das 178 janelas reais chega aqui hoje — todas terminam antes das
   * 22h01 UTC —, entao esta e a assercao que transforma "risco latente" em
   * regressao pega. Sem ela, trocar a leitura por `getUTCDay()` passa verde.
   */
  it("anuncia um por do sol de sabado que ja e domingo em UTC", () => {
    // 2026-08-22 21:00 em Brasilia = 2026-08-23 00:00 UTC, um domingo em UTC.
    const cruzaMeiaNoite = "2026-08-23T00:00:00.000Z";
    expect(new Date(cruzaMeiaNoite).getUTCDay()).toBe(0); // domingo, se lido em UTC
    expect(announceableEndsAt(cruzaMeiaNoite)).toBe(cruzaMeiaNoite);
  });

  it("recusa sexta, quinta e domingo", () => {
    // Sexta 2026-08-21 17:55 / quinta 2026-08-20 17:55 / domingo 2026-08-23 17:55,
    // todos em Brasilia.
    expect(announceableEndsAt("2026-08-21T20:55:00.000Z")).toBeNull();
    expect(announceableEndsAt("2026-08-20T20:55:00.000Z")).toBeNull();
    expect(announceableEndsAt("2026-08-23T20:55:00.000Z")).toBeNull();
  });

  it("recusa um sabado que ja virou sexta em Brasilia", () => {
    // 2026-08-22 01:00 UTC e sabado em UTC, mas sexta 22h em Brasilia. O espelho
    // do caso da meia-noite, para o outro lado.
    const sabadoSoEmUtc = "2026-08-22T01:00:00.000Z";
    expect(new Date(sabadoSoEmUtc).getUTCDay()).toBe(6); // sabado, se lido em UTC
    expect(announceableEndsAt(sabadoSoEmUtc)).toBeNull();
  });

  it("recusa ausencia e lixo, sem lancar", () => {
    expect(announceableEndsAt(null)).toBeNull();
    expect(announceableEndsAt("")).toBeNull();
    // `brasiliaParts` lanca com Date invalido; a guarda precisa barrar antes.
    expect(() => announceableEndsAt("nao e uma data")).not.toThrow();
    expect(announceableEndsAt("nao e uma data")).toBeNull();
  });
});
