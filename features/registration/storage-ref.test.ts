import { describe, it, expect } from "vitest";
import { storagePathFromRef } from "./storage-ref";

const FOTOS = "registration-photos" as const;
const DOCS = "registration-docs" as const;

describe("storagePathFromRef", () => {
  it("extrai o caminho de uma URL publica do bucket de fotos", () => {
    const url = "http://127.0.0.1:55321/storage/v1/object/public/registration-photos/abc.jpg";

    expect(storagePathFromRef(url, FOTOS)).toBe("abc.jpg");
  });

  it("extrai o caminho da referencia bucket/path dos documentos", () => {
    expect(storagePathFromRef("registration-docs/recibo.pdf", DOCS)).toBe("recibo.pdf");
  });

  it("recusa uma referencia que aponta para outro bucket", () => {
    const url = "http://127.0.0.1:55321/storage/v1/object/public/registration-photos/abc.jpg";

    expect(storagePathFromRef(url, DOCS)).toBeNull();
    expect(storagePathFromRef("registration-photos/abc.jpg", DOCS)).toBeNull();
  });

  it("recusa tentativa de escapar do bucket com ..", () => {
    expect(storagePathFromRef("registration-docs/../registration-photos/x.jpg", DOCS)).toBeNull();
    expect(
      storagePathFromRef(
        "http://h/storage/v1/object/public/registration-photos/../outro/x.jpg",
        FOTOS,
      ),
    ).toBeNull();
  });

  it("recusa referencia vazia ou sem caminho apos o bucket", () => {
    expect(storagePathFromRef("", FOTOS)).toBeNull();
    expect(storagePathFromRef("registration-docs/", DOCS)).toBeNull();
    expect(storagePathFromRef("http://h/storage/v1/object/public/registration-photos/", FOTOS))
      .toBeNull();
  });

  it("recusa uma referencia que nao casa com nenhum formato conhecido", () => {
    expect(storagePathFromRef("/etc/passwd", FOTOS)).toBeNull();
    expect(storagePathFromRef("https://exemplo.com/foto.jpg", FOTOS)).toBeNull();
  });

  it("preserva subpastas dentro do bucket", () => {
    expect(storagePathFromRef("registration-docs/2026/recibo.pdf", DOCS)).toBe("2026/recibo.pdf");
  });
});
