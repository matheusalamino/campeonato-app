import { describe, it, expect } from "vitest";
import { MIN_AGE, ageAt, isBelowMinimumAge, requiresLegalAuthorization } from "./age-policy";

const hoje = new Date("2026-08-18");

describe("ageAt", () => {
  it("conta os anos completos", () => {
    expect(ageAt("2000-08-18", hoje)).toBe(26);
    expect(ageAt("2000-08-19", hoje)).toBe(25); // faz aniversario amanha
  });
});

describe("isBelowMinimumAge", () => {
  it("barra quem ainda nao tem 12", () => {
    expect(isBelowMinimumAge("2015-01-01", hoje)).toBe(true);
    expect(isBelowMinimumAge("2014-08-19", hoje)).toBe(true); // faz 12 amanha
  });

  it("aceita a partir de 12 anos completos", () => {
    expect(isBelowMinimumAge("2014-08-18", hoje)).toBe(false);
    expect(isBelowMinimumAge("2010-01-01", hoje)).toBe(false);
  });

  it("expoe a idade minima como constante", () => {
    expect(MIN_AGE).toBe(12);
  });
});

describe("requiresLegalAuthorization", () => {
  it("exige carta de todo menor de idade", () => {
    expect(requiresLegalAuthorization("2014-08-18", hoje)).toBe(true); // 12
    expect(requiresLegalAuthorization("2009-01-01", hoje)).toBe(true); // 17
    expect(requiresLegalAuthorization("2008-08-19", hoje)).toBe(true); // faz 18 amanha
  });

  it("nao exige de quem ja tem 18", () => {
    expect(requiresLegalAuthorization("2008-08-18", hoje)).toBe(false);
    expect(requiresLegalAuthorization("1990-05-30", hoje)).toBe(false);
  });
});
