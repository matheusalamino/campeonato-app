import { describe, it, expect } from "vitest";
import { deriveIsWaitlist } from "./waitlist";

describe("deriveIsWaitlist", () => {
  it("false below capacity", () => {
    expect(deriveIsWaitlist({ registrationCount: 19, maxPlayers: 20 })).toBe(false);
  });
  it("true once main capacity is reached", () => {
    expect(deriveIsWaitlist({ registrationCount: 20, maxPlayers: 20 })).toBe(true);
  });
  it("false when no cap configured", () => {
    expect(deriveIsWaitlist({ registrationCount: 999, maxPlayers: null })).toBe(false);
  });
});
