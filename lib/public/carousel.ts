// Configuração e transições do carrossel do telão.
// Timers ficam no hook/componente; aqui só lógica pura (testável).

export type CarouselCardConfig = {
  id: string;
  durationMs: number;
  enabled: boolean;
};

export type CarouselMode = "rotation" | "goal";

export type CarouselState = { index: number; mode: CarouselMode };

export type CarouselCardId =
  | "live" | "scorers" | "assists" | "best-by-position"
  | "goalkeeper" | "revelation" | "managers" | "standings";

export type CarouselCardCatalogEntry = {
  id: CarouselCardId;
  label: string;            // PT-BR para a UI de configuração
  defaultDurationMs: number;
  defaultEnabled: boolean;
};

// Fonte única de verdade dos cards conhecidos do carrossel
export const CAROUSEL_CARD_CATALOG: CarouselCardCatalogEntry[] = [
  { id: "live",             label: "Jogo ao Vivo",        defaultDurationMs: 30_000, defaultEnabled: true },
  { id: "scorers",          label: "Artilheiros",         defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "assists",          label: "Maestros",            defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "best-by-position", label: "Craques por Posição", defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "goalkeeper",       label: "Goleiro Destaque",    defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "revelation",       label: "Revelações",          defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "managers",         label: "Cartolas",            defaultDurationMs: 10_000, defaultEnabled: true },
  { id: "standings",        label: "Classificação",       defaultDurationMs: 20_000, defaultEnabled: true },
];

// Limites de duração por card (segundos na UI; ms no modelo)
export const CARD_DURATION_MIN_MS = 3_000;
export const CARD_DURATION_MAX_MS = 120_000;

// Padrão derivado do catálogo (mantém ordem/valores atuais)
export const DEFAULT_CAROUSEL_CARDS: CarouselCardConfig[] = CAROUSEL_CARD_CATALOG.map((c) => ({
  id: c.id,
  durationMs: c.defaultDurationMs,
  enabled: c.defaultEnabled,
}));

// Formato salvo em championships.carousel_config (pode vir parcial/sujo do banco)
export type SavedCarouselCard = { id: string; durationMs: number; enabled: boolean };

function clampDuration(ms: unknown, fallback: number): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return fallback;
  return Math.min(CARD_DURATION_MAX_MS, Math.max(CARD_DURATION_MIN_MS, Math.round(ms)));
}

// Reconcilia a config salva com o catálogo do código:
// - null/não-array → padrão; cards salvos válidos aplicam ordem/duração/enabled;
// - cards do catálogo ausentes entram no fim com defaults; ids fora do catálogo são descartados.
export function resolveCarouselConfig(
  saved: SavedCarouselCard[] | null | undefined,
): CarouselCardConfig[] {
  // Cópia (não a referência do default mutável) — o retorno alimenta estado editável
  if (!Array.isArray(saved)) return DEFAULT_CAROUSEL_CARDS.map((c) => ({ ...c }));
  const catalogById = new Map(CAROUSEL_CARD_CATALOG.map((c) => [c.id, c]));
  const result: CarouselCardConfig[] = [];
  const seen = new Set<string>();
  for (const s of saved) {
    const entry = s && typeof s.id === "string" ? catalogById.get(s.id as CarouselCardId) : undefined;
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push({
      id: entry.id,
      durationMs: clampDuration(s.durationMs, entry.defaultDurationMs),
      enabled: typeof s.enabled === "boolean" ? s.enabled : entry.defaultEnabled,
    });
  }
  for (const entry of CAROUSEL_CARD_CATALOG) {
    if (seen.has(entry.id)) continue;
    result.push({ id: entry.id, durationMs: entry.defaultDurationMs, enabled: entry.defaultEnabled });
  }
  return result;
}

export const GOAL_CELEBRATION_MS = 6_000;

export function activeCards(cards: CarouselCardConfig[]): CarouselCardConfig[] {
  return cards.filter((c) => c.enabled);
}

export function nextIndex(active: CarouselCardConfig[], current: number): number {
  if (active.length === 0) return 0;
  return (current + 1) % active.length;
}

// Card anterior, com wrap-around (de 0 vai para o último)
export function prevIndex(active: CarouselCardConfig[], current: number): number {
  if (active.length === 0) return 0;
  return (current - 1 + active.length) % active.length;
}

// Gol: volta ao card "live" em modo celebração; null se não houver card live
export function goalInterrupt(active: CarouselCardConfig[]): CarouselState | null {
  const liveIdx = active.findIndex((c) => c.id === "live");
  if (liveIdx < 0) return null;
  return { index: liveIdx, mode: "goal" };
}
