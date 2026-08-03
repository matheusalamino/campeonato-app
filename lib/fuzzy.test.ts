import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyRank } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches an exact substring", () => {
    expect(fuzzyMatch("copa", "Copa Interna 2026")).toBe(true);
  });
  it("matches a subsequence", () => {
    expect(fuzzyMatch("cpi", "Copa Interna")).toBe(true);
  });
  it("ignores accents and case", () => {
    expect(fuzzyMatch("verao", "Torneio de Verão")).toBe(true);
  });
  it("returns true for an empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });
  it("fails when characters are missing", () => {
    expect(fuzzyMatch("xyz", "Copa Interna")).toBe(false);
  });
});

describe("fuzzyRank", () => {
  it("ranks an earlier substring match better (lower) than a later one", () => {
    expect(fuzzyRank("copa", "Copa 2026")).toBeLessThan(
      fuzzyRank("copa", "Super Copa 2026"),
    );
  });
  it("ranks a substring match better than a scattered subsequence", () => {
    expect(fuzzyRank("cpa", "Copa")).toBeLessThan(
      fuzzyRank("cpa", "Campeonato Paulista Amador"),
    );
  });
});
