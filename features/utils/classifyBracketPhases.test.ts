import { describe, it, expect } from "vitest";
import { classifyBracketPhases } from "./classifyBracketPhases";
import type { ChampionshipMatchPhaseGroup } from "@/features/hooks/useChampionshipMatches";

function makePhase(
  name: string,
  orderNumber: number,
  isFinal = false,
): ChampionshipMatchPhaseGroup {
  return {
    id: name,
    name,
    orderNumber,
    matches: isFinal
      ? [
          {
            id: "m1",
            phaseId: name,
            phaseName: name,
            phaseOrder: orderNumber,
            matchName: null,
            matchCode: null,
            roundNumber: 1,
            groupLabel: null,
            scheduledAt: null,
            isFinal: true,
            status: "NOT_STARTED",
            homeScore: null,
            awayScore: null,
            home: { type: "pending", label: "A definir", logoUrl: null },
            away: { type: "pending", label: "A definir", logoUrl: null },
          },
        ]
      : [],
  };
}

const FULL_COPA: ChampionshipMatchPhaseGroup[] = [
  makePhase("Repescagem 1", 1),
  makePhase("Repescagem 2", 2),
  makePhase("Semifinal 1", 3),
  makePhase("Semifinal 2", 4),
  makePhase("Final", 5, true),
  makePhase("Disputa 3º Lugar", 6),
];

describe("classifyBracketPhases", () => {
  it("classifies a full Copa bracket correctly", () => {
    const r = classifyBracketPhases(FULL_COPA);
    expect(r.repescagemLeft?.name).toBe("Repescagem 1");
    expect(r.repescagemRight?.name).toBe("Repescagem 2");
    expect(r.semiLeft?.name).toBe("Semifinal 1");
    expect(r.semiRight?.name).toBe("Semifinal 2");
    expect(r.final?.name).toBe("Final");
    expect(r.disputa?.name).toBe("Disputa 3º Lugar");
    expect(r.isValid).toBe(true);
  });

  it("detects final by isFinal flag even without 'final' in name", () => {
    const r = classifyBracketPhases([makePhase("Grande Decisão", 1, true)]);
    expect(r.final?.name).toBe("Grande Decisão");
    expect(r.isValid).toBe(true);
  });

  it("does not classify a Semifinal phase as final", () => {
    const r = classifyBracketPhases([makePhase("Semifinal", 1)]);
    expect(r.final).toBeNull();
    expect(r.isValid).toBe(false);
  });

  it("returns isValid false when no final phase exists", () => {
    const r = classifyBracketPhases([
      makePhase("Repescagem 1", 1),
      makePhase("Repescagem 2", 2),
    ]);
    expect(r.isValid).toBe(false);
  });

  it("assigns repescagens by ascending orderNumber", () => {
    const reversed = [makePhase("Repescagem 2", 5), makePhase("Repescagem 1", 1)];
    const r = classifyBracketPhases(reversed);
    expect(r.repescagemLeft?.name).toBe("Repescagem 1");
    expect(r.repescagemRight?.name).toBe("Repescagem 2");
  });

  it("does not classify a Semifinal phase with isFinal match as final", () => {
    const phase = makePhase("Semifinal", 1, true); // isFinal: true on the match
    const r = classifyBracketPhases([phase]);
    expect(r.final).toBeNull();
    expect(r.semiLeft?.name).toBe("Semifinal");
    expect(r.isValid).toBe(false);
  });
});
