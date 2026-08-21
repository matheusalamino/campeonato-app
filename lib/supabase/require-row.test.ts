import { describe, it, expect } from "vitest";
import { requireRow } from "./require-row";

/**
 * O 404 mudo.
 *
 * A pagina de inscricao lia so o `data` da consulta e descartava o `error`.
 * Quando o staging ficou duas migrations atras, o PostgREST respondeu
 * `42703: column "pix_key" does not exist`, o `data` chegou null, e o
 * `if (!champ) notFound()` concluiu "campeonato nao existe": 404 seco, sem
 * nada na tela e sem nada no log que apontasse para o schema.
 *
 * `requireRow` separa os dois casos que aquele `if` juntava — linha ausente,
 * que e 404 legitimo, e consulta que falhou, que nao e.
 */

/** O erro real que o staging devolveu, e que a pagina transformou em 404. */
const ERRO_42703 = {
  code: "42703",
  message: 'column "pix_key" does not exist',
  details: null,
  hint: null,
};

describe("requireRow", () => {
  it("devolve a linha quando a consulta achou", () => {
    const linha = { id: "fb0f4b97", slug: "champions-league-sorocaba-2026" };
    expect(requireRow({ data: linha, error: null }, "campeonato")).toBe(linha);
  });

  it("devolve null quando a consulta rodou e a linha nao existe", () => {
    // O 404 legitimo: sem erro, sem linha. Este caminho precisa continuar
    // devolvendo null, ou o slug errado passaria a estourar erro no lugar de
    // cair no notFound().
    expect(requireRow({ data: null, error: null }, "campeonato")).toBeNull();
  });

  it("lanca quando a consulta falhou, em vez de fingir linha ausente", () => {
    expect(() => requireRow({ data: null, error: ERRO_42703 }, "campeonato")).toThrow();
  });

  it("o erro lancado diz o que quebrou, com o codigo do Postgres", () => {
    // Sem isto o log continuaria mudo: o objetivo do conserto nao e so parar
    // de responder 404, e dizer no log qual coluna faltou.
    let capturado: unknown;
    try {
      requireRow({ data: null, error: ERRO_42703 }, "campeonato");
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeInstanceOf(Error);
    const msg = (capturado as Error).message;
    expect(msg).toContain("campeonato");
    expect(msg).toContain("42703");
    expect(msg).toContain('column "pix_key" does not exist');
    // O objeto original viaja junto, para quem inspeciona alem da mensagem.
    expect((capturado as Error).cause).toBe(ERRO_42703);
  });

  it("o erro tem precedencia sobre o data", () => {
    // Defensivo: o supabase-js nao devolve os dois preenchidos, mas ler o
    // `data` primeiro faria uma resposta parcial passar por consulta boa.
    expect(() =>
      requireRow({ data: { id: "parcial" }, error: ERRO_42703 }, "campeonato"),
    ).toThrow("42703");
  });

  it("um erro sem code ainda lanca, e a mensagem sobrevive", () => {
    // Nem toda falha vem do Postgres: queda de rede chega sem `code`, e
    // interpolar um `undefined` na mensagem nao pode virar o motivo do erro.
    expect(() =>
      requireRow({ data: null, error: { message: "fetch failed" } }, "campeonato"),
    ).toThrow("fetch failed");
    try {
      requireRow({ data: null, error: { message: "fetch failed" } }, "campeonato");
    } catch (e) {
      expect((e as Error).message).not.toContain("undefined");
    }
  });
});
