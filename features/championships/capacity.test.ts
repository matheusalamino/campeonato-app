import { describe, it, expect } from "vitest";
import { shouldCloseForCapacity } from "./capacity";

describe("shouldCloseForCapacity", () => {
  const base = { status: "subscribing" as const, maxPlayers: 20, maxWaitlist: 5 };

  it("closes when registrations reach players + waitlist", () => {
    expect(shouldCloseForCapacity({ ...base, registrationCount: 25 })).toBe(true);
  });
  it("does not close below capacity", () => {
    expect(shouldCloseForCapacity({ ...base, registrationCount: 24 })).toBe(false);
  });
  it("does nothing when status is not subscribing", () => {
    expect(
      shouldCloseForCapacity({ ...base, status: "draft", registrationCount: 99 }),
    ).toBe(false);
  });
  it("does nothing when maxPlayers is null", () => {
    expect(
      shouldCloseForCapacity({
        status: "subscribing",
        maxPlayers: null,
        maxWaitlist: 0,
        registrationCount: 99,
      }),
    ).toBe(false);
  });
  it("treats null waitlist as zero", () => {
    expect(
      shouldCloseForCapacity({
        status: "subscribing",
        maxPlayers: 10,
        maxWaitlist: null,
        registrationCount: 10,
      }),
    ).toBe(true);
  });
});
