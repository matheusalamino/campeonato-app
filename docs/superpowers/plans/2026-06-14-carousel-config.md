# Configuração do Carrossel do Telão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir configurar, por campeonato, a ordem/duração/visibilidade dos cards do carrossel do telão (`/live`), e navegar manualmente entre cards com as setas ← →.

**Architecture:** A config é uma coluna `carousel_config JSONB` em `championships` (NULL = padrão). Uma função pura `resolveCarouselConfig` reconcilia o JSON salvo com o catálogo de cards do código. O `/live` lê a config (anon, via `championships`) e entrega a lista resolvida ao `LiveCarousel`. A edição é uma seção em `/championship/settings`. Setas ← → navegam via `nextIndex`/`prevIndex`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres), Vitest, Tailwind v4. Spec: `docs/superpowers/specs/2026-06-14-carousel-config-design.md`.

**Convenções:** código/rotas em inglês; UI e comentários em PT-BR. Commits frequentes na branch `feat/public-stats-pages`.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/public/carousel.ts` | modificar | catálogo de cards, limites de duração, `DEFAULT_CAROUSEL_CARDS` derivado, `prevIndex`, `resolveCarouselConfig` |
| `lib/public/carousel.test.ts` | modificar | testes de `prevIndex` e `resolveCarouselConfig` |
| `supabase/migrations/20260617000000_carousel_config.sql` | criar | coluna `carousel_config JSONB` em `championships` |
| `components/public/LiveCarousel.tsx` | modificar | aceitar `cards` por prop (fallback default) + navegação por teclado ← → |
| `app/(public)/live/[championshipId]/page.tsx` | modificar | ler `carousel_config` e passar `resolveCarouselConfig(...)` ao carrossel |
| `components/CarouselConfigSection.tsx` | criar | UI de configuração (lista, toggle, duração, ↑/↓, salvar, restaurar) |
| `app/(protected)/championship/settings/page.tsx` | modificar | montar a seção "Carrossel do Telão" |

Fatos verificados do código:
- `lib/public/carousel.ts` hoje exporta `CarouselCardConfig`, `DEFAULT_CAROUSEL_CARDS` (8 cards), `activeCards`, `nextIndex`, `goalInterrupt`, `GOAL_CELEBRATION_MS`. Ordem atual: live(30s), scorers(10s), assists(10s), best-by-position(10s), goalkeeper(10s), revelation(10s), managers(10s), standings(20s) — todos enabled.
- `carousel.test.ts` já valida a ordem/duração/enabled do `DEFAULT_CAROUSEL_CARDS` — derivar do catálogo mantém esse teste passando.
- `LiveCarousel` recebe `renderCard`, `emptyCardIds`, `handleRef`; usa `useMemo` com `cardsKey = emptyCardIds.join(",")` sobre `activeCards(DEFAULT_CAROUSEL_CARDS)`; tem `index`/`celebration` state e efeito de avanço por `setTimeout`.
- Página `/live` busca `championships` via `supabase.from("championships").select("id, name").eq("id", championshipId).maybeSingle()`; usa `usePublicLiveMatch`, `usePublicRankings`, `useGroupStandings`.
- `/championship/settings/page.tsx` usa `useChampionship()` (objeto `championship` com `id`), client component, estilo zinc (tema escuro do app), salva via `supabase.from("championships").update(...).eq("id", ...)` + `toast` (sonner).
- `championships` tem policy `anon read` (migration 20260615) → `carousel_config` é lida no `/live` sem nova policy.

---

### Task 1: carousel.ts — catálogo, prevIndex e resolveCarouselConfig (TDD)

**Files:**
- Modify: `lib/public/carousel.ts`
- Test: `lib/public/carousel.test.ts`

- [ ] **Step 1: Escrever os testes que falham** — adicionar ao FIM de `lib/public/carousel.test.ts`:

Primeiro, ampliar o import no topo do arquivo (ele já importa de `./carousel`). Substituir a linha de import existente:
```ts
import {
  DEFAULT_CAROUSEL_CARDS,
  activeCards,
  nextIndex,
  goalInterrupt,
  type CarouselCardConfig,
} from "./carousel";
```
por:
```ts
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
```

E acrescentar no fim do arquivo:
```ts
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
    // todos os cards do catálogo presentes, sem duplicar
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
    // duração não-numérica → default do catálogo (live = 30000)
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
```

- [ ] **Step 2: Rodar e ver FALHAR**

Run: `npx vitest run lib/public/carousel.test.ts`
Expected: FAIL — `resolveCarouselConfig`/`prevIndex`/`CAROUSEL_CARD_CATALOG` não exportados.

- [ ] **Step 3: Implementar** — substituir o bloco do `DEFAULT_CAROUSEL_CARDS` em `lib/public/carousel.ts` (linhas 14-24) e acrescentar as novas funções. O arquivo passa a ser:

Substituir:
```ts
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
```
por:
```ts
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
  if (!Array.isArray(saved)) return DEFAULT_CAROUSEL_CARDS;
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
```

E acrescentar `prevIndex` logo após `nextIndex`:
```ts
// Card anterior, com wrap-around (de 0 vai para o último)
export function prevIndex(active: CarouselCardConfig[], current: number): number {
  if (active.length === 0) return 0;
  return (current - 1 + active.length) % active.length;
}
```

- [ ] **Step 4: Rodar e ver PASSAR**

Run: `npx vitest run lib/public/carousel.test.ts`
Expected: PASS (incluindo os testes pré-existentes de `DEFAULT_CAROUSEL_CARDS`, que continuam válidos).

- [ ] **Step 5: Commit**

```bash
git add lib/public/carousel.ts lib/public/carousel.test.ts
git commit -m "feat: carousel card catalog, prevIndex and resolveCarouselConfig"
```

---

### Task 2: Migration — coluna carousel_config

**Files:**
- Create: `supabase/migrations/20260617000000_carousel_config.sql`

- [ ] **Step 1: Criar a migration**

```sql
BEGIN;

-- Configuração do carrossel do telão por campeonato.
-- NULL = usar o padrão do código (resolveCarouselConfig).
-- Formato: array ordenado de { id, durationMs, enabled }.
ALTER TABLE public.championships ADD COLUMN IF NOT EXISTS carousel_config JSONB;

COMMIT;
```

- [ ] **Step 2: Validar SQL**

Run: `grep -c "carousel_config" supabase/migrations/20260617000000_carousel_config.sql`
Expected: `2` (ALTER + comentário). Confirme que é a única migration com esse timestamp.

(A aplicação no staging/produção é feita pelo fluxo de migrations do projeto; `championships` já tem `anon read`, então o `/live` lerá a coluna sem mudança de policy.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000000_carousel_config.sql
git commit -m "feat: add carousel_config column to championships"
```

---

### Task 3: LiveCarousel — prop `cards` + navegação por teclado

**Files:**
- Modify: `components/public/LiveCarousel.tsx`

- [ ] **Step 1: Importar `prevIndex` e adicionar a prop `cards`**

No import de `@/lib/public/carousel`, acrescentar `prevIndex`. O bloco de import passa a ser:
```ts
import {
  DEFAULT_CAROUSEL_CARDS,
  GOAL_CELEBRATION_MS,
  activeCards,
  nextIndex,
  prevIndex,
  goalInterrupt,
  type CarouselCardConfig,
} from "@/lib/public/carousel";
```
(Se `CarouselCardConfig` ainda não estiver importado aqui, incluí-lo como acima.)

Na definição de `Props`, adicionar `cards`:
```ts
type Props = {
  // Cada card é renderizado pelo id; o pai injeta o conteúdo
  renderCard: (cardId: string) => React.ReactNode;
  // Cards sem dados ainda (telão pula): ex. sem classificação na fase atual
  emptyCardIds?: string[];
  // Config resolvida (ordem/duração/visibilidade); cai no padrão se não vier
  cards?: CarouselCardConfig[];
};
```

E na desestruturação dos props do componente, incluir `cards`:
```ts
export default function LiveCarousel({
  renderCard,
  emptyCardIds = [],
  cards: cardsProp,
  handleRef,
}: Props & { handleRef?: React.MutableRefObject<LiveCarouselHandle | null> }) {
```

- [ ] **Step 2: Usar a config recebida no `useMemo`**

Substituir o bloco do `useMemo` de `cards` (que hoje usa `DEFAULT_CAROUSEL_CARDS`):
```ts
  // Chave estável: o pai pode passar um array novo a cada render sem reiniciar o carrossel
  const cardsKey = emptyCardIds.join(",");
  const cards = useMemo(
    () => activeCards(DEFAULT_CAROUSEL_CARDS).filter((c) => !emptyCardIds.includes(c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardsKey],
  );
```
por (passa a depender da config recebida, com chave estável incluindo ela):
```ts
  // Chave estável: o pai pode passar arrays novos a cada render sem reiniciar o carrossel
  const source = cardsProp ?? DEFAULT_CAROUSEL_CARDS;
  const cardsKey = `${source.map((c) => `${c.id}:${c.durationMs}:${c.enabled}`).join("|")}#${emptyCardIds.join(",")}`;
  const cards = useMemo(
    () => activeCards(source).filter((c) => !emptyCardIds.includes(c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardsKey],
  );
```

- [ ] **Step 3: Adicionar navegação por teclado ← →**

Logo após o `useEffect` que expõe `handleRef` (perto do `fireGoal`), adicionar:
```ts
  // Navegação manual: ← card anterior, → próximo card (ignora durante a celebração)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (celebration) return;
      if (e.key === "ArrowRight") setIndex((cur) => nextIndex(cards, cur));
      else if (e.key === "ArrowLeft") setIndex((cur) => prevIndex(cards, cur));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, celebration]);
```
(O efeito de avanço automático já depende de `index`, então a navegação manual reinicia o timer do card de destino.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos apontando para `LiveCarousel.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/public/LiveCarousel.tsx
git commit -m "feat: LiveCarousel accepts cards config and arrow-key navigation"
```

---

### Task 4: /live — ler carousel_config e passar ao carrossel

**Files:**
- Modify: `app/(public)/live/[championshipId]/page.tsx`

- [ ] **Step 1: Importar o resolver e adicionar estado**

No topo, garantir o import de `resolveCarouselConfig` e `CarouselCardConfig`:
```ts
import { POSITION_LABELS } from "@/lib/public/types";
import { resolveCarouselConfig, type CarouselCardConfig } from "@/lib/public/carousel";
```

Adicionar um estado para os cards resolvidos junto aos outros `useState` da página:
```ts
  const [carouselCards, setCarouselCards] = useState<CarouselCardConfig[]>([]);
```

- [ ] **Step 2: Ler `carousel_config` ao buscar o campeonato**

Localizar o `useEffect` que busca o campeonato (faz `supabase.from("championships").select("id, name")...maybeSingle()`) e:
1. Trocar o `select("id, name")` por `select("id, name, carousel_config")`.
2. Após `setChampionshipName(champ.name)`, adicionar:
```ts
      setCarouselCards(resolveCarouselConfig(champ.carousel_config));
```
O bloco fica assim:
```ts
      const { data: champ } = await supabase
        .from("championships").select("id, name, carousel_config").eq("id", championshipId).maybeSingle();
      if (!champ) { setNotFound(true); return; }
      setChampionshipName(champ.name);
      setCarouselCards(resolveCarouselConfig(champ.carousel_config));
```

- [ ] **Step 3: Passar `cards` ao `LiveCarousel`**

Localizar o JSX `<LiveCarousel renderCard={renderCard} emptyCardIds={emptyCardIds} handleRef={carouselRef} />` e incluir a prop `cards`:
```tsx
      <LiveCarousel renderCard={renderCard} emptyCardIds={emptyCardIds} cards={carouselCards} handleRef={carouselRef} />
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compila; rota `/live/[championshipId]` presente. (Se `champ.carousel_config` acusar erro de tipo por o tipo gerado de `championships` não ter a coluna, fazer cast local: `resolveCarouselConfig((champ as { carousel_config?: unknown }).carousel_config as never)` — mas tente sem cast primeiro.)

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/live/[championshipId]/page.tsx"
git commit -m "feat: live screen reads per-championship carousel config"
```

---

### Task 5: CarouselConfigSection (UI de configuração)

**Files:**
- Create: `components/CarouselConfigSection.tsx`

- [ ] **Step 1: Criar o componente** com EXATAMENTE este conteúdo:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { MonitorPlay, Save, RotateCcw, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import {
  CAROUSEL_CARD_CATALOG,
  CARD_DURATION_MIN_MS,
  CARD_DURATION_MAX_MS,
  resolveCarouselConfig,
  type CarouselCardConfig,
} from "@/lib/public/carousel";

const supabase = createClient();

const LABELS = new Map(CAROUSEL_CARD_CATALOG.map((c) => [c.id, c.label]));
const MIN_S = CARD_DURATION_MIN_MS / 1000;
const MAX_S = CARD_DURATION_MAX_MS / 1000;

// Seção de configuração do carrossel do telão (área protegida)
export default function CarouselConfigSection({ championshipId }: { championshipId: string }) {
  const [cards, setCards] = useState<CarouselCardConfig[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("championships").select("carousel_config").eq("id", championshipId).maybeSingle();
      if (cancelled) return;
      setCards(resolveCarouselConfig((data?.carousel_config ?? null) as never));
    })();
    return () => { cancelled = true; };
  }, [championshipId]);

  function toggleEnabled(i: number) {
    setCards((cs) => cs.map((c, idx) => (idx === i ? { ...c, enabled: !c.enabled } : c)));
  }

  function setSeconds(i: number, raw: string) {
    const sec = parseInt(raw, 10);
    setCards((cs) =>
      cs.map((c, idx) => (idx === i ? { ...c, durationMs: Number.isNaN(sec) ? c.durationMs : sec * 1000 } : c)),
    );
  }

  function move(i: number, dir: "up" | "down") {
    const target = dir === "up" ? i - 1 : i + 1;
    if (target < 0 || target >= cards.length) return;
    setCards((cs) => {
      const next = [...cs];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    // Clampa a duração antes de salvar (a UI pode ter valores fora da faixa)
    const payload = cards.map((c) => ({
      id: c.id,
      durationMs: Math.min(CARD_DURATION_MAX_MS, Math.max(CARD_DURATION_MIN_MS, c.durationMs)),
      enabled: c.enabled,
    }));
    const { error } = await supabase
      .from("championships").update({ carousel_config: payload }).eq("id", championshipId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar o carrossel");
    else toast.success("Carrossel salvo com sucesso");
  }

  async function handleRestore() {
    setSaving(true);
    const { error } = await supabase
      .from("championships").update({ carousel_config: null }).eq("id", championshipId);
    setSaving(false);
    if (error) { toast.error("Erro ao restaurar o padrão"); return; }
    setCards(resolveCarouselConfig(null));
    toast.success("Carrossel restaurado para o padrão");
  }

  const noneVisible = cards.length > 0 && cards.every((c) => !c.enabled);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/10 rounded-lg">
            <MonitorPlay className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Carrossel do Telão</h2>
            <p className="text-xs text-zinc-500">Ordem, duração e visibilidade dos cards da tela ao vivo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestore}
            disabled={saving}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-2 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-700 transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-purple-900/20"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-2">
        {noneVisible ? (
          <p className="mb-3 rounded-lg border border-yellow-700/40 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
            Nenhum card visível — o telão ficará vazio.
          </p>
        ) : null}

        {cards.map((card, i) => (
          <div
            key={card.id}
            className={`flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 ${card.enabled ? "" : "opacity-50"}`}
          >
            <div className="flex flex-col">
              <button
                onClick={() => move(i, "up")}
                disabled={i === 0}
                className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-30"
                title="Subir"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => move(i, "down")}
                disabled={i === cards.length - 1}
                className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-30"
                title="Descer"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <span className="w-5 text-center text-xs font-bold text-zinc-600">{i + 1}</span>
            <span className="flex-1 text-sm font-semibold text-white">{LABELS.get(card.id) ?? card.id}</span>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Duração (s)
              <input
                type="number"
                min={MIN_S}
                max={MAX_S}
                value={Math.round(card.durationMs / 1000)}
                onChange={(e) => setSeconds(i, e.target.value)}
                className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-purple-500"
              />
            </label>

            <button
              onClick={() => toggleEnabled(i)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                card.enabled ? "bg-emerald-600/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
              }`}
              title={card.enabled ? "Visível" : "Oculto"}
            >
              {card.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {card.enabled ? "Visível" : "Oculto"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `CarouselConfigSection.tsx`. (Os ícones usados — `MonitorPlay, Save, RotateCcw, ChevronUp, ChevronDown, Eye, EyeOff` — existem em `lucide-react`.)

- [ ] **Step 3: Commit**

```bash
git add components/CarouselConfigSection.tsx
git commit -m "feat: carousel config section for the live screen settings"
```

---

### Task 6: Montar a seção na página de settings

**Files:**
- Modify: `app/(protected)/championship/settings/page.tsx`

- [ ] **Step 1: Importar o componente**

Após os imports existentes (depois de `import { PhaseConfigDrawer } ...`), adicionar:
```ts
import CarouselConfigSection from "@/components/CarouselConfigSection";
```

- [ ] **Step 2: Renderizar a seção**

Localizar o fechamento do "CARD ESTRUTURA" (a `</div>` que fecha a `div` aberta em `{/* CARD ESTRUTURA */}`, logo antes de `{/* MODAL */}`). Inserir a seção entre o fim do card de estrutura e o `{/* MODAL */}`:
```tsx
      {/* CARROSSEL DO TELÃO */}
      <CarouselConfigSection championshipId={championship.id} />

      {/* MODAL */}
```
(`championship` já está garantido não-nulo nesse ponto pelo early-return `if (!championship) { ... }`.)

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compila; rota `/championship/settings` presente.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/championship/settings/page.tsx"
git commit -m "feat: mount carousel config section in championship settings"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Testes + lint + build**

Run: `npx vitest run && npx eslint lib/public/carousel.ts components/public/LiveCarousel.tsx components/CarouselConfigSection.tsx "app/(public)/live/[championshipId]/page.tsx" "app/(protected)/championship/settings/page.tsx" && npm run build`
Expected: testes passam; ESLint sem issues; build compila.

- [ ] **Step 2: Aplicar a migration no staging (opcional, se houver acesso)** — via o fluxo de migrations do projeto (`supabase db push` ou MCP). Sem isso, a coluna entra no próximo deploy; `resolveCarouselConfig(null)` mantém o telão no padrão até lá.

- [ ] **Step 3: Checklist manual (`npm run dev`)**

1. Em `/championship/settings`, a seção "Carrossel do Telão" aparece pré-preenchida com os 8 cards na ordem padrão.
2. Reordenar com ↑/↓, mudar duração, ocultar um card, **Salvar** → toast de sucesso.
3. Abrir `/live/<championshipId>` → carrossel reflete ordem/duração; card oculto não aparece.
4. No telão, setas **←/→** voltam/avançam o card e reiniciam o timer; durante a celebração de gol as setas são ignoradas.
5. **Restaurar padrão** → volta aos 8 cards padrão; `/live` volta ao default.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore: final adjustments for carousel config"
```

---

## Self-review (executado na escrita do plano)

- **Cobertura do spec:** persistência JSONB (T2) ✓; catálogo + `resolveCarouselConfig` + merge resiliente (T1) ✓; `DEFAULT_CAROUSEL_CARDS` derivado (T1) ✓; limites 3–120s (T1 const + T5 input + clamp no save) ✓; leitura no `/live` (T4) ✓; `LiveCarousel` por prop (T3) ✓; navegação ← → + `prevIndex` (T1 fn/test, T3 listener) ✓; UI seção em settings com toggle/duração/↑↓/salvar/restaurar/aviso (T5, T6) ✓; testes de `resolveCarouselConfig` e `prevIndex` (T1) ✓; edge cases (config corrompida → sanea; todos ocultos → aviso + telão vazio) ✓.
- **Tipos consistentes:** `CarouselCardConfig`, `SavedCarouselCard`, `CarouselCardId`, `CAROUSEL_CARD_CATALOG`, `CARD_DURATION_MIN_MS/MAX_MS`, `resolveCarouselConfig`, `prevIndex` definidos em T1 e usados em T3/T4/T5 com as mesmas assinaturas. Prop `cards` de `LiveCarousel` (T3) consumida em T4.
- **Sem placeholders:** todos os passos têm código/comando concretos.
