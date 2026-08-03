import { describe, it, expect } from "vitest";
import { parseSeasonYear } from "./championship-year";

describe("parseSeasonYear", () => {
  it("extracts a 4-digit year from season text", () => {
    expect(parseSeasonYear("Temporada 2026", null)).toBe(2026);
  });
  it("extracts a year embedded in a longer string", () => {
    expect(parseSeasonYear("Copa Interna 2024/2025", null)).toBe(2024);
  });
  it("falls back to created_at year when season has no year", () => {
    expect(parseSeasonYear("Verão", "2023-05-01T00:00:00Z")).toBe(2023);
  });
  it("falls back to created_at year when season is empty", () => {
    expect(parseSeasonYear(null, "2022-01-01T00:00:00Z")).toBe(2022);
  });
  it("returns 0 when nothing is parseable", () => {
    expect(parseSeasonYear(null, null)).toBe(0);
  });
});
