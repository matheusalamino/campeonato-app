import { describe, it, expect } from "vitest";
import { SHIRT_SIZES, CUSTOM_SHIRT_SIZE } from "./shirt-sizes";

describe("SHIRT_SIZES", () => {
  it("oferece exatamente P, M, G, GG e Personalizado", () => {
    expect([...SHIRT_SIZES]).toEqual(["P", "M", "G", "GG", "Personalizado"]);
  });

  it("nao oferece PP nem XG — o menor e P, e acima de GG e Personalizado", () => {
    expect(SHIRT_SIZES).not.toContain("PP");
    expect(SHIRT_SIZES).not.toContain("XG");
  });
});

describe("CUSTOM_SHIRT_SIZE", () => {
  it("aponta o tamanho que a organizacao trata individualmente", () => {
    expect(CUSTOM_SHIRT_SIZE).toBe("Personalizado");
  });

  it("e um dos tamanhos oferecidos", () => {
    expect(SHIRT_SIZES).toContain(CUSTOM_SHIRT_SIZE);
  });
});
