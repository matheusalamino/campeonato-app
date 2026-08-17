import { describe, it, expect } from "vitest";
import { isMinor } from "./minor";

describe("isMinor", () => {
  const asOf = new Date("2026-08-03");
  it("under 18 is a minor", () => {
    expect(isMinor("2010-01-01", asOf)).toBe(true);
  });
  it("exactly 18 is not a minor", () => {
    expect(isMinor("2008-08-03", asOf)).toBe(false);
  });
  it("over 18 is not a minor", () => {
    expect(isMinor("1990-05-30", asOf)).toBe(false);
  });
});
