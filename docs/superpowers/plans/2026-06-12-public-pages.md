# Public Pages (Live Screen + Stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Duas páginas públicas (sem auth): `/live/[championshipId]` (telão carrossel para TV 1080p) e `/stats/[championshipId]` (estatísticas responsivas), com rankings oficiais do regulamento, visual "Noite de Gala" e atualização Realtime + polling.

**Architecture:** Views/funções SQL com acesso `anon` expõem apenas dados seguros (sem CPF/e-mail/WhatsApp); hooks client seguem o padrão Realtime+polling existente; carrossel é config-driven com interrupção por gol. Spec: `docs/superpowers/specs/2026-06-12-public-pages-design.md`. Mockups aprovados: `docs/superpowers/specs/assets/2026-06-12-public-live-screen-mockup.html` e `...-public-stats-page-mockup.html`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase (Postgres + Realtime), Vitest (novo), Recharts (radar existente).

**Desvio registrado do spec:** o spec previa extrair o cálculo de classificação do `useGroupStandings` para `lib/`. Como as policies `anon` desta migration tornam o hook utilizável direto nas páginas públicas, **reutilizamos o hook sem refatorar** — zero duplicação da regra de desempate com menos risco. (Se a extração for desejada depois, é refactor independente.)

**Convenções:** código/rotas/arquivos em inglês; textos de UI e comentários em PT-BR. Commits frequentes na branch `feat/public-stats-pages`.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `vitest.config.ts` | criar | runner de testes com alias `@/` |
| `package.json` | modificar | devDep `vitest` + script `test` |
| `supabase/migrations/20260613000000_public_pages.sql` | criar | views, funções e policies anon |
| `app/(protected)/games/[id]/page.tsx` | modificar | evento `PENALTY_SAVE` + relabel `SAVE` |
| `lib/public/types.ts` | criar | tipos compartilhados das páginas públicas |
| `lib/public/match-stats.ts` (+ test) | criar | rankings puros a partir de stats/votos |
| `lib/public/carousel.ts` (+ test) | criar | sequência/timing/interrupção do carrossel |
| `app/globals.css` | modificar | utilitários e keyframes "gala" |
| `app/(public)/layout.tsx` | criar | layout público sem auth |
| `features/hooks/usePublicRankings.ts` | criar | busca views/RPCs + monta rankings |
| `features/hooks/usePublicLiveMatch.ts` | criar | jogo atual/último/próximo + eventos + gol detectado |
| `components/public/RankingPodiumCard.tsx` | criar | pódio com desníveis (telão) |
| `components/public/StandingsCard.tsx` | criar | classificação (telão) |
| `components/public/LiveMatchCard.tsx` | criar | placar ao vivo / último + próximo |
| `components/public/GoalCelebration.tsx` | criar | animação de gol em tela cheia |
| `components/public/LiveCarousel.tsx` | criar | orquestração dos cards |
| `app/(public)/live/[championshipId]/page.tsx` | criar | página do telão |
| `components/public/stats/RankingsTab.tsx` | criar | aba Rankings |
| `components/public/stats/StandingsTab.tsx` | criar | aba Classificação |
| `components/public/stats/PlayersTab.tsx` | criar | aba Jogadores + perfil |
| `app/(public)/stats/[championshipId]/page.tsx` | criar | página de estatísticas |

Fatos do schema que o plano usa (verificados):
- `match_events_v2`: `event_type TEXT` livre (sem enum) — `PENALTY_SAVE` não exige mudança de schema; `deleted_at` é soft delete; assistência fica em `assist_player_id` **no evento GOAL** (não existem linhas `ASSIST`).
- Já são públicas (RLS `USING (true)`): `match_events_v2`, `group_slots`, `penalty_shootouts`, `match_lineups`.
- Posições em `players.preferred_position`: `GOL`, `ZAG`, `MEI`, `ATA` (strings livres — tratar genérico).
- `knockout_matches`: `status` (`NOT_STARTED|IN_PROGRESS|COMPLETED`), `home_score/away_score`, `current_period`, `period_started_at`, `scheduled_at`, `penalty_home_score/penalty_away_score`; times do jogo via `match_slots` (`slot_order` 1=casa, 2=visitante).
- `phases.vote_weight` e `best_player_votes` existem (PR #38).
- `championship_registrations.final_overall` (76–94), foto em `profile_photo_link`.

---

### Task 1: Setup do Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Instalar vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["lib/**/*.test.ts", "features/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Adicionar script em `package.json`** (dentro de `"scripts"`, após `"lint"`)

```json
"test": "vitest run",
```

- [ ] **Step 4: Teste de sanidade** — criar `lib/public/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("roda", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 5: Remover o teste de sanidade e commitar**

```bash
rm lib/public/sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: Migration — views, funções e policies públicas

**Files:**
- Create: `supabase/migrations/20260613000000_public_pages.sql`

- [ ] **Step 1: Escrever a migration**

```sql
BEGIN;

-- ── Páginas públicas: views seguras, funções de ranking e leitura anônima ──
-- IMPORTANTE: `players` e `championship_registrations` NÃO recebem policy anon.
-- Dados sensíveis (cpf, email, whatsapp, birth_date, instagram) ficam fora das
-- views. As views rodam como owner (security_invoker=false, default), de
-- propósito: expõem só as colunas listadas.

-- 1. View de jogadores públicos (uma linha por inscrição)
CREATE OR REPLACE VIEW public.public_players AS
SELECT DISTINCT ON (cr.id)
  cr.id              AS registration_id,
  cr.championship_id,
  p.name             AS player_name,
  p.official_name,
  p.preferred_position AS position,
  cr.profile_photo_link AS photo_url,
  cr.final_overall,
  ct.id              AS championship_team_id,
  t.name             AS team_name,
  t.logo_url         AS team_logo_url
FROM public.championship_registrations cr
JOIN public.players p ON p.id = cr.player_id
LEFT JOIN public.championship_team_players ctp ON ctp.registration_id = cr.id
LEFT JOIN public.championship_teams ct ON ct.id = ctp.championship_team_id
LEFT JOIN public.teams t ON t.id = ct.team_id
ORDER BY cr.id, ctp.created_at ASC;

GRANT SELECT ON public.public_players TO anon, authenticated;

-- 2. View de estatísticas por jogador (eventos + partidas jogadas)
CREATE OR REPLACE VIEW public.public_player_stats AS
WITH ev AS (
  SELECT e.*, km.championship_id
  FROM public.match_events_v2 e
  JOIN public.knockout_matches km ON km.id = e.knockout_match_id
  WHERE e.deleted_at IS NULL
),
-- Cada evento atribuído ao jogador; assistências vêm do GOAL.assist_player_id
attributed AS (
  SELECT championship_id, player_id AS registration_id, event_type FROM ev WHERE player_id IS NOT NULL
  UNION ALL
  SELECT championship_id, assist_player_id, 'ASSIST' FROM ev
  WHERE event_type = 'GOAL' AND assist_player_id IS NOT NULL
),
event_stats AS (
  SELECT
    championship_id,
    registration_id,
    COUNT(*) FILTER (WHERE event_type = 'GOAL')         AS goals,
    COUNT(*) FILTER (WHERE event_type = 'ASSIST')       AS assists,
    COUNT(*) FILTER (WHERE event_type = 'YELLOW_CARD')  AS yellow_cards,
    COUNT(*) FILTER (WHERE event_type = 'RED_CARD')     AS red_cards,
    COUNT(*) FILTER (WHERE event_type = 'SAVE')         AS decisive_saves,
    COUNT(*) FILTER (WHERE event_type = 'PENALTY_SAVE') AS penalty_saves,
    COUNT(*) FILTER (WHERE event_type = 'FOUL')         AS fouls
  FROM attributed
  GROUP BY championship_id, registration_id
),
played AS (
  SELECT km.championship_id, ml.player_id AS registration_id,
         COUNT(DISTINCT ml.knockout_match_id) AS matches_played
  FROM public.match_lineups ml
  JOIN public.knockout_matches km ON km.id = ml.knockout_match_id
  WHERE km.status IN ('IN_PROGRESS', 'COMPLETED')
  GROUP BY km.championship_id, ml.player_id
)
SELECT
  COALESCE(es.championship_id, pl.championship_id) AS championship_id,
  COALESCE(es.registration_id, pl.registration_id) AS registration_id,
  COALESCE(es.goals, 0)          AS goals,
  COALESCE(es.assists, 0)        AS assists,
  COALESCE(es.yellow_cards, 0)   AS yellow_cards,
  COALESCE(es.red_cards, 0)      AS red_cards,
  COALESCE(es.decisive_saves, 0) AS decisive_saves,
  COALESCE(es.penalty_saves, 0)  AS penalty_saves,
  COALESCE(es.fouls, 0)          AS fouls,
  COALESCE(pl.matches_played, 0) AS matches_played
FROM event_stats es
FULL OUTER JOIN played pl
  ON pl.championship_id = es.championship_id AND pl.registration_id = es.registration_id;

GRANT SELECT ON public.public_player_stats TO anon, authenticated;

-- 3. View do radar (médias de avaliação dos organizadores, 1-5)
CREATE OR REPLACE VIEW public.public_player_skills AS
SELECT
  oe.registration_id,
  cr.championship_id,
  oe.skill,
  ROUND(AVG(oe.rating)::numeric, 2) AS rating
FROM public.organizer_evaluations oe
JOIN public.championship_registrations cr ON cr.id = oe.registration_id
GROUP BY oe.registration_id, cr.championship_id, oe.skill;

GRANT SELECT ON public.public_player_skills TO anon, authenticated;

-- 4. IOG = (5 - MGS) + 2*PD + 2*MDD (FAQ oficial); só goleiros com partidas
CREATE OR REPLACE FUNCTION public.public_goalkeeper_iog(p_championship_id uuid)
RETURNS TABLE (
  registration_id uuid,
  matches_played bigint,
  goals_conceded bigint,
  penalty_saves bigint,
  decisive_saves bigint,
  iog numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH gk AS (
    SELECT cr.id
    FROM championship_registrations cr
    JOIN players p ON p.id = cr.player_id
    WHERE cr.championship_id = p_championship_id
      AND p.preferred_position = 'GOL'
  ),
  gk_matches AS (
    SELECT ml.player_id AS registration_id, ml.knockout_match_id, ml.championship_team_id
    FROM match_lineups ml
    JOIN knockout_matches km ON km.id = ml.knockout_match_id
    WHERE ml.player_id IN (SELECT id FROM gk)
      AND km.status = 'COMPLETED'
  ),
  conceded AS (
    -- Gols sofridos = gols do adversário + gols contra do próprio time
    SELECT gm.registration_id,
           COUNT(e.id) AS goals_conceded,
           COUNT(DISTINCT gm.knockout_match_id) AS matches_played
    FROM gk_matches gm
    LEFT JOIN match_events_v2 e
      ON e.knockout_match_id = gm.knockout_match_id
     AND e.deleted_at IS NULL
     AND (
       (e.event_type = 'GOAL'     AND e.team_id <> gm.championship_team_id) OR
       (e.event_type = 'OWN_GOAL' AND e.team_id  = gm.championship_team_id)
     )
    GROUP BY gm.registration_id
  ),
  saves AS (
    SELECT e.player_id AS registration_id,
           COUNT(*) FILTER (WHERE e.event_type = 'PENALTY_SAVE') AS penalty_saves,
           COUNT(*) FILTER (WHERE e.event_type = 'SAVE')         AS decisive_saves
    FROM match_events_v2 e
    JOIN knockout_matches km ON km.id = e.knockout_match_id
    WHERE km.championship_id = p_championship_id
      AND e.deleted_at IS NULL
      AND e.player_id IN (SELECT id FROM gk)
    GROUP BY e.player_id
  )
  SELECT
    c.registration_id,
    c.matches_played,
    c.goals_conceded,
    COALESCE(s.penalty_saves, 0)  AS penalty_saves,
    COALESCE(s.decisive_saves, 0) AS decisive_saves,
    ROUND(
      (5 - (c.goals_conceded::numeric / NULLIF(c.matches_played, 0)))
      + 2 * COALESCE(s.penalty_saves, 0)
      + 2 * (COALESCE(s.decisive_saves, 0)::numeric / NULLIF(c.matches_played, 0)),
      2
    ) AS iog
  FROM conceded c
  LEFT JOIN saves s ON s.registration_id = c.registration_id
  WHERE c.matches_played > 0
  ORDER BY iog DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_goalkeeper_iog(uuid) TO anon, authenticated;

-- 5. Candidatos a Revelação: overall <= limite (default 85), ranqueados por
--    participações em gol por partida; desempate por menor overall
CREATE OR REPLACE FUNCTION public.public_revelation_candidates(
  p_championship_id uuid,
  p_overall_threshold numeric DEFAULT 85
)
RETURNS TABLE (
  registration_id uuid,
  goals bigint,
  assists bigint,
  matches_played bigint,
  participations_per_match numeric,
  final_overall numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.registration_id,
    s.goals,
    s.assists,
    s.matches_played,
    ROUND((s.goals + s.assists)::numeric / NULLIF(s.matches_played, 0), 2)
      AS participations_per_match,
    cr.final_overall
  FROM public.public_player_stats s
  JOIN championship_registrations cr ON cr.id = s.registration_id
  WHERE s.championship_id = p_championship_id
    AND cr.final_overall IS NOT NULL
    AND cr.final_overall <= p_overall_threshold
    AND s.matches_played > 0
  ORDER BY participations_per_match DESC NULLS LAST, cr.final_overall ASC;
$$;

GRANT EXECUTE ON FUNCTION public.public_revelation_candidates(uuid, numeric) TO anon, authenticated;

-- 6. Leitura anônima nas tabelas NÃO sensíveis que as páginas públicas usam
--    (match_events_v2, group_slots, penalty_shootouts, match_lineups já são públicas)
CREATE POLICY "anon read championships"     ON public.championships      FOR SELECT TO anon USING (true);
CREATE POLICY "anon read phases"            ON public.phases             FOR SELECT TO anon USING (true);
CREATE POLICY "anon read groups"            ON public.groups             FOR SELECT TO anon USING (true);
CREATE POLICY "anon read knockout_matches"  ON public.knockout_matches   FOR SELECT TO anon USING (true);
CREATE POLICY "anon read match_slots"       ON public.match_slots        FOR SELECT TO anon USING (true);
CREATE POLICY "anon read teams"             ON public.teams              FOR SELECT TO anon USING (true);
CREATE POLICY "anon read championship_teams" ON public.championship_teams FOR SELECT TO anon USING (true);
CREATE POLICY "anon read best_player_votes" ON public.best_player_votes  FOR SELECT TO anon USING (true);
CREATE POLICY "anon read tie_breaker_rules" ON public.tie_breaker_rules  FOR SELECT TO anon USING (true);

COMMIT;
```

- [ ] **Step 2: Aplicar localmente**

Run: `npm run db:up:local` (requer `npm run local:start` antes, se o stack não estiver de pé)
Expected: migration `20260613000000_public_pages` aplicada sem erro.

- [ ] **Step 3: Verificar acesso anônimo e ausência de colunas sensíveis**

```bash
supabase db query --local "SELECT column_name FROM information_schema.columns WHERE table_name='public_players' ORDER BY 1"
```
Expected: lista SEM `cpf`, `email`, `whatsapp`, `birth_date`, `instagram`.

```bash
supabase db query --local "SET ROLE anon; SELECT COUNT(*) FROM public_players; SELECT COUNT(*) FROM public_player_stats; RESET ROLE;"
```
Expected: counts retornam (sem permission denied).

```bash
supabase db query --local "SET ROLE anon; SELECT cpf FROM players LIMIT 1; RESET ROLE;"
```
Expected: **retorna 0 linhas** (RLS bloqueia — sem policy anon em `players`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613000000_public_pages.sql
git commit -m "feat: public views, ranking functions and anon read policies"
```

---

### Task 3: Súmula — evento PENALTY_SAVE e relabel de SAVE

**Files:**
- Modify: `app/(protected)/games/[id]/page.tsx` (mapa `EVENT_META` ~linha 36; lista `EVENT_TYPES` ~linha 241)

- [ ] **Step 1: Em `EVENT_META`, trocar o label de SAVE e adicionar PENALTY_SAVE**

```ts
  SAVE:             { icon: "save",         label: "Defesa Decisiva",   color: "text-purple-400" },
  PENALTY_SAVE:     { icon: "save",         label: "Pênalti Defendido", color: "text-purple-300" },
```

(`SAVE` substitui a linha existente `SAVE: { icon: "save", label: "Defesa", ... }`; `PENALTY_SAVE` é linha nova logo abaixo.)

- [ ] **Step 2: Em `EVENT_TYPES`, trocar o label de SAVE e adicionar PENALTY_SAVE**

```ts
  { type: "SAVE", label: "Defesa Decisiva" },
  { type: "PENALTY_SAVE", label: "Pênalti Defendido" },
```

(substituem a linha `{ type: "SAVE", label: "Defesa" },`)

- [ ] **Step 3: Verificar manualmente**

Run: `npm run dev` → abrir um jogo em `/games/[id]` → ver botões "Defesa Decisiva" e "Pênalti Defendido" no registro de eventos.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/games/[id]/page.tsx"
git commit -m "feat: add PENALTY_SAVE event and relabel SAVE as decisive save"
```

---

### Task 4: Tipos públicos + rankings puros (TDD)

**Files:**
- Create: `lib/public/types.ts`
- Create: `lib/public/match-stats.ts`
- Test: `lib/public/match-stats.test.ts`

- [ ] **Step 1: Criar `lib/public/types.ts`**

```ts
// Tipos compartilhados das páginas públicas (telão e estatísticas)

export type PublicPlayer = {
  registrationId: string;
  championshipId: string;
  playerName: string;
  officialName: string | null;
  position: string | null;
  photoUrl: string | null;
  finalOverall: number | null;
  championshipTeamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

export type PublicPlayerStats = {
  registrationId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  decisiveSaves: number;
  penaltySaves: number;
  fouls: number;
  matchesPlayed: number;
};

// Entrada genérica de ranking exibida nos pódios/listas
export type RankingEntry = {
  registrationId: string;
  playerName: string;
  teamName: string | null;
  photoUrl: string | null;
  position: string | null;
  value: number;       // gols, assistências, pontos, IOG...
  detail?: string;     // ex.: "OVR 78"
};

export const POSITION_LABELS: Record<string, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  MEI: "Meia",
  ATA: "Atacante",
};
```

- [ ] **Step 2: Escrever os testes que falham** — `lib/public/match-stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  sumVotePoints,
  buildStatRanking,
  buildVoteRanking,
  groupRankingByPosition,
} from "./match-stats";
import type { PublicPlayer, PublicPlayerStats } from "./types";

const player = (over: Partial<PublicPlayer>): PublicPlayer => ({
  registrationId: "r1",
  championshipId: "c1",
  playerName: "Fulano",
  officialName: null,
  position: "ATA",
  photoUrl: null,
  finalOverall: 80,
  championshipTeamId: "ct1",
  teamName: "Leões",
  teamLogoUrl: null,
  ...over,
});

const stats = (over: Partial<PublicPlayerStats>): PublicPlayerStats => ({
  registrationId: "r1",
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  decisiveSaves: 0,
  penaltySaves: 0,
  fouls: 0,
  matchesPlayed: 1,
  ...over,
});

describe("sumVotePoints", () => {
  it("soma pontos por inscrição", () => {
    const totals = sumVotePoints([
      { registration_id: "a", points: 1 },
      { registration_id: "a", points: 3 },
      { registration_id: "b", points: 2 },
    ]);
    expect(totals.get("a")).toBe(4);
    expect(totals.get("b")).toBe(2);
  });
});

describe("buildStatRanking", () => {
  const players = [
    player({ registrationId: "a", playerName: "A" }),
    player({ registrationId: "b", playerName: "B" }),
    player({ registrationId: "c", playerName: "C" }),
  ];
  const all = [
    stats({ registrationId: "a", goals: 2 }),
    stats({ registrationId: "b", goals: 5 }),
    stats({ registrationId: "c", goals: 0 }),
  ];

  it("ordena desc pelo valor e exclui zeros", () => {
    const top = buildStatRanking(all, players, (s) => s.goals, 3);
    expect(top.map((e) => e.registrationId)).toEqual(["b", "a"]);
    expect(top[0].value).toBe(5);
  });

  it("limita ao topN", () => {
    const top = buildStatRanking(all, players, (s) => s.goals, 1);
    expect(top).toHaveLength(1);
  });

  it("ignora stats de jogador desconhecido", () => {
    const top = buildStatRanking(
      [stats({ registrationId: "zz", goals: 9 })],
      players,
      (s) => s.goals,
      3,
    );
    expect(top).toHaveLength(0);
  });
});

describe("buildVoteRanking", () => {
  it("monta ranking a partir dos totais de votos", () => {
    const players = [
      player({ registrationId: "a", playerName: "A" }),
      player({ registrationId: "b", playerName: "B" }),
    ];
    const totals = new Map([
      ["a", 3],
      ["b", 7],
    ]);
    const top = buildVoteRanking(totals, players, 3);
    expect(top.map((e) => e.registrationId)).toEqual(["b", "a"]);
  });
});

describe("groupRankingByPosition", () => {
  it("agrupa por posição, top N por grupo, omite posição vazia", () => {
    const players = [
      player({ registrationId: "a", position: "ATA" }),
      player({ registrationId: "b", position: "MEI" }),
      player({ registrationId: "c", position: "ATA" }),
      player({ registrationId: "d", position: null }),
    ];
    const totals = new Map([
      ["a", 5],
      ["b", 2],
      ["c", 8],
      ["d", 9],
    ]);
    const grouped = groupRankingByPosition(totals, players, 1);
    expect(Object.keys(grouped).sort()).toEqual(["ATA", "MEI"]);
    expect(grouped.ATA[0].registrationId).toBe("c");
    expect(grouped.ATA).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run lib/public/match-stats.test.ts`
Expected: FAIL — `Cannot find module './match-stats'`

- [ ] **Step 4: Implementar `lib/public/match-stats.ts`**

```ts
// Funções puras de ranking — alimentadas pelos hooks públicos
import type { PublicPlayer, PublicPlayerStats, RankingEntry } from "./types";

type VoteRow = { registration_id: string; points: number };

// Soma pontos de best_player_votes por inscrição
export function sumVotePoints(votes: VoteRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const v of votes) {
    totals.set(v.registration_id, (totals.get(v.registration_id) ?? 0) + v.points);
  }
  return totals;
}

function toEntry(p: PublicPlayer, value: number): RankingEntry {
  return {
    registrationId: p.registrationId,
    playerName: p.playerName,
    teamName: p.teamName,
    photoUrl: p.photoUrl,
    position: p.position,
    value,
  };
}

// Ranking por uma estatística (gols, assistências...) — exclui valor 0
export function buildStatRanking(
  stats: PublicPlayerStats[],
  players: PublicPlayer[],
  getValue: (s: PublicPlayerStats) => number,
  topN: number,
): RankingEntry[] {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  return stats
    .filter((s) => getValue(s) > 0 && byId.has(s.registrationId))
    .map((s) => toEntry(byId.get(s.registrationId)!, getValue(s)))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Ranking do Craque a partir dos totais de votos
export function buildVoteRanking(
  totals: Map<string, number>,
  players: PublicPlayer[],
  topN: number,
): RankingEntry[] {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  return [...totals.entries()]
    .filter(([id, pts]) => pts > 0 && byId.has(id))
    .map(([id, pts]) => toEntry(byId.get(id)!, pts))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Craque por posição: agrupa os totais de voto pela posição do jogador.
// Jogadores sem posição são omitidos; posições sem votados não aparecem.
export function groupRankingByPosition(
  totals: Map<string, number>,
  players: PublicPlayer[],
  topNPerPosition: number,
): Record<string, RankingEntry[]> {
  const byId = new Map(players.map((p) => [p.registrationId, p]));
  const grouped: Record<string, RankingEntry[]> = {};
  for (const [id, pts] of totals.entries()) {
    const p = byId.get(id);
    if (!p || !p.position || pts <= 0) continue;
    (grouped[p.position] ??= []).push(toEntry(p, pts));
  }
  for (const pos of Object.keys(grouped)) {
    grouped[pos].sort((a, b) => b.value - a.value);
    grouped[pos] = grouped[pos].slice(0, topNPerPosition);
  }
  return grouped;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run lib/public/match-stats.test.ts`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add lib/public/types.ts lib/public/match-stats.ts lib/public/match-stats.test.ts
git commit -m "feat: pure ranking builders for public pages"
```

---

### Task 5: Lógica do carrossel (TDD)

**Files:**
- Create: `lib/public/carousel.ts`
- Test: `lib/public/carousel.test.ts`

- [ ] **Step 1: Testes que falham** — `lib/public/carousel.test.ts`:

```ts
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
    expect(act[st.index].id).toBe("live");
    expect(st.mode).toBe("goal");
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/public/carousel.test.ts`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar `lib/public/carousel.ts`**

```ts
// Configuração e transições do carrossel do telão.
// Timers ficam no hook/componente; aqui só lógica pura (testável).

export type CarouselCardConfig = {
  id: string;
  durationMs: number;
  enabled: boolean;
};

export type CarouselMode = "rotation" | "goal";

export type CarouselState = { index: number; mode: CarouselMode };

// Sequência oficial do spec; "managers" (Melhor Cartola) aguarda modelo de votos
export const DEFAULT_CAROUSEL_CARDS: CarouselCardConfig[] = [
  { id: "live",             durationMs: 30_000, enabled: true },
  { id: "scorers",          durationMs: 10_000, enabled: true },
  { id: "assists",          durationMs: 10_000, enabled: true },
  { id: "best-by-position", durationMs: 10_000, enabled: true },
  { id: "goalkeeper",       durationMs: 10_000, enabled: true },
  { id: "revelation",       durationMs: 10_000, enabled: true },
  { id: "standings",        durationMs: 20_000, enabled: true },
  { id: "managers",         durationMs: 10_000, enabled: false },
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/public/carousel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/public/carousel.ts lib/public/carousel.test.ts
git commit -m "feat: carousel sequencing logic with goal interrupt"
```

---

### Task 6: Tema gala + layout público

**Files:**
- Modify: `app/globals.css` (apêndice no fim do arquivo)
- Create: `app/(public)/layout.tsx`

- [ ] **Step 1: Adicionar ao FIM de `app/globals.css`**

```css
/* ───────────────── Páginas públicas — tema "Noite de Gala" ───────────────── */
/* Paleta e animações dos mockups aprovados (docs/superpowers/specs/assets/) */

:root {
  --gala-bg-0: #050507;
  --gala-bg-1: #0c0a10;
  --gala-panel: #151019;
  --gala-panel-2: #0b090f;
  --gala-line: #2a2438;
  --gala-gold-1: #fff6cc;
  --gala-gold-2: #f0d060;
  --gala-gold-3: #d4a017;
  --gala-gold-glow: rgba(212, 160, 23, 0.45);
  --gala-ink: #f4f1ea;
  --gala-ink-dim: #9b94a8;
}

.gala-bg {
  background:
    radial-gradient(110% 80% at 50% -10%, #181222 0%, transparent 55%),
    radial-gradient(80% 60% at 50% 115%, #14101c 0%, transparent 60%),
    linear-gradient(180deg, var(--gala-bg-1) 0%, var(--gala-bg-0) 100%);
}

.gala-gold-text {
  background: linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.gala-panel {
  background: linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2));
  border: 1px solid var(--gala-line);
}

/* feixes de luz que derivam lentamente */
@keyframes gala-drift {
  from { transform: translateX(-6%); }
  to   { transform: translateX(6%); }
}
.gala-beams::before,
.gala-beams::after {
  content: "";
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 42%, rgba(240, 208, 96, 0.07) 50%, transparent 58%);
  animation: gala-drift 9s ease-in-out infinite alternate;
}
.gala-beams::after {
  background: linear-gradient(65deg, transparent 44%, rgba(212, 160, 23, 0.05) 52%, transparent 60%);
  animation: gala-drift 13s ease-in-out infinite alternate-reverse;
}

/* partículas douradas subindo */
@keyframes gala-float-up {
  from { transform: translateY(0); opacity: 0.35; }
  to   { transform: translateY(-110vh); opacity: 0; }
}
.gala-dust {
  position: absolute;
  bottom: -6px;
  border-radius: 50%;
  background: var(--gala-gold-2);
  box-shadow: 0 0 8px var(--gala-gold-glow);
  opacity: 0.35;
  pointer-events: none;
  animation: gala-float-up linear infinite;
}

/* brilho que percorre chips/divisores */
@keyframes gala-shine {
  0% { left: -60%; }
  60%, 100% { left: 120%; }
}

/* pulso do AO VIVO */
@keyframes gala-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}

/* celebração de gol: flash + zoom */
@keyframes goal-flash {
  0% { opacity: 0; }
  12% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes goal-pop {
  0% { transform: scale(0.6); opacity: 0; }
  18% { transform: scale(1.08); opacity: 1; }
  28% { transform: scale(1); }
  85% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.02); opacity: 0; }
}

/* transição entre cards do carrossel */
@keyframes card-in {
  from { opacity: 0; transform: translateY(24px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.animate-card-in { animation: card-in 0.6s ease forwards; }

@media (prefers-reduced-motion: reduce) {
  .gala-beams::before, .gala-beams::after, .gala-dust { animation: none; }
}
```

- [ ] **Step 2: Criar `app/(public)/layout.tsx`**

```tsx
import type { ReactNode } from "react";

// Layout público: sem auth, sem sidebar — fundo gala em tela cheia
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="gala-bg min-h-screen text-[var(--gala-ink)] antialiased">
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Verificação** — `npm run dev`, abrir `http://localhost:3000/live/qualquer-coisa` → 404 esperado (página vem nas próximas tasks); sem redirect para `/login` é o que importa (grupo `(public)` está fora do guard).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css "app/(public)/layout.tsx"
git commit -m "feat: gala theme utilities and public route group layout"
```

---

### Task 7: Hook usePublicRankings

**Files:**
- Create: `features/hooks/usePublicRankings.ts`

- [ ] **Step 1: Implementar o hook**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PublicPlayer, PublicPlayerStats, RankingEntry } from "@/lib/public/types";
import {
  sumVotePoints,
  buildStatRanking,
  buildVoteRanking,
  groupRankingByPosition,
} from "@/lib/public/match-stats";

const supabase = createClient();

type IogRow = {
  registration_id: string;
  matches_played: number;
  goals_conceded: number;
  penalty_saves: number;
  decisive_saves: number;
  iog: number;
};

type RevelationRow = {
  registration_id: string;
  goals: number;
  assists: number;
  matches_played: number;
  participations_per_match: number;
  final_overall: number;
};

export type PublicRankings = {
  players: PublicPlayer[];
  stats: PublicPlayerStats[];
  topScorers: RankingEntry[];
  topAssists: RankingEntry[];
  craque: RankingEntry[];
  craqueByPosition: Record<string, RankingEntry[]>;
  goalkeepers: RankingEntry[];
  revelations: RankingEntry[];
};

const EMPTY: PublicRankings = {
  players: [], stats: [], topScorers: [], topAssists: [],
  craque: [], craqueByPosition: {}, goalkeepers: [], revelations: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPlayer(r: any): PublicPlayer {
  return {
    registrationId: r.registration_id,
    championshipId: r.championship_id,
    playerName: r.player_name,
    officialName: r.official_name,
    position: r.position,
    photoUrl: r.photo_url,
    finalOverall: r.final_overall === null ? null : Number(r.final_overall),
    championshipTeamId: r.championship_team_id,
    teamName: r.team_name,
    teamLogoUrl: r.team_logo_url,
  };
}

function mapStats(r: any): PublicPlayerStats {
  return {
    registrationId: r.registration_id,
    goals: r.goals, assists: r.assists,
    yellowCards: r.yellow_cards, redCards: r.red_cards,
    decisiveSaves: r.decisive_saves, penaltySaves: r.penalty_saves,
    fouls: r.fouls, matchesPlayed: r.matches_played,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Rankings públicos do campeonato — Realtime (eventos) + polling 15s
export function usePublicRankings(championshipId: string | null, topN = 3) {
  const [rankings, setRankings] = useState<PublicRankings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!championshipId) { setRankings(EMPTY); setLoading(false); return; }
    try {
      const [playersRes, statsRes, votesRes, iogRes, revRes] = await Promise.all([
        supabase.from("public_players").select("*").eq("championship_id", championshipId),
        supabase.from("public_player_stats").select("*").eq("championship_id", championshipId),
        supabase.from("best_player_votes").select("registration_id, points").eq("championship_id", championshipId),
        supabase.rpc("public_goalkeeper_iog", { p_championship_id: championshipId }),
        supabase.rpc("public_revelation_candidates", { p_championship_id: championshipId }),
      ]);

      const players = (playersRes.data ?? []).map(mapPlayer);
      const stats = (statsRes.data ?? []).map(mapStats);
      const byId = new Map(players.map((p) => [p.registrationId, p]));
      const voteTotals = sumVotePoints(votesRes.data ?? []);

      const goalkeepers: RankingEntry[] = ((iogRes.data ?? []) as IogRow[])
        .filter((r) => byId.has(r.registration_id))
        .slice(0, topN)
        .map((r) => {
          const p = byId.get(r.registration_id)!;
          return {
            registrationId: p.registrationId, playerName: p.playerName,
            teamName: p.teamName, photoUrl: p.photoUrl, position: p.position,
            value: Number(r.iog),
            detail: `${r.decisive_saves} defesas · ${r.goals_conceded} GS`,
          };
        });

      const revelations: RankingEntry[] = ((revRes.data ?? []) as RevelationRow[])
        .filter((r) => byId.has(r.registration_id))
        .slice(0, topN)
        .map((r) => {
          const p = byId.get(r.registration_id)!;
          return {
            registrationId: p.registrationId, playerName: p.playerName,
            teamName: p.teamName, photoUrl: p.photoUrl, position: p.position,
            value: Number(r.participations_per_match),
            detail: `OVR ${r.final_overall}`,
          };
        });

      setRankings({
        players, stats,
        topScorers: buildStatRanking(stats, players, (s) => s.goals, topN),
        topAssists: buildStatRanking(stats, players, (s) => s.assists, topN),
        craque: buildVoteRanking(voteTotals, players, topN),
        craqueByPosition: groupRankingByPosition(voteTotals, players, topN),
        goalkeepers, revelations,
      });
    } finally {
      setLoading(false);
    }
  }, [championshipId, topN]);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
    if (!championshipId) return;

    // Realtime nos eventos (gol muda artilharia) + polling de segurança
    const channel = supabase
      .channel(`public-rankings-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "best_player_votes", filter: `championship_id=eq.${championshipId}` }, () => { void load(); })
      .subscribe();

    pollingRef.current = setInterval(() => { void load(); }, 15_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [load, championshipId]);

  return { rankings, loading, reload: load };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos (erros pré-existentes do repo, se houver, não contam).

- [ ] **Step 3: Commit**

```bash
git add features/hooks/usePublicRankings.ts
git commit -m "feat: public rankings hook with realtime and polling"
```

---

### Task 8: Hook usePublicLiveMatch

**Files:**
- Create: `features/hooks/usePublicLiveMatch.ts`

- [ ] **Step 1: Implementar o hook**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type LiveTeam = {
  championshipTeamId: string | null;
  name: string;          // nome do time ou label do slot ("A1", "Vencedor J3"...)
  logoUrl: string | null;
  uniformColor: string | null;
};

export type LiveEvent = {
  id: string;
  eventType: string;
  eventTimeS: number;
  period: string;
  teamId: string | null;
  playerName: string | null;
  assistName: string | null;
};

export type LiveMatchInfo = {
  id: string;
  name: string | null;
  phaseName: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentPeriod: string;
  periodStartedAt: string | null;
  scheduledAt: string | null;
  home: LiveTeam;
  away: LiveTeam;
  homeScore: number;
  awayScore: number;
  penaltyHomeScore: number;
  penaltyAwayScore: number;
  events: LiveEvent[];
};

export type GoalSignal = {
  eventId: string;
  playerName: string | null;
  assistName: string | null;
  teamName: string;
};

export type PublicLiveData = {
  current: LiveMatchInfo | null;   // jogo IN_PROGRESS (único por campeonato)
  last: LiveMatchInfo | null;      // último COMPLETED
  next: LiveMatchInfo | null;      // próximo NOT_STARTED por scheduled_at
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function slotToTeam(slot: any): LiveTeam {
  const ct = slot?.championship_teams;
  const teamsRel = ct?.teams;
  const team = Array.isArray(teamsRel) ? teamsRel[0] : teamsRel;
  return {
    championshipTeamId: slot?.championship_team_id ?? null,
    name: team?.name ?? slot?.label ?? "A definir",
    logoUrl: team?.logo_url ?? null,
    uniformColor: ct?.uniform_color ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Jogo ao vivo (ou último + próximo) do campeonato, com eventos nomeados.
// onGoal dispara quando um novo evento GOAL chega após a carga inicial.
export function usePublicLiveMatch(
  championshipId: string | null,
  onGoal?: (signal: GoalSignal) => void,
) {
  const [data, setData] = useState<PublicLiveData>({ current: null, last: null, next: null });
  const [loading, setLoading] = useState(true);
  const knownGoalIdsRef = useRef<Set<string> | null>(null);
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!championshipId) { setData({ current: null, last: null, next: null }); setLoading(false); return; }
    try {
      const { data: matches } = await supabase
        .from("knockout_matches")
        .select("id, name, status, phase_id, current_period, period_started_at, scheduled_at, home_score, away_score, penalty_home_score, penalty_away_score, completed_at")
        .eq("championship_id", championshipId);

      const all = matches ?? [];
      const current = all.find((m) => m.status === "IN_PROGRESS") ?? null;
      const last = all
        .filter((m) => m.status === "COMPLETED" && m.completed_at)
        .sort((a, b) => (b.completed_at! > a.completed_at! ? 1 : -1))[0] ?? null;
      const next = all
        .filter((m) => m.status === "NOT_STARTED" && m.scheduled_at)
        .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))[0] ?? null;

      const ids = [current?.id, last?.id, next?.id].filter(Boolean) as string[];
      if (ids.length === 0) {
        knownGoalIdsRef.current = new Set();
        setData({ current: null, last: null, next: null });
        return;
      }

      const [slotsRes, eventsRes, phasesRes, playersRes] = await Promise.all([
        supabase
          .from("match_slots")
          .select("match_id, slot_order, label, championship_team_id, championship_teams(id, uniform_color, teams(name, logo_url))")
          .in("match_id", ids)
          .order("slot_order"),
        supabase
          .from("match_events_v2")
          .select("id, knockout_match_id, event_type, event_time_s, period, team_id, player_id, assist_player_id")
          .in("knockout_match_id", ids)
          .is("deleted_at", null)
          .order("event_time_s"),
        supabase.from("phases").select("id, name").eq("championship_id", championshipId),
        supabase.from("public_players").select("registration_id, player_name").eq("championship_id", championshipId),
      ]);

      const phaseName = new Map((phasesRes.data ?? []).map((p) => [p.id, p.name]));
      const playerName = new Map((playersRes.data ?? []).map((p) => [p.registration_id, p.player_name]));

      const build = (m: typeof current): LiveMatchInfo | null => {
        if (!m) return null;
        const slots = (slotsRes.data ?? []).filter((s) => s.match_id === m.id);
        const home = slotToTeam(slots[0]);
        const away = slotToTeam(slots[1]);
        const events: LiveEvent[] = (eventsRes.data ?? [])
          .filter((e) => e.knockout_match_id === m.id)
          .map((e) => ({
            id: e.id,
            eventType: e.event_type,
            eventTimeS: e.event_time_s,
            period: e.period,
            teamId: e.team_id,
            playerName: e.player_id ? playerName.get(e.player_id) ?? null : null,
            assistName: e.assist_player_id ? playerName.get(e.assist_player_id) ?? null : null,
          }));

        // Placar ao vivo derivado dos eventos (mesma regra do useGroupStandings)
        let homeScore = m.home_score ?? 0;
        let awayScore = m.away_score ?? 0;
        if (m.status === "IN_PROGRESS" && home.championshipTeamId && away.championshipTeamId) {
          homeScore = events.filter(
            (e) =>
              (e.eventType === "GOAL" && e.teamId === home.championshipTeamId) ||
              (e.eventType === "OWN_GOAL" && e.teamId === away.championshipTeamId),
          ).length;
          awayScore = events.filter(
            (e) =>
              (e.eventType === "GOAL" && e.teamId === away.championshipTeamId) ||
              (e.eventType === "OWN_GOAL" && e.teamId === home.championshipTeamId),
          ).length;
        }

        return {
          id: m.id,
          name: m.name,
          phaseName: phaseName.get(m.phase_id ?? "") ?? null,
          status: m.status as LiveMatchInfo["status"],
          currentPeriod: m.current_period,
          periodStartedAt: m.period_started_at,
          scheduledAt: m.scheduled_at,
          home, away, homeScore, awayScore,
          penaltyHomeScore: m.penalty_home_score ?? 0,
          penaltyAwayScore: m.penalty_away_score ?? 0,
          events,
        };
      };

      const builtCurrent = build(current);

      // Detecta gols novos do jogo atual (depois da carga inicial)
      const goalEvents = (builtCurrent?.events ?? []).filter(
        (e) => e.eventType === "GOAL" || e.eventType === "OWN_GOAL",
      );
      if (knownGoalIdsRef.current === null) {
        knownGoalIdsRef.current = new Set(goalEvents.map((e) => e.id));
      } else {
        for (const g of goalEvents) {
          if (!knownGoalIdsRef.current.has(g.id)) {
            knownGoalIdsRef.current.add(g.id);
            const scoringTeam =
              g.eventType === "OWN_GOAL"
                ? (g.teamId === builtCurrent!.home.championshipTeamId ? builtCurrent!.away : builtCurrent!.home)
                : (g.teamId === builtCurrent!.home.championshipTeamId ? builtCurrent!.home : builtCurrent!.away);
            onGoalRef.current?.({
              eventId: g.id,
              playerName: g.playerName,
              assistName: g.assistName,
              teamName: scoringTeam.name,
            });
          }
        }
      }

      setData({ current: builtCurrent, last: build(last), next: build(next) });
    } finally {
      setLoading(false);
    }
  }, [championshipId]);

  useEffect(() => {
    knownGoalIdsRef.current = null;
    queueMicrotask(() => { void load(); });
    if (!championshipId) return;

    const channel = supabase
      .channel(`public-live-${championshipId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "knockout_matches", filter: `championship_id=eq.${championshipId}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void load(); })
      .subscribe();

    pollingRef.current = setInterval(() => { void load(); }, 15_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [load, championshipId]);

  return { ...data, loading, reload: load };
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add features/hooks/usePublicLiveMatch.ts
git commit -m "feat: public live match hook with goal detection"
```

---

### Task 9: Cards do telão — RankingPodiumCard e StandingsCard

**Files:**
- Create: `components/public/RankingPodiumCard.tsx`
- Create: `components/public/StandingsCard.tsx`

Referência visual: `docs/superpowers/specs/assets/2026-06-12-public-live-screen-mockup.html` (Card 2).

- [ ] **Step 1: Criar `components/public/RankingPodiumCard.tsx`**

```tsx
"use client";

import Image from "next/image";
import type { RankingEntry } from "@/lib/public/types";

type Props = {
  championshipName: string;
  title: string;          // "Artilheiros"
  subtitle: string;       // "corrida pela chuteira de ouro"
  unit: string;           // "GOLS", "ASSIST.", "PTS", "IOG"
  entries: RankingEntry[]; // já ordenado desc (até 3)
};

// Pódio com desníveis (mockup v5): 2º | 1º | 3º, degraus numerados
const ORDER: Array<{ rank: 1 | 2 | 3; medal: string }> = [
  { rank: 2, medal: "🥈" },
  { rank: 1, medal: "👑" },
  { rank: 3, medal: "🥉" },
];

const STEP_STYLE: Record<number, string> = {
  1: "h-16 text-3xl border-[rgba(212,160,23,.5)] text-[var(--gala-gold-1)] bg-gradient-to-b from-[rgba(212,160,23,.24)] to-[var(--gala-panel-2)]",
  2: "h-11 text-xl text-slate-200",
  3: "h-7 text-base text-[#e8b27d]",
};

function Avatar({ entry, first }: { entry: RankingEntry; first: boolean }) {
  const cls = first
    ? "bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] shadow-[0_0_24px_var(--gala-gold-glow)]"
    : "bg-gradient-to-br from-[#cdd6ea] to-[#7e8aa8]";
  return entry.photoUrl ? (
    <Image
      src={entry.photoUrl}
      alt={entry.playerName}
      width={72}
      height={72}
      className="size-16 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60"
    />
  ) : (
    <div className={`flex size-16 items-center justify-center rounded-full text-xl font-black text-[#0b0a12] ${cls}`}>
      {entry.playerName.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function RankingPodiumCard({ championshipName, title, subtitle, unit, entries }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2.2vh]">
      <div className="flex items-center gap-4 text-[1.2vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      <h2 className="gala-gold-text font-serif text-[3.4vw] font-extrabold drop-shadow-[0_3px_14px_rgba(212,160,23,.3)]">
        {title}
      </h2>
      <p className="-mt-2 text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">{subtitle}</p>

      <div className="mt-[2vh] flex items-end gap-[2.2vw]">
        {ORDER.map(({ rank, medal }) => {
          const entry = entries[rank - 1];
          if (!entry) return null;
          const first = rank === 1;
          return (
            <div key={rank} className={`flex flex-col items-center ${first ? "w-[22.5vw] max-w-[275px]" : "w-[18.5vw] max-w-[225px]"}`}>
              <div
                className={`gala-panel relative flex w-full flex-col items-center gap-2 rounded-t-2xl border-b-0 px-3 pb-4 pt-5 ${
                  first ? "border-[rgba(212,160,23,.55)] shadow-[0_14px_44px_rgba(212,160,23,.16)]" : ""
                }`}
              >
                <span className="absolute -top-4 text-2xl drop-shadow-lg">{medal}</span>
                <Avatar entry={entry} first={first} />
                <span className="text-[1.3vw] font-extrabold">{entry.playerName}</span>
                <span className="text-[0.85vw] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
                </span>
                <span className={`font-serif text-[2.9vw] font-extrabold leading-none ${first ? "gala-gold-text" : "text-slate-200"}`}>
                  {entry.value}
                  <small className="ml-1 align-middle font-sans text-[0.8vw] tracking-[2px] text-[var(--gala-ink-dim)]">{unit}</small>
                </span>
              </div>
              <div className={`flex w-full items-center justify-center rounded-b-xl border border-[var(--gala-line)] bg-gradient-to-b from-[#1a1424] to-[#0d0a13] font-serif font-extrabold ${STEP_STYLE[rank]}`}>
                {rank}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `components/public/StandingsCard.tsx`**

```tsx
"use client";

import type { TeamStanding } from "@/features/hooks/useGroupStandings";

type Props = {
  championshipName: string;
  standings: Record<string, TeamStanding[]>; // por grupo (useGroupStandings)
  groupLabels: Record<string, string>;
};

const HEADERS = ["P", "J", "V", "E", "D", "GP", "GC", "SG"];

export default function StandingsCard({ championshipName, standings, groupLabels }: Props) {
  const groups = Object.keys(standings).sort();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vh] px-[4vw]">
      <div className="flex items-center gap-4 text-[1.1vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      <h2 className="gala-gold-text font-serif text-[3vw] font-extrabold">Classificação</h2>

      <div className={`grid w-full gap-[2vw] ${groups.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[60vw]"}`}>
        {groups.map((g) => (
          <div key={g} className="gala-panel rounded-2xl p-[1.2vw]">
            <h3 className="mb-2 text-[1.1vw] font-bold uppercase tracking-[3px] text-[var(--gala-gold-1)]">
              {groupLabels[g] ?? `Grupo ${g}`}
            </h3>
            <table className="w-full text-[1vw]">
              <thead>
                <tr className="text-[0.8vw] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  <th className="pb-1 text-left">Time</th>
                  {HEADERS.map((h) => (
                    <th key={h} className="pb-1 text-center">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings[g].map((t, i) => (
                  <tr
                    key={t.championshipTeamId}
                    className={`border-t border-[var(--gala-line)]/60 ${i < 2 ? "text-[var(--gala-gold-1)]" : "text-[var(--gala-ink)]"}`}
                  >
                    <td className="flex items-center gap-2 py-[0.45vw] font-semibold">
                      <span className={`w-5 text-center font-extrabold ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>
                        {i + 1}
                      </span>
                      {t.name}
                    </td>
                    <td className="text-center font-extrabold">{t.points}</td>
                    <td className="text-center">{t.played}</td>
                    <td className="text-center">{t.won}</td>
                    <td className="text-center">{t.drawn}</td>
                    <td className="text-center">{t.lost}</td>
                    <td className="text-center">{t.goalsFor}</td>
                    <td className="text-center">{t.goalsAgainst}</td>
                    <td className="text-center">{t.goalDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit` → sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add components/public/RankingPodiumCard.tsx components/public/StandingsCard.tsx
git commit -m "feat: podium and standings cards for live screen"
```

---

### Task 10: LiveMatchCard + GoalCelebration

**Files:**
- Create: `components/public/LiveMatchCard.tsx`
- Create: `components/public/GoalCelebration.tsx`

Referência visual: mockup Card 1 (eventos sob cada time, `×` dourado, fase em linha própria).

- [ ] **Step 1: Criar `components/public/LiveMatchCard.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { LiveMatchInfo, LiveTeam, LiveEvent } from "@/features/hooks/usePublicLiveMatch";

type Props = {
  championshipName: string;
  current: LiveMatchInfo | null;
  last: LiveMatchInfo | null;
  next: LiveMatchInfo | null;
};

const PERIOD_LABELS: Record<string, string> = {
  not_started: "Aguardando",
  period_1: "1º TEMPO",
  halftime: "INTERVALO",
  period_2: "2º TEMPO",
  extra_1: "PRORROGAÇÃO 1",
  extra_halftime: "INTERVALO",
  extra_2: "PRORROGAÇÃO 2",
  penalties: "PÊNALTIS",
  finished: "ENCERRADO",
};

const EVENT_ICONS: Record<string, string> = {
  GOAL: "⚽", OWN_GOAL: "⚽", YELLOW_CARD: "🟨", RED_CARD: "🟥",
};

function useElapsed(periodStartedAt: string | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!periodStartedAt) return "00:00";
  const s = Math.max(0, Math.floor((Date.now() - new Date(periodStartedAt).getTime()) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function Crest({ team }: { team: LiveTeam }) {
  return team.logoUrl ? (
    <Image src={team.logoUrl} alt={team.name} width={88} height={88} className="size-[6.8vw] max-w-[88px] rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/70" />
  ) : (
    <div className="flex size-[6.8vw] max-h-[88px] max-w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-[#1a1524] to-[#0d0a13] text-[2.2vw] font-black ring-2 ring-[var(--gala-gold-3)]/70">
      {team.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function TeamColumn({ team, events, side }: { team: LiveTeam; events: LiveEvent[]; side: "home" | "away" }) {
  const teamEvents = events.filter(
    (e) => e.teamId === team.championshipTeamId && ["GOAL", "OWN_GOAL", "YELLOW_CARD", "RED_CARD"].includes(e.eventType),
  );
  return (
    <div className="flex w-[26vw] flex-col items-center gap-2">
      <Crest team={team} />
      <span className="text-[1.6vw] font-extrabold tracking-[2px]">{team.name.toUpperCase()}</span>
      <span
        className="h-1 w-3/5 rounded"
        style={{ background: team.uniformColor ?? "var(--gala-gold-3)", boxShadow: `0 0 14px ${team.uniformColor ?? "var(--gala-gold-glow)"}` }}
      />
      <div className="mt-1 flex flex-col gap-1 text-center text-[1vw] text-[var(--gala-ink-dim)]" data-side={side}>
        {teamEvents.map((e) => (
          <span key={e.id}>
            {EVENT_ICONS[e.eventType]} <b className="font-semibold text-[var(--gala-ink)]">{e.playerName ?? "—"}</b>{" "}
            <span className="tabular-nums text-[var(--gala-gold-2)]">{Math.floor(e.eventTimeS / 60)}&apos;</span>
            {e.eventType === "GOAL" && e.assistName ? (
              <em className="not-italic text-[#6f687d]"> (assist. {e.assistName})</em>
            ) : null}
            {e.eventType === "OWN_GOAL" ? <em className="not-italic text-[#6f687d]"> (contra)</em> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScorePanel({ home, away }: { home: number; away: number }) {
  return (
    <div className="gala-panel relative mt-[1.2vh] self-start rounded-2xl px-[2.6vw] py-[1.3vw] shadow-[0_14px_44px_rgba(0,0,0,.6)] before:absolute before:inset-x-[12%] before:-top-px before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-[var(--gala-gold-3)] before:to-transparent">
      <div className="flex items-center gap-[1.6vw] font-serif text-[7vw] font-extrabold leading-none">
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{home}</span>
        <span className="text-[2.4vw] font-light text-[var(--gala-gold-3)] [text-shadow:0_0_14px_var(--gala-gold-glow)]">×</span>
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{away}</span>
      </div>
    </div>
  );
}

function Eyebrow({ championshipName, phase }: { championshipName: string; phase: string | null }) {
  return (
    <>
      <div className="flex items-center gap-4 text-[1.2vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-24 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-24 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      {phase ? (
        <div className="-mt-1 text-[1vw] uppercase tracking-[5px] text-[var(--gala-ink-dim)]">
          <b className="font-bold text-[var(--gala-gold-1)]">{phase}</b>
        </div>
      ) : null}
    </>
  );
}

export default function LiveMatchCard({ championshipName, current, last, next }: Props) {
  const elapsed = useElapsed(current?.periodStartedAt ?? null);

  // Com jogo rolando: placar ao vivo completo
  if (current) {
    const showPenalties = current.currentPeriod === "penalties";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[2.2vh]">
        <Eyebrow championshipName={championshipName} phase={current.phaseName ?? current.name} />
        <div className="flex items-center gap-2 rounded-full border border-red-500/45 bg-red-500/10 px-4 py-1 text-[0.9vw] font-extrabold tracking-[2.5px] text-red-300">
          <span className="size-2 animate-[gala-pulse_1.4s_infinite] rounded-full bg-red-500 shadow-[0_0_10px_#ff4d5e]" />
          AO VIVO
        </div>
        <div className="flex w-full items-start justify-center gap-[3vw]">
          <TeamColumn team={current.home} events={current.events} side="home" />
          <ScorePanel home={current.homeScore} away={current.awayScore} />
          <TeamColumn team={current.away} events={current.events} side="away" />
        </div>
        <div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-[var(--gala-line)] bg-[#13101a] px-6 py-1.5 text-[1.1vw] font-bold tracking-wider text-[var(--gala-gold-1)] after:absolute after:left-[-60%] after:top-0 after:h-full after:w-2/5 after:animate-[gala-shine_3.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,246,204,.14)] after:to-transparent">
          {PERIOD_LABELS[current.currentPeriod] ?? current.currentPeriod}
          <span className="tabular-nums text-white">{elapsed}</span>
        </div>
        {showPenalties ? (
          <div className="text-[1.4vw] font-bold text-[var(--gala-gold-2)]">
            Pênaltis: {current.penaltyHomeScore} × {current.penaltyAwayScore}
          </div>
        ) : null}
      </div>
    );
  }

  // Sem jogo: último resultado + próximo confronto (decisão do brainstorm)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3.5vh]">
      <Eyebrow championshipName={championshipName} phase={null} />
      {last ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Último resultado</span>
          <div className="flex items-center gap-[2vw]">
            <span className="text-[1.6vw] font-extrabold">{last.home.name.toUpperCase()}</span>
            <ScorePanel home={last.homeScore} away={last.awayScore} />
            <span className="text-[1.6vw] font-extrabold">{last.away.name.toUpperCase()}</span>
          </div>
        </div>
      ) : null}
      {next ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Próximo jogo</span>
          <div className="flex items-center gap-[1.5vw] text-[1.8vw] font-extrabold">
            {next.home.name.toUpperCase()}
            <span className="text-[1.2vw] font-light text-[var(--gala-gold-3)]">vs</span>
            {next.away.name.toUpperCase()}
          </div>
          {next.scheduledAt ? (
            <span className="text-[1.1vw] text-[var(--gala-gold-2)]">
              {new Date(next.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      ) : null}
      {!last && !next ? (
        <p className="text-[1.4vw] text-[var(--gala-ink-dim)]">Nenhum jogo programado.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Criar `components/public/GoalCelebration.tsx`**

```tsx
"use client";

import type { GoalSignal } from "@/features/hooks/usePublicLiveMatch";

// Overlay de gol em tela cheia (~6s) — flash dourado + autor + assistência
export default function GoalCelebration({ signal }: { signal: GoalSignal }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 animate-[goal-flash_6s_ease-out_forwards] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(212,160,23,.55),rgba(5,5,7,.96))]" />
      <div className="relative flex animate-[goal-pop_6s_ease-out_forwards] flex-col items-center gap-[2vh] text-center">
        <span className="gala-gold-text font-serif text-[10vw] font-extrabold leading-none drop-shadow-[0_8px_40px_rgba(212,160,23,.6)]">
          GOOOL!
        </span>
        <span className="text-[3vw] font-extrabold text-white">{signal.playerName ?? signal.teamName}</span>
        {signal.assistName ? (
          <span className="text-[1.6vw] text-[var(--gala-ink-dim)]">assistência de {signal.assistName}</span>
        ) : null}
        <span className="text-[1.4vw] uppercase tracking-[5px] text-[var(--gala-gold-2)]">{signal.teamName}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit` → sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add components/public/LiveMatchCard.tsx components/public/GoalCelebration.tsx
git commit -m "feat: live match card and goal celebration overlay"
```

---

### Task 11: LiveCarousel + página /live

**Files:**
- Create: `components/public/LiveCarousel.tsx`
- Create: `app/(public)/live/[championshipId]/page.tsx`

- [ ] **Step 1: Criar `components/public/LiveCarousel.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CAROUSEL_CARDS,
  GOAL_CELEBRATION_MS,
  activeCards,
  nextIndex,
  goalInterrupt,
} from "@/lib/public/carousel";
import type { GoalSignal } from "@/features/hooks/usePublicLiveMatch";
import GoalCelebration from "@/components/public/GoalCelebration";

type Props = {
  // Cada card é renderizado pelo id; o pai injeta o conteúdo
  renderCard: (cardId: string) => React.ReactNode;
  // Cards sem dados ainda (telão pula): ex. sem classificação na fase atual
  emptyCardIds?: string[];
};

export type LiveCarouselHandle = { fireGoal: (signal: GoalSignal) => void };

export default function LiveCarousel({
  renderCard,
  emptyCardIds = [],
  handleRef,
}: Props & { handleRef?: React.MutableRefObject<LiveCarouselHandle | null> }) {
  const cards = useMemo(
    () => activeCards(DEFAULT_CAROUSEL_CARDS).filter((c) => !emptyCardIds.includes(c.id)),
    [emptyCardIds],
  );
  const [index, setIndex] = useState(0);
  const [celebration, setCelebration] = useState<GoalSignal | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (fromIndex: number, durationMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIndex((cur) => nextIndex(cards, cur === fromIndex ? cur : fromIndex));
      }, durationMs);
    },
    [cards],
  );

  // Agenda o avanço sempre que o card atual muda
  useEffect(() => {
    if (cards.length === 0) return;
    const safe = Math.min(index, cards.length - 1);
    schedule(safe, cards[safe].durationMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, cards, schedule]);

  // Gol: celebração em overlay e segura o card live por um ciclo completo
  const fireGoal = useCallback(
    (signal: GoalSignal) => {
      const st = goalInterrupt(cards);
      if (!st) return;
      setCelebration(signal);
      setIndex(st.index);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCelebration(null), GOAL_CELEBRATION_MS);
      // após a celebração, o useEffect acima reagenda a duração cheia do card live
    },
    [cards],
  );

  useEffect(() => {
    if (handleRef) handleRef.current = { fireGoal };
  }, [fireGoal, handleRef]);

  if (cards.length === 0) return null;
  const card = cards[Math.min(index, cards.length - 1)];

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* fundo animado compartilhado */}
      <div className="gala-beams pointer-events-none absolute inset-0" />
      {[12, 28, 55, 72, 88].map((left, i) => (
        <span
          key={left}
          className="gala-dust size-[3px]"
          style={{ left: `${left}%`, animationDuration: `${9 + i * 2}s`, animationDelay: `${i * 1.5}s` }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,.7)]" />

      <div key={card.id} className="animate-card-in h-full w-full">
        {renderCard(card.id)}
      </div>

      {/* progresso */}
      <div className="absolute bottom-[4.5vh] left-1/2 flex -translate-x-1/2 gap-2">
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={`h-1 w-9 rounded ${
              i === index
                ? "bg-gradient-to-r from-[var(--gala-gold-2)] to-[var(--gala-gold-3)] shadow-[0_0_8px_var(--gala-gold-glow)]"
                : "bg-[#241e30]"
            }`}
          />
        ))}
      </div>

      {celebration ? <GoalCelebration signal={celebration} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Criar `app/(public)/live/[championshipId]/page.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePublicLiveMatch, type GoalSignal } from "@/features/hooks/usePublicLiveMatch";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import LiveCarousel, { type LiveCarouselHandle } from "@/components/public/LiveCarousel";
import LiveMatchCard from "@/components/public/LiveMatchCard";
import RankingPodiumCard from "@/components/public/RankingPodiumCard";
import StandingsCard from "@/components/public/StandingsCard";
import { POSITION_LABELS } from "@/lib/public/types";

const supabase = createClient();

// Esconde o cursor após 3s parado
function useHiddenCursor() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onMove = () => {
      setHidden(false);
      clearTimeout(t);
      t = setTimeout(() => setHidden(true), 3000);
    };
    onMove();
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mousemove", onMove); clearTimeout(t); };
  }, []);
  return hidden;
}

// Mantém a TV acesa enquanto a página estiver visível
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        // @ts-expect-error — wakeLock ainda não está nos tipos do TS em todos os targets
        lock = await navigator.wakeLock?.request("screen");
      } catch { /* sem suporte: ignora */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

export default function LiveScreenPage() {
  const params = useParams<{ championshipId: string }>();
  const championshipId = params.championshipId;
  const [championshipName, setChampionshipName] = useState("Campeonato");
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const carouselRef = useRef<LiveCarouselHandle | null>(null);

  const cursorHidden = useHiddenCursor();
  useWakeLock();

  // Nome do campeonato + fase de grupos (para a classificação)
  useEffect(() => {
    void (async () => {
      const { data: champ } = await supabase
        .from("championships").select("id, name").eq("id", championshipId).maybeSingle();
      if (!champ) { setNotFound(true); return; }
      setChampionshipName(champ.name);
      const { data: phases } = await supabase
        .from("phases").select("id, type, order_number")
        .eq("championship_id", championshipId).order("order_number");
      setGroupPhaseId(phases?.find((p) => p.type === "group")?.id ?? null);
    })();
  }, [championshipId]);

  const live = usePublicLiveMatch(championshipId, (signal: GoalSignal) => {
    carouselRef.current?.fireGoal(signal);
  });
  const { rankings } = usePublicRankings(championshipId);
  const { standings, groupLabels } = useGroupStandings(championshipId, groupPhaseId);

  if (notFound) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="gala-gold-text font-serif text-4xl">Campeonato não encontrado</p>
      </main>
    );
  }

  // Cards sem dados saem da rotação
  const emptyCardIds: string[] = [];
  if (rankings.topScorers.length === 0) emptyCardIds.push("scorers");
  if (rankings.topAssists.length === 0) emptyCardIds.push("assists");
  if (Object.keys(rankings.craqueByPosition).length === 0) emptyCardIds.push("best-by-position");
  if (rankings.goalkeepers.length === 0) emptyCardIds.push("goalkeeper");
  if (rankings.revelations.length === 0) emptyCardIds.push("revelation");
  if (Object.keys(standings).length === 0) emptyCardIds.push("standings");

  const renderCard = (cardId: string) => {
    switch (cardId) {
      case "live":
        return (
          <LiveMatchCard
            championshipName={championshipName}
            current={live.current}
            last={live.last}
            next={live.next}
          />
        );
      case "scorers":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Artilheiros" subtitle="corrida pela chuteira de ouro"
            unit="GOLS" entries={rankings.topScorers}
          />
        );
      case "assists":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Maestros" subtitle="líderes de assistência"
            unit="ASSIST." entries={rankings.topAssists}
          />
        );
      case "best-by-position": {
        // Top 1 de cada posição num pódio único não cabe; mostra a posição com
        // mais votos no formato pódio e lista as demais no subtítulo do card.
        const positions = Object.keys(rankings.craqueByPosition);
        const main = positions[0];
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title={`Craques — ${POSITION_LABELS[main] ?? main}`}
            subtitle="votos por partida, peso por fase"
            unit="PTS" entries={rankings.craqueByPosition[main]}
          />
        );
      }
      case "goalkeeper":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Goleiro Destaque" subtitle="índice oficial do goleiro (IOG)"
            unit="IOG" entries={rankings.goalkeepers}
          />
        );
      case "revelation":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Revelações" subtitle="candidatos · overall ≤ 85"
            unit="P/J" entries={rankings.revelations}
          />
        );
      case "standings":
        return (
          <StandingsCard
            championshipName={championshipName}
            standings={standings} groupLabels={groupLabels}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className={cursorHidden ? "cursor-none" : ""}>
      <LiveCarousel renderCard={renderCard} emptyCardIds={emptyCardIds} handleRef={carouselRef} />
    </main>
  );
}
```

- [ ] **Step 3: Nota sobre "best-by-position"** — a v1 mostra a posição com mais votados por card (pódio legível a distância). Se o usuário preferir as 4 posições num card só, é follow-up (o card é isolado).

- [ ] **Step 4: Verificação manual**

Run: `npm run dev` → `http://localhost:3000/live/<id-de-campeonato-do-seed>` em janela anônima (sem login).
Expected: carrossel girando com fundo gala; sem jogo ao vivo, card mostra último/próximo; cards vazios são pulados.

- [ ] **Step 5: Commit**

```bash
git add components/public/LiveCarousel.tsx "app/(public)/live/[championshipId]/page.tsx"
git commit -m "feat: live screen page with config-driven carousel"
```

---

### Task 12: Página /stats — estrutura + aba Rankings

**Files:**
- Create: `components/public/stats/RankingsTab.tsx`
- Create: `app/(public)/stats/[championshipId]/page.tsx`

Referência visual: `docs/superpowers/specs/assets/2026-06-12-public-stats-page-mockup.html`.

- [ ] **Step 1: Criar `components/public/stats/RankingsTab.tsx`**

```tsx
"use client";

import Image from "next/image";
import type { RankingEntry } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";

function Row({ entry, rank }: { entry: RankingEntry; rank: number }) {
  const first = rank === 1;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-4 text-center font-extrabold ${first ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>
        {rank}
      </span>
      {entry.photoUrl ? (
        <Image src={entry.photoUrl} alt={entry.playerName} width={24} height={24} className="size-6 rounded-full object-cover" />
      ) : (
        <span className={`flex size-6 items-center justify-center rounded-full text-[9px] font-extrabold ${first ? "bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-[#0b0a12]" : "bg-[#2a2438] text-white"}`}>
          {entry.playerName.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="flex-1 truncate">
        {entry.playerName}
        <small className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
          {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
        </small>
      </span>
      <span className="font-extrabold tabular-nums text-[var(--gala-gold-2)]">{entry.value}</span>
    </div>
  );
}

function RankCard({ icon, title, subtitle, entries, highlight = false, disabled = false }: {
  icon: string; title: string; subtitle: string;
  entries: RankingEntry[]; highlight?: boolean; disabled?: boolean;
}) {
  return (
    <div className={`gala-panel rounded-xl p-4 ${highlight ? "border-[rgba(212,160,23,.4)]" : ""} ${disabled ? "opacity-45" : ""}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <span>{icon}</span>
        <span className="gala-gold-text font-serif">{title}</span>
      </h3>
      <p className="mt-0.5 text-[10px] uppercase tracking-[2px] text-[#665f73]">{subtitle}</p>
      <div className="mt-3 flex flex-col gap-2">
        {disabled ? (
          <p className="py-3 text-center text-xs tracking-wide text-[var(--gala-ink-dim)]">DISPONÍVEL EM BREVE</p>
        ) : entries.length === 0 ? (
          <p className="py-3 text-center text-xs text-[var(--gala-ink-dim)]">Sem dados ainda</p>
        ) : (
          entries.map((e, i) => <Row key={e.registrationId} entry={e} rank={i + 1} />)
        )}
      </div>
    </div>
  );
}

export default function RankingsTab({ rankings }: { rankings: PublicRankings }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RankCard icon="⚽" title="Artilheiros" subtitle="chuteira de ouro" entries={rankings.topScorers} highlight />
      <RankCard icon="🎯" title="Maestros" subtitle="líderes de assistência" entries={rankings.topAssists} />
      <RankCard icon="👑" title="Craque" subtitle="votos por partida" entries={rankings.craque} />
      <RankCard icon="🧤" title="Goleiro Destaque" subtitle="índice oficial do goleiro (IOG)" entries={rankings.goalkeepers} />
      <RankCard icon="💎" title="Revelações" subtitle="candidatos · overall ≤ 85" entries={rankings.revelations} />
      <RankCard icon="🎩" title="Cartolas" subtitle="em breve — votos por partida" entries={[]} disabled />
    </div>
  );
}
```

- [ ] **Step 2: Criar `app/(public)/stats/[championshipId]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import RankingsTab from "@/components/public/stats/RankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import PlayersTab from "@/components/public/stats/PlayersTab";

const supabase = createClient();

type TabId = "rankings" | "standings" | "players";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "rankings", label: "🏆 Rankings" },
  { id: "standings", label: "📊 Classificação" },
  { id: "players", label: "👤 Jogadores" },
];

export default function PublicStatsPage() {
  const params = useParams<{ championshipId: string }>();
  const championshipId = params.championshipId;
  const [tab, setTab] = useState<TabId>("rankings");
  const [championship, setChampionship] = useState<{ name: string; season: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("championships").select("name, season").eq("id", championshipId).maybeSingle();
      if (!data) setNotFound(true);
      else setChampionship(data);
    })();
  }, [championshipId]);

  const { rankings, loading } = usePublicRankings(championshipId);

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="gala-gold-text text-center font-serif text-3xl">Campeonato não encontrado</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-16">
      <header className="pt-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━&ensp;Estatísticas Oficiais&ensp;━ ✦ ━
        </p>
        <h1 className="gala-gold-text mt-1 font-serif text-2xl font-extrabold sm:text-3xl">
          {championship?.name ?? "…"}
        </h1>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          {championship?.season ? `Temporada ${championship.season} · ` : ""}atualizado em tempo real
        </p>
        <nav className="mt-5 flex justify-center gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === t.id
                  ? "gala-panel border-b-transparent text-[var(--gala-gold-1)]"
                  : "text-[var(--gala-ink-dim)] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="gala-panel rounded-b-xl rounded-tr-xl p-4 sm:p-5">
        {loading && rankings.players.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "rankings" ? (
          <RankingsTab rankings={rankings} />
        ) : tab === "standings" ? (
          <StandingsTab championshipId={championshipId} />
        ) : (
          <PlayersTab championshipId={championshipId} rankings={rankings} />
        )}
      </section>
    </main>
  );
}
```

(Compila só após a Task 13 criar `StandingsTab` e `PlayersTab` — as duas tasks formam um commit funcional; quem executa pode criar stubs vazios se quiser commitar antes.)

- [ ] **Step 3: Commit (junto com a Task 13)** — ver Task 13 Step 4.

---

### Task 13: /stats — abas Classificação e Jogadores (+ perfil)

**Files:**
- Create: `components/public/stats/StandingsTab.tsx`
- Create: `components/public/stats/PlayersTab.tsx`

- [ ] **Step 1: Criar `components/public/stats/StandingsTab.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";

const supabase = createClient();
const HEADERS = ["P", "J", "V", "E", "D", "GP", "GC", "SG"];

export default function StandingsTab({ championshipId }: { championshipId: string }) {
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("phases").select("id, type, order_number")
        .eq("championship_id", championshipId).order("order_number");
      setGroupPhaseId(data?.find((p) => p.type === "group")?.id ?? null);
    })();
  }, [championshipId]);

  const { standings, groupLabels, loading } = useGroupStandings(championshipId, groupPhaseId);
  const groups = Object.keys(standings).sort();

  if (loading && groups.length === 0) {
    return <div className="h-44 animate-pulse rounded-xl bg-[#171320]" />;
  }
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Classificação ainda não disponível.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g} className="overflow-x-auto rounded-xl border border-[var(--gala-line)] bg-[#171320] p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[3px] text-[var(--gala-gold-1)]">
            {groupLabels[g] ?? `Grupo ${g}`}
          </h3>
          <table className="w-full min-w-[420px] text-xs sm:text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                <th className="pb-1 text-left">Time</th>
                {HEADERS.map((h) => <th key={h} className="pb-1 text-center">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {standings[g].map((t, i) => (
                <tr key={t.championshipTeamId} className={`border-t border-[var(--gala-line)]/60 ${i < 2 ? "text-[var(--gala-gold-1)]" : ""}`}>
                  <td className="flex items-center gap-2 py-1.5 font-semibold">
                    <span className={`w-4 text-center font-extrabold ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>{i + 1}</span>
                    {t.name}
                  </td>
                  <td className="text-center font-extrabold">{t.points}</td>
                  <td className="text-center">{t.played}</td>
                  <td className="text-center">{t.won}</td>
                  <td className="text-center">{t.drawn}</td>
                  <td className="text-center">{t.lost}</td>
                  <td className="text-center">{t.goalsFor}</td>
                  <td className="text-center">{t.goalsAgainst}</td>
                  <td className="text-center">{t.goalDifference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Criar `components/public/stats/PlayersTab.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PlayerRadar from "@/components/PlayerRadar";
import type { PublicPlayer, PublicPlayerStats } from "@/lib/public/types";
import { POSITION_LABELS } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { sumVotePoints } from "@/lib/public/match-stats";

const supabase = createClient();

type SkillRow = { registration_id: string; skill: string; rating: number };

const EMPTY_STATS: Omit<PublicPlayerStats, "registrationId"> = {
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
  decisiveSaves: 0, penaltySaves: 0, fouls: 0, matchesPlayed: 0,
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function PlayersTab({ championshipId, rankings }: {
  championshipId: string; rankings: PublicRankings;
}) {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [votePoints, setVotePoints] = useState<Map<string, number>>(new Map());

  // Pontos de craque por jogador (exibidos no perfil)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("best_player_votes").select("registration_id, points")
        .eq("championship_id", championshipId);
      setVotePoints(sumVotePoints(data ?? []));
    })();
  }, [championshipId]);

  // Radar do jogador selecionado
  useEffect(() => {
    if (!selected) { setSkills([]); return; }
    void (async () => {
      const { data } = await supabase
        .from("public_player_skills").select("registration_id, skill, rating")
        .eq("registration_id", selected.registrationId);
      setSkills((data ?? []) as SkillRow[]);
    })();
  }, [selected]);

  const statsById = useMemo(
    () => new Map(rankings.stats.map((s) => [s.registrationId, s])),
    [rankings.stats],
  );
  const teams = useMemo(
    () => [...new Set(rankings.players.map((p) => p.teamName).filter(Boolean))].sort() as string[],
    [rankings.players],
  );
  const positions = useMemo(
    () => [...new Set(rankings.players.map((p) => p.position).filter(Boolean))].sort() as string[],
    [rankings.players],
  );

  // Busca por nome, nome oficial ou time — CPF fica fora de propósito (LGPD)
  const filtered = rankings.players.filter((p) => {
    if (team !== "all" && p.teamName !== team) return false;
    if (position !== "all" && p.position !== position) return false;
    if (search.trim()) {
      const q = normalize(search);
      const hay = normalize(`${p.playerName} ${p.officialName ?? ""} ${p.teamName ?? ""}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const selStats = selected
    ? statsById.get(selected.registrationId) ?? { registrationId: selected.registrationId, ...EMPTY_STATS }
    : null;

  const selectClass = "rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-xs text-[var(--gala-ink-dim)]";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar jogador por nome, apelido ou time…"
          className="flex-1 rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-sm placeholder-[#665f73] outline-none focus:border-[var(--gala-gold-3)]"
        />
        <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectClass} aria-label="Filtrar por time">
          <option value="all">Time: Todos</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={position} onChange={(e) => setPosition(e.target.value)} className={selectClass} aria-label="Filtrar por posição">
          <option value="all">Posição: Todas</option>
          {positions.map((p) => <option key={p} value={p}>{POSITION_LABELS[p] ?? p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const s = statsById.get(p.registrationId);
          return (
            <button
              key={p.registrationId}
              onClick={() => setSelected(p)}
              className="gala-panel flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-[var(--gala-gold-3)]/60"
            >
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt={p.playerName} width={40} height={40} className="size-10 rounded-full object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-[#2a2438] text-xs font-extrabold">
                  {p.playerName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.playerName}</span>
                <span className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                  {(p.position && (POSITION_LABELS[p.position] ?? p.position)) ?? "—"} · {p.teamName ?? "—"}
                </span>
              </span>
              <span className="text-right text-[10px] text-[var(--gala-ink-dim)]">
                <b className="block text-sm text-[var(--gala-gold-2)]">{s?.goals ?? 0}</b> gols
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador encontrado.</p>
        ) : null}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md border-[var(--gala-line)] bg-[#0c0a10] text-white">
          {selected && selStats ? (
            <div>
              <div className="flex items-center gap-3">
                {selected.photoUrl ? (
                  <Image src={selected.photoUrl} alt={selected.playerName} width={56} height={56} className="size-14 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-base font-black text-[#0b0a12]">
                    {selected.playerName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-lg font-extrabold">{selected.playerName}</DialogTitle>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                    {(selected.position && (POSITION_LABELS[selected.position] ?? selected.position)) ?? "—"} · {selected.teamName ?? "—"}
                  </p>
                </div>
                {selected.finalOverall !== null ? (
                  <div className="rounded-lg border border-[rgba(212,160,23,.4)] bg-[#171320] px-3 py-1.5 text-center">
                    <span className="gala-gold-text block font-serif text-xl font-extrabold">{selected.finalOverall}</span>
                    <span className="text-[8px] tracking-[2px] text-[var(--gala-ink-dim)]">OVERALL</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Gols", selStats.goals], ["Assist.", selStats.assists],
                  ["Pts Craque", votePoints.get(selected.registrationId) ?? 0],
                  ["🟨 Amarelos", selStats.yellowCards], ["🟥 Vermelhos", selStats.redCards],
                  ["Faltas", selStats.fouls],
                  ["Defesas", selStats.decisiveSaves], ["Pên. Defendidos", selStats.penaltySaves],
                  ["Jogos", selStats.matchesPlayed],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-[var(--gala-line)] bg-[#171320] px-1 py-2">
                    <span className="gala-gold-text block font-serif text-base font-extrabold">{value}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[var(--gala-ink-dim)]">{label}</span>
                  </div>
                ))}
              </div>

              {skills.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[var(--gala-line)] bg-[#171320] p-2">
                  {/* escala 1-5 → 0-100 para o domínio do PlayerRadar */}
                  <PlayerRadar data={skills.map((s) => ({ skill: s.skill, label: s.skill, value: s.rating * 20 }))} />
                  <p className="text-center text-[8px] uppercase tracking-[2px] text-[var(--gala-ink-dim)]">Radar de habilidades</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit` → sem erros novos. (Conferir export real de `components/ui/dialog`: usar os componentes que o arquivo exporta — `Dialog`, `DialogContent`, `DialogTitle` no padrão shadcn.)

- [ ] **Step 4: Verificação manual + commit das Tasks 12 e 13**

Run: `npm run dev` → `/stats/<championshipId>` em janela anônima.
Expected: 3 abas funcionam; busca/filtros filtram; perfil abre com stats + radar; nada de CPF em lugar nenhum (conferir também o payload das respostas na aba Network).

```bash
git add "app/(public)/stats/[championshipId]/page.tsx" components/public/stats/
git commit -m "feat: public stats page with rankings, standings and player profiles"
```

---

### Task 14: Verificação final

- [ ] **Step 1: Testes**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros (warnings pré-existentes ok).

- [ ] **Step 3: Checklist manual (com `npm run dev` + seed local)**

1. `/live/<id>` em janela anônima: carrossel gira na ordem e durações do spec; indicador de progresso; fundo animado.
2. Registrar um `GOAL` num jogo `IN_PROGRESS` via `/games/[id]` (logado em outra janela) → telão dispara GoalCelebration e volta ao card do jogo.
3. Registrar `PENALTY_SAVE` → contagem aparece no IOG (card Goleiro Destaque e perfil).
4. `/stats/<id>` nos 3 breakpoints (mobile 375px, tablet 768px, desktop) — DevTools responsive.
5. Busca por nome/apelido/time funciona; CPF não aparece em nenhuma resposta de rede.
6. Sem jogo ao vivo: card live mostra último resultado + próximo jogo.
7. Cursor some no telão após 3s parado.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore: final adjustments for public pages"
```

---

## Self-review (executado na escrita do plano)

- **Cobertura do spec:** rotas públicas ✓ (T6, T11, T12); views/funções/policies ✓ (T2); PENALTY_SAVE ✓ (T3); fórmulas oficiais ✓ (T2: IOG e revelação em SQL; T4: craque/artilheiro/maestro em TS); carrossel com durações e interrupção por gol ✓ (T5, T11); visual gala ✓ (T6, T9–T11 conforme mockups); stats 3 abas + busca sem CPF + perfil com radar ✓ (T12–T13); erros (telão nunca branco: dados antigos permanecem no estado dos hooks; cards vazios pulados) ✓; testes ✓ (T1, T4, T5, T14). Cartolas "em breve" ✓ (T5 desabilitado + T12 card disabled).
- **Desvio documentado:** reuso direto de `useGroupStandings` no lugar da extração para lib (ver header).
- **Tipos consistentes:** `RankingEntry`/`PublicPlayer`/`PublicPlayerStats` definidos em T4 e usados em T7, T9, T12, T13; `GoalSignal`/`LiveMatchInfo` definidos em T8 e usados em T10, T11; `CarouselCardConfig` em T5 usado em T11.
