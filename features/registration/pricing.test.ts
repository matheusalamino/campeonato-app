import { describe, it, expect } from "vitest";
import { computeTicketsTotal } from "./pricing";

describe("computeTicketsTotal", () => {
  it("base only when no extras", () => {
    expect(computeTicketsTotal({ basePrice: 100, extraTicketPrice: 40, extraTicketsCount: 0 })).toBe(100);
  });
  it("adds extra tickets", () => {
    expect(computeTicketsTotal({ basePrice: 100, extraTicketPrice: 40, extraTicketsCount: 2 })).toBe(180);
  });
  it("treats null prices as zero", () => {
    expect(computeTicketsTotal({ basePrice: null, extraTicketPrice: null, extraTicketsCount: 3 })).toBe(0);
  });
  it("never counts negative extras", () => {
    expect(computeTicketsTotal({ basePrice: 100, extraTicketPrice: 40, extraTicketsCount: -5 })).toBe(100);
  });
});
