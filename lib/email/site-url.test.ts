import { describe, it, expect } from "vitest";
import { siteUrlFrom, linkTo } from "./site-url";

describe("siteUrlFrom", () => {
  it("aceita uma base https e tira a barra final", () => {
    expect(siteUrlFrom("https://cls.exemplo.com/")).toBe("https://cls.exemplo.com");
  });

  it("recusa quando a variavel nao existe", () => {
    // Sem base nao se monta link, e link quebrado num comprovante e pior que
    // comprovante atrasado: o dreno segura a fila ate alguem configurar.
    expect(siteUrlFrom(undefined)).toBeNull();
    expect(siteUrlFrom("")).toBeNull();
  });

  it("recusa o que nao e URL absoluta", () => {
    expect(siteUrlFrom("cls.exemplo.com")).toBeNull();
    expect(siteUrlFrom("/inscrever")).toBeNull();
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
