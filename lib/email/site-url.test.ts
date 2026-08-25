import { describe, it, expect } from "vitest";
import { siteUrlFrom, linkTo } from "./site-url";

describe("siteUrlFrom", () => {
  it("aceita uma base https e tira a barra final", () => {
    expect(siteUrlFrom("https://cls.exemplo.com/")).toBe("https://cls.exemplo.com");
  });

  it("recusa quando a variavel nao existe", () => {
    // Sem base nao se monta link, e link quebrado num comprovante e pior que
    // comprovante atrasado: o dreno vai segurar a fila ate alguem configurar.
    expect(siteUrlFrom(undefined)).toBeNull();
    expect(siteUrlFrom("")).toBeNull();
  });

  it("recusa o que nao e URL absoluta", () => {
    expect(siteUrlFrom("cls.exemplo.com")).toBeNull();
    expect(siteUrlFrom("/inscrever")).toBeNull();
  });

  it("recusa esquema que nao seja http ou https", () => {
    // `new URL("javascript:alert(1)")` nao lanca -- ela devolve origin "null",
    // que e a STRING "null" e portanto truthy. Sem este guarda, o dreno
    // montaria link em cima dela.
    expect(siteUrlFrom("javascript:alert(1)")).toBeNull();
    expect(siteUrlFrom("ftp://exemplo.com")).toBeNull();
  });

  it("descarta caminho, query e hash — a base e a origem, e so", () => {
    // Decisao deliberada: a base e a ORIGEM, entao caminho, query e hash sao
    // descartados. Nao ha `basePath` no next.config.ts hoje (conferido). Se um
    // dia houver, NADA aqui vai avisar -- esta funcao nao le o config -- e o
    // link vai sair sem o prefixo. Quem acrescentar `basePath` precisa voltar
    // aqui de proposito.
    expect(siteUrlFrom("https://cls.exemplo.com/campeonato")).toBe("https://cls.exemplo.com");
    expect(siteUrlFrom("https://cls.exemplo.com/x?a=1#b")).toBe("https://cls.exemplo.com");
  });
});

describe("linkTo", () => {
  it("junta base e caminho com uma barra so", () => {
    expect(linkTo("https://cls.exemplo.com", "/verify-email/abc"))
      .toBe("https://cls.exemplo.com/verify-email/abc");
  });

  it("nao duplica a barra quando o caminho ja comeca com uma", () => {
    expect(linkTo("https://cls.exemplo.com/", "/x")).toBe("https://cls.exemplo.com/x");
  });
});
