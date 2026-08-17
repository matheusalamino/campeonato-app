import { describe, it, expect } from "vitest";
import { championshipFormSchema, statusChangeSchema } from "./schema";

const validDraft = {
  name: "Copa Interna",
  status: "draft" as const,
  max_waitlist_players: 0,
};

describe("championshipFormSchema", () => {
  it("accepts a minimal draft with only a name", () => {
    const r = championshipFormSchema.safeParse(validDraft);
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, name: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects registration_start on/after registration_end", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_start_date: "2026-03-10",
      registration_end_date: "2026-03-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects registration_end on/after tournament_start", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_end_date: "2026-04-01",
      tournament_start_date: "2026-03-20",
    });
    expect(r.success).toBe(false);
  });

  it("rejects gala_night outside the registration_end..tournament_start window", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-02-20",
      tournament_start_date: "2026-04-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects max_players <= 0", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, max_players: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects negative waitlist", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      max_waitlist_players: -1,
    });
    expect(r.success).toBe(false);
  });

  it("requires all dates and max_players when status leaves draft", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      max_waitlist_players: 0,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a complete non-draft championship", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      registration_start_date: "2026-02-01",
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-03-10",
      tournament_start_date: "2026-04-01",
      max_players: 20,
      max_waitlist_players: 5,
    });
    expect(r.success).toBe(true);
  });
});

describe("statusChangeSchema", () => {
  it("rejects changing to the same status", () => {
    const r = statusChangeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      from: "subscribing",
      to: "subscribing",
    });
    expect(r.success).toBe(false);
  });
  it("accepts any distinct status change (including a jump)", () => {
    const r = statusChangeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      from: "completed",
      to: "draft",
    });
    expect(r.success).toBe(true);
  });
});
