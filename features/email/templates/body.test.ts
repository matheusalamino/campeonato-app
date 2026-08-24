import { describe, it, expect } from "vitest";
import { assuntoCom, corpoDe, saudacao } from "./body";

/**
 * As pecas partilhadas pelos templates. Elas tem teste proprio, e nao so o
 * indireto pelos dois e-mails, porque sao o unico lugar do repo que escapa HTML
 * -- nao ha React aqui para fazer isso sozinho, e um furo aqui vaza para TODO
 * e-mail que sair.
 */

describe("o escape de HTML, pela superficie que o usa", () => {
  // As assertivas batem em `corpoDe`, e nao no `escapeHtml` direto, DE
  // PROPOSITO. MEDIDO: com o teste chamando a peca interna, tirar o
  // `escapeHtml(p.link)` de `corpoDe` ficava verde nos quatro portoes -- a peca
  // continuava certa e ninguem a chamava para o link. Teste que fura para a
  // peca interna deixa de provar a montagem.
  const html = (texto: string) => corpoDe([{ texto }]).html;

  it("fecha os cinco caracteres que viram marcacao", () => {
    expect(html("<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html("a & b")).toContain("a &amp; b");
    expect(html('aspas "duplas" e \'simples\'')).toContain(
      "aspas &quot;duplas&quot; e &#39;simples&#39;",
    );
  });

  it("escapa o `&` primeiro, ou o escape sai escapado duas vezes", () => {
    // A ordem das cinco trocas nao e livre: com `&` por ultimo, o `&lt;` recem
    // produzido viraria `&amp;lt;` e o leitor veria `&lt;` na tela.
    expect(html("<")).toContain("&lt;");
    expect(html("&lt;")).toContain("&amp;lt;");
  });

  it("escapa o LINK, e nao so o texto do paragrafo", () => {
    // O link entra em DOIS lugares do HTML: dentro do atributo `href` e como
    // texto visivel da ancora. Um `"` cru no href FECHA o atributo, e dali para
    // frente o que vier vira marcacao -- e o link e o unico campo deste corpo
    // que a T6 vai montar a partir de um token.
    //
    // Os dois links dos outros testes nao tem caractere especial nenhum, entao
    // sem ESTE caso remover o `escapeHtml(p.link)` de `corpoDe` fica verde.
    const link = 'https://x.test/verify-email?token=a&nome="b"';
    const { html: h, text } = corpoDe([{ texto: "veja:", link }]);

    expect(h).toContain("token=a&amp;nome=&quot;b&quot;");
    expect(h).not.toContain('&nome="b"');
    // O texto puro nao e marcacao: la o endereco sai clicavel como ele e.
    expect(text).toContain(link);
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
  // As assertivas de HTML aqui sao FROUXAS em espaco e em aspas de atributo, e
  // isso e deliberado: reindentar a marcacao e trocar `"` por `'` num atributo
  // nao muda o que o leitor ve. MEDIDO -- com `toContain` da cadeia exata, a
  // mutacao no-op de reindentacao (a que existe para provar que estas
  // assertivas mordem COMPORTAMENTO, e nao formatacao) reprovava este arquivo.
  // Falso vermelho e o que desliga uma rede.
  //
  // O que elas NAO afrouxam e a ORDEM e a ESTRUTURA: um paragrafo por entrada,
  // na ordem da lista, e a ancora com a URL por extenso dentro.
  it("monta os dois corpos a partir da mesma lista", () => {
    const { html, text } = corpoDe([{ texto: "um" }, { texto: "dois" }]);

    expect(html).toMatch(/<p>\s*um\s*<\/p>\s*<p>\s*dois\s*<\/p>/);
    expect(text).toBe("um\n\ndois");
  });

  it("mostra o endereco por extenso nos dois corpos", () => {
    // Ancora com rotulo ("clique aqui") deixaria o texto puro sem link nenhum:
    // la nao ha ancora, so o que estiver escrito.
    const { html, text } = corpoDe([{ texto: "veja:", link: "https://x.test/a" }]);

    expect(html).toMatch(
      /<a href=["']https:\/\/x\.test\/a["']>\s*https:\/\/x\.test\/a\s*<\/a>/,
    );
    expect(text).toBe("veja:\nhttps://x.test/a");
  });

  it("nao emite ancora nenhuma quando o paragrafo nao tem link", () => {
    const { html } = corpoDe([{ texto: "sem link" }]);

    expect(html).not.toMatch(/href=/i);
    expect(html).not.toContain("<a");
  });
});
