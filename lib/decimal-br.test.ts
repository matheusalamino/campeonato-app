import { describe, it, expect } from "vitest";
import { parseDecimalBR } from "./decimal-br";

describe("parseDecimalBR", () => {
  it("aceita a virgula que o teclado brasileiro oferece", () => {
    expect(parseDecimalBR("70,5")).toBe(70.5);
    expect(parseDecimalBR("1,80")).toBe(1.8);
  });

  it("aceita ponto, para quem digita no padrao ingles", () => {
    expect(parseDecimalBR("70.5")).toBe(70.5);
  });

  it("aceita inteiro sem separador", () => {
    expect(parseDecimalBR("70")).toBe(70);
  });

  it("descarta o ponto de milhar quando ha virgula decimal", () => {
    expect(parseDecimalBR("1.234,5")).toBe(1234.5);
  });

  it("passa numero adiante sem mexer", () => {
    expect(parseDecimalBR(70.5)).toBe(70.5);
  });

  it("devolve null para o que nao e numero", () => {
    expect(parseDecimalBR("")).toBeNull();
    expect(parseDecimalBR("   ")).toBeNull();
    expect(parseDecimalBR("abc")).toBeNull();
    expect(parseDecimalBR(null)).toBeNull();
    expect(parseDecimalBR(undefined)).toBeNull();
    expect(parseDecimalBR(NaN)).toBeNull();
  });
});
