# Design: Configuração do Carrossel do Telão

**Data:** 2026-06-14
**Status:** Aprovado (brainstorming com Wellmmer)
**Branch:** `feat/public-stats-pages` (continuação; PR #42 → develop)

## Objetivo

Permitir que admins/organizadores configurem, **por campeonato**, a **ordem**, a **duração** e a **visibilidade (mostrar/ocultar)** de cada card do carrossel do telão público (`/live/[championshipId]`). Hoje essa configuração está hardcoded em `lib/public/carousel.ts` (`DEFAULT_CAROUSEL_CARDS`).

## Decisões registradas (brainstorming)

| Tema | Decisão |
|---|---|
| Escopo | **Por campeonato** (cada campeonato tem sua config), análogo a `points_win`/`period_duration` que já moram em `championships`. |
| Editável | **Ordem + duração + mostrar/ocultar** de cada card. |
| Sem config salva | **Fallback ao `DEFAULT_CAROUSEL_CARDS`** atual; a tela de config inicia pré-preenchida com o default. |
| Persistência | **Opção A**: coluna `carousel_config JSONB` (nullable) em `championships`. |
| UI | Seção **"Carrossel do Telão"** em `/championship/settings`, com reordenação por botões ↑/↓ (padrão `PhaseConfigDrawer`; não há lib de drag-and-drop). |
| Duração | Em segundos, faixa **3–120s**. |

## Arquitetura

### 1. Persistência

Migration nova (ex.: `20260617000000_carousel_config.sql`):

```sql
ALTER TABLE public.championships ADD COLUMN IF NOT EXISTS carousel_config JSONB;
```

- Nullable, sem default (NULL = "usar o padrão").
- Formato do JSON: array ordenado de `{ id: string, durationMs: number, enabled: boolean }` — o mesmo shape de `CarouselCardConfig`.
- `championships` já tem policy `anon read` (migration `20260615`), então o `/live` (anon) lê `carousel_config` sem nova policy. A escrita continua restrita a `authenticated` (policy existente de update em `championships`).

### 2. Catálogo de cards + merge resiliente — `lib/public/carousel.ts`

Hoje `DEFAULT_CAROUSEL_CARDS` é a fonte. Introduzir um **catálogo** como fonte única de verdade dos cards conhecidos (id + label PT-BR + duração default), e derivar o default dele.

```ts
export type CarouselCardId =
  | "live" | "scorers" | "assists" | "best-by-position"
  | "goalkeeper" | "revelation" | "managers" | "standings";

export type CarouselCardCatalogEntry = {
  id: CarouselCardId;
  label: string;          // PT-BR para a UI de config
  defaultDurationMs: number;
  defaultEnabled: boolean;
};

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
```

`DEFAULT_CAROUSEL_CARDS` passa a ser derivado do catálogo (mantém a ordem e os valores atuais), preservando os consumidores existentes.

Limites de duração compartilhados:

```ts
export const CARD_DURATION_MIN_MS = 3_000;
export const CARD_DURATION_MAX_MS = 120_000;
```

Função pura de reconciliação:

```ts
export type SavedCarouselCard = { id: string; durationMs: number; enabled: boolean };

// Reconcilia a config salva com o catálogo do código:
// - saved == null/inválido  → default do catálogo
// - cards salvos válidos     → aplica ordem + duração (clamp) + enabled
// - cards do catálogo ausentes no saved → acrescentados no fim com defaults
// - ids salvos fora do catálogo → descartados
export function resolveCarouselConfig(
  saved: SavedCarouselCard[] | null | undefined,
): CarouselCardConfig[];
```

Regras internas:
- duração saneada: `clamp(round, 3000, 120000)`; valor não numérico → `defaultDurationMs`.
- `enabled` não-boolean → `defaultEnabled`.
- ordem final: ordem do array salvo (apenas ids válidos), seguida dos cards do catálogo ainda não incluídos, na ordem do catálogo.

### 3. Leitura no telão — `/live`

`app/(public)/live/[championshipId]/page.tsx` já busca `championships` (nome). Passa a selecionar também `carousel_config`, e entrega `resolveCarouselConfig(carousel_config)` ao `LiveCarousel` via prop.

`components/public/LiveCarousel.tsx`: hoje importa `DEFAULT_CAROUSEL_CARDS` direto. Passa a receber `cards: CarouselCardConfig[]` por prop (com fallback a `DEFAULT_CAROUSEL_CARDS` se a prop não vier), e usa essa lista no `useMemo`/`cardsKey` que já existe. O auto-skip de cards sem dados (`emptyCardIds`) e a interrupção/celebração de gol permanecem inalterados.

### 4. UI de configuração — área protegida

Seção **"Carrossel do Telão"** dentro de `app/(protected)/championship/settings/page.tsx`, extraída como componente `CarouselConfigSection` (card embutido na página, não um drawer), reutilizando o padrão visual de settings e o padrão de reordenação por ↑/↓ do `PhaseConfigDrawer`.

Comportamento:
- Carrega `championships.carousel_config` do campeonato selecionado (via contexto `useChampionship()` já existente) e inicializa o estado com `resolveCarouselConfig(saved)` — assim a lista aparece pré-preenchida (default quando não há config).
- Lista de cards na ordem atual; cada item exibe:
  - **Label PT-BR** (do catálogo).
  - **Toggle mostrar/ocultar** (`enabled`).
  - **Input de duração em segundos** (mostra `durationMs/1000`; clamp 3–120 ao digitar/blur).
  - Botões **↑/↓** para reordenar (swap em memória, padrão `moveRule` do `PhaseConfigDrawer`; desabilitados nas extremidades).
- Botão **Salvar**: `supabase.from("championships").update({ carousel_config: cards }).eq("id", championshipId)` + toast.
- Botão **Restaurar padrão**: zera para `null` (`update({ carousel_config: null })`) e recarrega a lista com o default.
- Aviso leve ("Nenhum card visível — o telão ficará vazio") quando todos os cards estão com `enabled: false`. Não bloqueia o salvar.
- Acesso conforme o resto de `/championship/settings` (admin/organizador).

### 5. Tratamento de erros / edge cases

- `carousel_config` corrompido/parcial no banco → `resolveCarouselConfig` sanea e completa com defaults (telão nunca quebra).
- Todos desabilitados → `LiveCarousel` já retorna `null` para lista vazia (telão em branco). Aceitável + aviso na UI.
- Card desabilitado **e** sem dados → continua fora (interseção de `enabled` + `emptyCardIds`).
- Falha de rede ao salvar → toast de erro; estado local preservado para nova tentativa.

### 6. Testes

- **Unitários (vitest)** de `resolveCarouselConfig`:
  - `null` → igual ao `DEFAULT_CAROUSEL_CARDS`.
  - reordenação respeitada.
  - card novo do catálogo (ausente no saved) acrescentado no fim com defaults.
  - id salvo fora do catálogo descartado.
  - duração inválida/fora da faixa → clamp/default.
  - `enabled` inválido → default.
- **Verificação manual**: configurar no app protegido, salvar, abrir `/live/[id]` e confirmar ordem/duração/visibilidade; "Restaurar padrão" volta ao default.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260617000000_carousel_config.sql` | criar | coluna `carousel_config JSONB` em `championships` |
| `lib/public/carousel.ts` | modificar | catálogo, limites de duração, `resolveCarouselConfig`, `DEFAULT_CAROUSEL_CARDS` derivado |
| `lib/public/carousel.test.ts` | modificar | testes do `resolveCarouselConfig` |
| `components/public/LiveCarousel.tsx` | modificar | receber `cards` por prop (fallback ao default) |
| `app/(public)/live/[championshipId]/page.tsx` | modificar | ler `carousel_config` e resolver antes de passar ao carrossel |
| `components/CarouselConfigSection.tsx` (ou seção em settings) | criar | UI de configuração (lista, toggle, duração, ↑/↓, salvar, restaurar) |
| `app/(protected)/championship/settings/page.tsx` | modificar | montar a seção "Carrossel do Telão" |

## Fora de escopo (YAGNI)

- Config global (decidiu-se por-campeonato).
- Drag-and-drop (botões ↑/↓ bastam; sem nova dependência).
- Preview ao vivo do carrossel dentro da tela de config.
- Configurar conteúdo/estilo dos cards (só ordem/duração/visibilidade).
- Permissão granular além do controle já existente em `/championship/settings`.
