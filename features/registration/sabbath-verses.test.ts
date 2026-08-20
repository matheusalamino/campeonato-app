import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { SABBATH_VERSES, verseForSabbath } from "./sabbath-verses";

const em = (iso: string) => new Date(iso);

describe("SABBATH_VERSES", () => {
  it("tem os dez versiculos levantados com o usuario", () => {
    expect(SABBATH_VERSES).toHaveLength(10);
  });

  it("nao tem referencia repetida", () => {
    const refs = SABBATH_VERSES.map((v) => v.reference);
    expect(new Set(refs).size).toBe(10);
  });
});

describe("a integridade dos dez textos", () => {
  /**
   * Impressao digital do conteudo conferido com o usuario.
   *
   * Os dez vao para a tela de repouso de uma comunidade adventista, e nada mais
   * na suite olha o que esta escrito neles: sem isto, um `sed` largo, um merge
   * mal resolvido ou um "corrigir a acentuacao" bem-intencionado troca palavra
   * de versiculo e passa verde.
   *
   * Hash, e nao uma copia dourada dos dez aqui no teste, por dois motivos: uma
   * segunda copia dobraria a superficie de erro de transcricao, e um `sed` sobre
   * `features/registration/*.ts` pegaria as duas — mas nao recalcula um hash.
   *
   * QUANDO QUEBRAR: nao atualize o numero primeiro. Confira se a mudanca foi de
   * proposito, confira o texto novo contra a fonte com o usuario, e so entao
   * recalcule. O hash nao substitui essa conferencia — ele pega a alteracao
   * acidental; quem recalcular sem conferir passa verde do mesmo jeito.
   */
  const IMPRESSAO_DIGITAL = "c4a4fc981750ce6572a9e915ff0ae3f3ee1a453810e6719d737aacbb7c12d262";

  it("bate com a impressao digital do conteudo conferido", () => {
    const canonico = SABBATH_VERSES.map((v) => `${v.reference}\n${v.text}`).join("\n");
    expect(
      createHash("sha256").update(canonico, "utf8").digest("hex"),
      "o conteudo dos versiculos mudou; confira contra a fonte antes de atualizar o numero",
    ).toBe(IMPRESSAO_DIGITAL);
  });

  // As tres abaixo nao acrescentam garantia sobre o hash: existem para DIZER o
  // que quebrou, porque um hash diferente sozinho nao aponta nada.

  it("mantem toda referencia no formato Livro capitulo:versiculo", () => {
    // Aceita as tres formas que o canone tem, e nao so a dos dez de hoje:
    // "Atos 16:13", "1 Corintios 16:2" e "Cantares de Salomao 2:1". Estreitar
    // no formato simples faria um decimo primeiro versiculo de Corintios
    // falhar aqui, longe da causa.
    for (const v of SABBATH_VERSES) {
      expect(v.reference).toMatch(/^(?:[123] )?\p{Lu}\p{L}+(?: \p{L}+)* \d+:\d+(?:-\d+)?$/u);
    }
  });

  it("mantem a acentuacao dos cinco livros que a tem", () => {
    // Exodo duas vezes, Genesis, Isaias e Levitico. Perder um acento aqui e o
    // sintoma de alguem ter passado a lista por um normalizador de ASCII.
    const acentuadas = SABBATH_VERSES.filter((v) => /[^\x20-\x7E]/.test(v.reference));
    expect(acentuadas.map((v) => v.reference)).toHaveLength(5);
  });

  it("mantem a acentuacao e o corpo dos dez textos", () => {
    for (const v of SABBATH_VERSES) {
      expect(v.text).toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
      // 60 e piso contra truncamento, nao medida de nada: o mais curto hoje e
      // Hebreus 4:9, com 62 caracteres.
      expect(v.text.length).toBeGreaterThanOrEqual(60);
    }
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

  it("le o dia em Brasilia, e nao em UTC, na quinta a noite", () => {
    // 27/08/2026, quinta, 22h em Brasilia — em UTC ja e sexta, 28/08. E a unica
    // janela do calendario em que o fuso muda a resposta: as duas leituras caem
    // em semanas diferentes. O `rest` e ligavel a mao num feriado, e ali a
    // quinta a noite tem que continuar na semana do sabado que passou.
    const quintaTarde = verseForSabbath(em("2026-08-28T01:00:00.000Z"));
    expect(quintaTarde).toEqual(verseForSabbath(em("2026-08-22T20:50:00.000Z")));
    expect(quintaTarde).not.toEqual(verseForSabbath(em("2026-08-28T21:00:00.000Z")));
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
