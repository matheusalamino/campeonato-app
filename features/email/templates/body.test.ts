import { describe, it, expect } from "vitest";
import { assuntoCom, corpoDe, escapeHtml, saudacao } from "./body";

/**
 * As pecas partilhadas pelos templates. Elas tem teste proprio, e nao so o
 * indireto pelos dois e-mails, porque sao o unico lugar do repo que escapa HTML
 * -- nao ha React aqui para fazer isso sozinho, e um furo aqui vaza para TODO
 * e-mail que sair.
 */

describe("escapeHtml", () => {
  it("fecha os cinco caracteres que viram marcacao", () => {
    expect(escapeHtml("<b>x</b>")).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml('aspas "duplas" e \'simples\'')).toBe(
      "aspas &quot;duplas&quot; e &#39;simples&#39;",
    );
  });

  it("escapa o `&` primeiro, ou o escape sai escapado duas vezes", () => {
    // A ordem das cinco trocas nao e livre: com `&` por ultimo, o `&lt;` recem
    // produzido viraria `&amp;lt;` e o leitor veria `&lt;` na tela.
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("saudacao", () => {
  it("trata pelo nome quando ha nome", () => {
    expect(saudacao("Fulano")).toBe("Olá, Fulano!");
  });

  it("nao deixa vocativo vazio quando nao ha nome", () => {
    // `players.name` chega da coluna, e a string vazia e tao ausente quanto o
    // nulo -- `Olá, !` sairia dos dois.
    expect(saudacao(null)).toBe("Olá!");
    expect(saudacao("")).toBe("Olá!");
  });
});

describe("assuntoCom", () => {
  it("junta com travessao quando ha sufixo", () => {
    expect(assuntoCom("Inscrição confirmada", "Copa")).toBe("Inscrição confirmada — Copa");
  });

  it("nao deixa o travessao pendurado quando nao ha sufixo", () => {
    expect(assuntoCom("Inscrição confirmada", null)).toBe("Inscrição confirmada");
    expect(assuntoCom("Inscrição confirmada", "")).toBe("Inscrição confirmada");
  });
});

describe("corpoDe", () => {
  it("monta os dois corpos a partir da mesma lista", () => {
    const { html, text } = corpoDe([{ texto: "um" }, { texto: "dois" }]);

    expect(html).toContain("<p>um</p><p>dois</p>");
    expect(text).toBe("um\n\ndois");
  });

  it("mostra o endereco por extenso nos dois corpos", () => {
    // Ancora com rotulo ("clique aqui") deixaria o texto puro sem link nenhum:
    // la nao ha ancora, so o que estiver escrito.
    const { html, text } = corpoDe([{ texto: "veja:", link: "https://x.test/a" }]);

    expect(html).toContain('<a href="https://x.test/a">https://x.test/a</a>');
    expect(text).toBe("veja:\nhttps://x.test/a");
  });

  it("nao emite ancora nenhuma quando o paragrafo nao tem link", () => {
    const { html } = corpoDe([{ texto: "sem link" }]);

    expect(html).not.toMatch(/href=/i);
    expect(html).not.toContain("<a");
  });
});
