// Configuração e transições do carrossel do telão.
// Timers ficam no hook/componente; aqui só lógica pura (testável).

export type CarouselCardConfig = {
  id: string;
  durationMs: number;
  enabled: boolean;
};

export type CarouselMode = "rotation" | "goal";

export type CarouselState = { index: number; mode: CarouselMode };

// Sequência oficial do spec (Melhor Cartola já habilitado após o merge do best_manager_votes)
export const DEFAULT_CAROUSEL_CARDS: CarouselCardConfig[] = [
  { id: "live",             durationMs: 30_000, enabled: true },
  { id: "scorers",          durationMs: 10_000, enabled: true },
  { id: "assists",          durationMs: 10_000, enabled: true },
  { id: "best-by-position", durationMs: 10_000, enabled: true },
  { id: "goalkeeper",       durationMs: 10_000, enabled: true },
  { id: "revelation",       durationMs: 10_000, enabled: true },
  { id: "managers",         durationMs: 10_000, enabled: true },
  { id: "standings",        durationMs: 20_000, enabled: true },
];

export const GOAL_CELEBRATION_MS = 6_000;

export function activeCards(cards: CarouselCardConfig[]): CarouselCardConfig[] {
  return cards.filter((c) => c.enabled);
}

export function nextIndex(active: CarouselCardConfig[], current: number): number {
  if (active.length === 0) return 0;
  return (current + 1) % active.length;
}

// Gol: volta ao card "live" em modo celebração; null se não houver card live
export function goalInterrupt(active: CarouselCardConfig[]): CarouselState | null {
  const liveIdx = active.findIndex((c) => c.id === "live");
  if (liveIdx < 0) return null;
  return { index: liveIdx, mode: "goal" };
}
