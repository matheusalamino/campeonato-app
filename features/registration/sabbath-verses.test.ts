import { describe, it, expect } from "vitest";
import { SABBATH_VERSES, verseForSabbath } from "./sabbath-verses";

const em = (iso: string) => new Date(iso);

describe("SABBATH_VERSES", () => {
  it("tem os dez versiculos levantados com o usuario", () => {
    expect(SABBATH_VERSES).toHaveLength(10);
  });

  it("nao tem referencia repetida nem texto vazio", () => {
    const refs = SABBATH_VERSES.map((v) => v.reference);
    expect(new Set(refs).size).toBe(10);
    for (const v of SABBATH_VERSES) expect(v.text.length).toBeGreaterThan(20);
  });
});

describe("verseForSabbath", () => {
  it("nao troca de versiculo na virada da meia-noite do sabado", () => {
    // 21/08/2026, sexta, 23h em Brasilia -> 22/08, sabado, 00h30. Mesmo sabado.
    const sexta = verseForSabbath(em("2026-08-22T02:00:00.000Z"));
    const sabado = verseForSabbath(em("2026-08-22T03:30:00.000Z"));
    expect(sabado).toEqual(sexta);
  });

  it("mantem o mesmo versiculo do comeco ao fim do sabado", () => {
    const inicio = verseForSabbath(em("2026-08-21T21:00:00.000Z")); // sexta 18h
    const fim = verseForSabbath(em("2026-08-22T20:50:00.000Z"));    // sabado 17h50
    expect(fim).toEqual(inicio);
  });

  it("troca de uma semana para a outra", () => {
    const esta = verseForSabbath(em("2026-08-21T21:00:00.000Z"));
    const proxima = verseForSabbath(em("2026-08-28T21:00:00.000Z"));
    expect(proxima).not.toEqual(esta);
  });

  it("passa pelos dez antes de repetir", () => {
    const vistos = new Set<string>();
    for (let semana = 0; semana < 10; semana++) {
      const quando = new Date(Date.parse("2026-08-21T21:00:00.000Z") + semana * 7 * 86_400_000);
      vistos.add(verseForSabbath(quando).reference);
    }
    expect(vistos.size).toBe(10);
  });

  it("de domingo a quinta, mostra o versiculo do sabado que passou", () => {
    // O status `rest` tambem e override manual: o admin pode liga-lo num
    // feriado qualquer. Nesses dias a tela nao pode ficar sem versiculo, nem
    // trocar de versiculo a cada dia — a semana dele comeca na sexta e vai ate
    // a quinta seguinte.
    const sabado = verseForSabbath(em("2026-08-22T20:50:00.000Z"));  // sabado 17h50
    expect(verseForSabbath(em("2026-08-23T15:00:00.000Z"))).toEqual(sabado); // domingo
    expect(verseForSabbath(em("2026-08-26T15:00:00.000Z"))).toEqual(sabado); // quarta
    expect(verseForSabbath(em("2026-08-27T15:00:00.000Z"))).toEqual(sabado); // quinta
  });

  it("devolve sempre um versiculo da lista, em qualquer dia e em qualquer ano", () => {
    // Quase quatro anos de dias corridos, incluindo dias que nao sao sabado: a
    // tela nunca deve quebrar por indice fora da faixa.
    for (let dia = 0; dia < 1400; dia++) {
      const quando = new Date(Date.parse("2026-01-01T15:00:00.000Z") + dia * 86_400_000);
      expect(SABBATH_VERSES).toContainEqual(verseForSabbath(quando));
    }
  });

  it("nao quebra em datas anteriores a sexta de referencia", () => {
    // `%` de negativo devolve negativo em JavaScript, e um indice negativo
    // daria `undefined` na tela em vez de erro no teste.
    expect(SABBATH_VERSES).toContainEqual(verseForSabbath(em("1999-07-04T15:00:00.000Z")));
    expect(SABBATH_VERSES).toContainEqual(verseForSabbath(em("1969-12-25T15:00:00.000Z")));
  });
});
