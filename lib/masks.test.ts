import { describe, it, expect } from "vitest";
import { formatPhoneBR, formatHeightM, heightToMask, heightMaskToNumeric, formatBRL } from "./masks";

describe("formatPhoneBR", () => {
  it("returns empty for empty/no digits", () => {
    expect(formatPhoneBR("")).toBe("");
    expect(formatPhoneBR("abc")).toBe("");
  });
  it("formats progressively", () => {
    expect(formatPhoneBR("15")).toBe("(15");
    expect(formatPhoneBR("1599")).toBe("(15) 99");
    expect(formatPhoneBR("1533334444")).toBe("(15) 3333-4444");
    expect(formatPhoneBR("15999998888")).toBe("(15) 99999-8888");
  });
  it("strips non-digits and caps at 11 digits", () => {
    expect(formatPhoneBR("(15) 99999-8888")).toBe("(15) 99999-8888");
    expect(formatPhoneBR("159999988887777")).toBe("(15) 99999-8888");
  });
});

describe("formatHeightM", () => {
  it("returns empty for no digits", () => {
    expect(formatHeightM("")).toBe("");
    expect(formatHeightM("m")).toBe("");
  });
  it("formats meters,centimeters", () => {
    expect(formatHeightM("1")).toBe("1");
    expect(formatHeightM("18")).toBe("1,8");
    expect(formatHeightM("180")).toBe("1,80");
    expect(formatHeightM("1.80")).toBe("1,80");
    expect(formatHeightM("1,8")).toBe("1,8");
  });
});

describe("height number conversions", () => {
  it("masks a stored number", () => {
    expect(heightToMask(1.8)).toBe("1,80");
    expect(heightToMask(1.75)).toBe("1,75");
  });
  it("converts a mask back to a numeric string", () => {
    expect(heightMaskToNumeric("1,80")).toBe("1.80");
    expect(Number(heightMaskToNumeric("1,80"))).toBe(1.8);
  });
});

describe("formatBRL", () => {
  it("formats a whole number with two decimal places", () => {
    expect(formatBRL(50)).toBe("R$ 50,00");
  });
  it("formats cents", () => {
    expect(formatBRL(40.5)).toBe("R$ 40,50");
  });
  it("formats zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
  });
  it("groups thousands with a plain ASCII period, not a non-breaking space", () => {
    // Intl's "currency" style would use U+00A0 (a non-breaking space) between
    // "R$" and the digits instead of the plain space this file writes by hand.
    // Written as an escape, not the raw character, so this line does not repeat
    // the exact confusion it is guarding against.
    const result = formatBRL(1234.5);
    expect(result).toBe("R$ 1.234,50");
    expect(result.includes("\u00A0")).toBe(false);
  });
});
