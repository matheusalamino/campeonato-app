import { describe, it, expect } from "vitest";
import { summarizeErrors } from "./error-summary";

describe("summarizeErrors", () => {
  it("com um erro so, repete a mensagem do campo — e a informacao mais util", () => {
    expect(summarizeErrors({ weight: "Peso inválido" })).toBe("Peso inválido");
  });

  it("com varios, diz quantos faltam em vez de escolher um", () => {
    expect(summarizeErrors({ name: "Nome é obrigatório", email: "E-mail inválido" }))
      .toBe("Confira os 2 campos destacados");
    expect(summarizeErrors({ a: "x", b: "y", c: "z" })).toBe("Confira os 3 campos destacados");
  });

  it("sem erro nenhum, nao tem o que dizer", () => {
    expect(summarizeErrors({})).toBe("");
  });
});
