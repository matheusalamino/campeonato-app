import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAROUSEL_CARDS,
  CAROUSEL_CARD_CATALOG,
  CARD_DURATION_MIN_MS,
  CARD_DURATION_MAX_MS,
  activeCards,
  nextIndex,
  prevIndex,
  goalInterrupt,
  resolveCarouselConfig,
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
  it("tem a sequência do spec com managers habilitado", () => {
    expect(DEFAULT_CAROUSEL_CARDS.map((c) => c.id)).toEqual([
      "live", "scorers", "assists", "craque", "goalkeeper", "revelation", "managers", "standings",
    ]);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "managers")!.enabled).toBe(true);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "live")!.durationMs).toBe(30_000);
    expect(DEFAULT_CAROUSEL_CARDS.find((c) => c.id === "standings")!.durationMs).toBe(20_000);
  });
});

describe("prevIndex", () => {
  const act = activeCards(DEFAULT_CAROUSEL_CARDS);
  it("decrementa e dá a volta", () => {
    expect(prevIndex(act, 1)).toBe(0);
    expect(prevIndex(act, 0)).toBe(act.length - 1);
  });
  it("array vazio → 0", () => {
    expect(prevIndex([], 0)).toBe(0);
  });
});

describe("resolveCarouselConfig", () => {
  it("null → DEFAULT_CAROUSEL_CARDS", () => {
    expect(resolveCarouselConfig(null)).toEqual(DEFAULT_CAROUSEL_CARDS);
  });

  it("respeita a ordem salva e acrescenta o restante do catálogo no fim", () => {
    const resolved = resolveCarouselConfig([
      { id: "standings", durationMs: 20_000, enabled: true },
      { id: "live", durationMs: 30_000, enabled: true },
    ]);
    expect(resolved[0].id).toBe("standings");
    expect(resolved[1].id).toBe("live");
    expect(resolved).toHaveLength(CAROUSEL_CARD_CATALOG.length);
    expect(new Set(resolved.map((c) => c.id)).size).toBe(CAROUSEL_CARD_CATALOG.length);
  });

  it("descarta ids fora do catálogo", () => {
    const resolved = resolveCarouselConfig([
      { id: "bogus", durationMs: 10_000, enabled: true },
      { id: "live", durationMs: 30_000, enabled: true },
    ]);
    expect(resolved.some((c) => c.id === "bogus")).toBe(false);
    expect(resolved[0].id).toBe("live");
  });

  it("clampa duração fora da faixa e usa default p/ valor inválido", () => {
    const [tooHigh] = resolveCarouselConfig([{ id: "live", durationMs: 999_999, enabled: true }]);
    expect(tooHigh.durationMs).toBe(CARD_DURATION_MAX_MS);
    const [tooLow] = resolveCarouselConfig([{ id: "live", durationMs: 100, enabled: true }]);
    expect(tooLow.durationMs).toBe(CARD_DURATION_MIN_MS);
    const [nan] = resolveCarouselConfig([{ id: "live", durationMs: NaN, enabled: true }]);
    expect(nan.durationMs).toBe(30_000);
  });

  it("enabled inválido → default do card", () => {
    const [live] = resolveCarouselConfig([
      // @ts-expect-error testando valor inválido em runtime
      { id: "live", durationMs: 30_000, enabled: "sim" },
    ]);
    expect(live.enabled).toBe(true);
  });
});
