import { describe, it, expect } from "vitest";
import { normalizeCpf, isValidCpf, formatCpf } from "./cpf";

describe("normalizeCpf", () => {
  it("strips non-digits", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
  });
});

describe("isValidCpf", () => {
  it("accepts a valid CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
  });
  it("rejects wrong check digits", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });
  it("rejects repeated digits", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidCpf("12345")).toBe(false);
  });
});

describe("formatCpf", () => {
  it("formats 11 digits", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
  it("formats partial input progressively", () => {
    expect(formatCpf("52998")).toBe("529.98");
  });
});
