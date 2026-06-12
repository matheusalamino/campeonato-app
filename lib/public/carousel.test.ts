import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAROUSEL_CARDS,
  activeCards,
  nextIndex,
  goalInterrupt,
  type CarouselCardConfig,
} from "./carousel";

const cards: CarouselCardConfig[] = [
  { id: "live", durationMs: 30_000, enabled: true },
  { id: "scorers", durationMs: 10_000, enabled: true },
  { id: "managers", durationMs: 10_000, enabled: false },
  { id: "standings", durationMs: 20_000, enabled: true },
];

describe("activeCards", () => {
  it("filtra desabilitados preservando ordem", () => {
    expect(activeCards(cards).map((c) => c.id)).toEqual(["live", "scorers", "standings"]);
  });
});

describe("nextIndex", () => {
  it("avança e dá a volta", () => {
    const act = activeCards(cards);
    expect(nextIndex(act, 0)).toBe(1);
    expect(nextIndex(act, 2)).toBe(0);
  });
});

describe("goalInterrupt", () => {
  it("pula para o card live e marca celebração", () => {
    const act = activeCards(cards);
    const st = goalInterrupt(act);
    expect(act[st!.index].id).toBe("live");
    expect(st!.mode).toBe("goal");
  });

  it("sem card live ativo, mantém rotação", () => {
    const noLive = activeCards(cards).filter((c) => c.id !== "live");
    const st = goalInterrupt(noLive);
    expect(st).toBeNull();
  });
});

describe("DEFAULT_CAROUSEL_CARDS", () => {
  it("tem a sequência do spec com managers desabilitado", () => {
    expect(DEFAULT_CAROUSEL_CARDS.map((c) => c.id)).toEqual([
      "live", "scorers", "assists", "best-by-position", "goalkeeper", "revelation", "standings", "managers",
    ]);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "managers")!.enabled).toBe(false);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "live")!.durationMs).toBe(30_000);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "standings")!.durationMs).toBe(20_000);
  });
});
