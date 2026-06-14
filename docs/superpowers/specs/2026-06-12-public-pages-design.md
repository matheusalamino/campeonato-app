# Design: Páginas Públicas — Telão Ao Vivo e Estatísticas

**Data:** 2026-06-12
**Status:** Aprovado (brainstorming com Wellmmer)
**Branch:** `feat/public-stats-pages` (criada da `develop` + merge das PRs #27 FAQ e #38 Craque do Campeonato)

## Objetivo

Duas páginas públicas (sem autenticação) para o campeonato:

1. **`/live/[championshipId]`** — telão para o dia do campeonato: carrossel fullscreen de cards com placar ao vivo, rankings e classificação, rodando sozinho numa TV/projetor 1080p, sem interação.
2. **`/stats/[championshipId]`** — estatísticas gerais responsivas (celular/tablet/desktop) com rankings, classificação, busca e perfil público de jogador.

## Decisões registradas

| Tema | Decisão |
|---|---|
| Acesso | 100% público, URL com `championshipId` |
| Privacidade (LGPD) | CPF, e-mail e WhatsApp **nunca** expostos nem pesquisáveis; busca só por nome, apelido e time |
| Atualização | Supabase Realtime + polling 15s de fallback (padrão do app) |
| Visual | Direção "Noite de Gala": preto profundo + dourado animado, placar serifado dourado, pódio com desníveis (mockups aprovados em `assets/2026-06-12-public-live-screen-mockup.html` e `assets/2026-06-12-public-stats-page-mockup.html`) |
| Idioma | Rotas, código, arquivos e variáveis em inglês; textos de UI e comentários em PT-BR |
| Sem jogo ao vivo | Card do jogo vira "último resultado + próximo confronto" |
| Avaliações no perfil público | Exibe overall + radar + estatísticas de jogo |

## Definições oficiais dos rankings (FAQ/regulamento, pós PR #27)

- **Artilheiro** — mais gols (`match_events_v2.event_type = 'GOAL'`).
- **Maestro** — mais assistências (`event_type = 'ASSIST'`).
- **Craque (Melhor Jogador)** — soma de pontos em `best_player_votes` (PR #38; peso por fase via `phases.vote_weight`). O card "por posição" do telão agrupa esses pontos pela posição do jogador; posições sem votados são omitidas.
- **Goleiro Destaque (IOG)** — `IOG = (5 − MGS) + (2 × PD) + (2 × MDD)`:
  - `MGS` = gols sofridos pelo time nas partidas em que o goleiro esteve escalado ÷ partidas jogadas (cada time tem exatamente 1 goleiro no elenco);
  - `PD` = pênaltis defendidos (novo evento `PENALTY_SAVE`);
  - `MDD` = defesas decisivas (`SAVE`) ÷ partidas jogadas.
- **Revelação** — escolha **manual** da organização entre elegíveis com overall ≤ 85 (limite configurável, default 85). As páginas mostram os **candidatos**: elegíveis ranqueados por participações em gols (gols + assistências) por partida; desempate pelo menor overall.
- **Melhor Cartola** — voto por partida (arbitragem + organização), pontos por fase. **Sem modelo de dados ainda** → card previsto na config porém desabilitado ("em breve").

## Arquitetura

Abordagem aprovada: **views SQL públicas + hooks client** (fórmulas em funções SQL pequenas; UI/carrossel/filtros client-side seguindo os padrões do app).

### Rotas (Next.js App Router)

```
app/(public)/
├── layout.tsx                          # sem auth, sem sidebar, tema gala
├── live/[championshipId]/page.tsx      # telão
└── stats/[championshipId]/page.tsx     # estatísticas responsivas
```

### Migration `public_pages` (uma migration nova)

1. **Views com acesso `anon`** (somente colunas seguras):
   - `public_players` — registration_id, nome, apelido, foto, posição, time, overall. Deriva de `championship_registrations` + `players` + `championship_team_players`. **Sem CPF/e-mail/WhatsApp.**
   - `public_player_stats` — agregado por inscrição: partidas, gols, assistências, amarelos, vermelhos, defesas decisivas, pênaltis defendidos, faltas (a partir de `match_events_v2`, ignorando `deleted_at`).
2. **Funções SQL** (`SECURITY DEFINER`, `GRANT EXECUTE TO anon`):
   - `public_goalkeeper_iog(championship_id)` — fórmula IOG; goleiro sem partidas fica de fora (sem divisão por zero).
   - `public_revelation_candidates(championship_id, overall_threshold int default 85)`.
3. **Policies `anon SELECT`** nas tabelas não sensíveis usadas pelas páginas: `championships`, `phases`, `groups`, `group_slots`, `knockout_matches`, `match_slots`, `teams`, `championship_teams`, `best_player_votes`, `penalties` e `penalty_shootouts` (placar de disputas de pênaltis). `match_events_v2` já é pública.

### Súmula (mudança pequena no app interno)

- Novo tipo de evento **`PENALTY_SAVE`** ("Pênalti Defendido") nos botões e no mapa de labels de `app/(protected)/games/[id]/page.tsx`.
- `SAVE` muda o label para **"Defesa Decisiva"** (sem migração de dados).

### Classificação

Extrair o cálculo de standings hoje embutido em `features/hooks/useGroupStandings.ts` para `lib/` (função pura compartilhada), usada pelo hook existente e pelas páginas públicas — sem duplicar regra de desempate.

### Dados ao vivo

- Canal Realtime em `knockout_matches` e `match_events_v2` (filtro pelo campeonato) → refetch.
- Polling 15s como fallback (mesmo padrão híbrido do app).
- Evento `GOAL` novo no canal → gatilho da animação de gol no telão.

## Telão (`/live`)

### Carrossel

Config-driven — lista ordenada de cards `{ id, component, durationMs, enabled }`:

| # | Card | Duração |
|---|---|---|
| 1 | Jogo ao vivo (ou último resultado + próximo jogo) | 30s |
| 2 | Artilheiros (pódio top 3) | 10s |
| 3 | Maestros (pódio top 3) | 10s |
| 4 | Craque por posição (pontos de voto agrupados por posição) | 10s |
| 5 | Goleiro Destaque — IOG (pódio top 3) | 10s |
| 6 | Possíveis Revelações (pódio top 3 candidatos) | 10s |
| 7 | Classificação | 20s |
| — | Melhor Cartola — **desabilitado** até existir modelo de votos | 10s |

Comportamento:
- Transições suaves entre cards; indicador de progresso (barras) no rodapé.
- **Gol via Realtime**: interrompe o card atual → animação de gol em tela cheia (~6s: flash dourado, "GOOOL!", autor e assistência) → permanece no card do jogo por um ciclo completo (30s) → retoma a sequência.
- Cursor oculto após 3s parado; Screen Wake Lock API para a TV não dormir; animações 100% CSS.

### Visual (mockup aprovado v5)

- Fundo preto profundo com feixes de luz dourados animados, partículas subindo, vinheta.
- Eyebrow dourado com o nome do campeonato; fase em linha própria abaixo.
- Placar em painel central com filete dourado, numerais Playfair Display em gradiente ouro, separador `×` dourado.
- Eventos (gols/cartões) listados **sob o respectivo time**.
- Rankings em pódio com desníveis: degraus numerados (1 ouro no centro/alto, 2 prata, 3 bronze), card do 1º maior e coroado.
- Fotos dos jogadores e logos dos times reais; iniciais como fallback.

## Página de estatísticas (`/stats`)

3 abas (mesma identidade gala, funcional):

1. **Rankings** — grade de cards por categoria (desktop 3 colunas, mobile 1), cada um com top 3 + "ver todos" (expande lista completa). Card de Cartolas desabilitado "em breve".
2. **Classificação** — tabela por grupo (P, J, V, E, D, GP, GC, SG), zona de classificação destacada em dourado.
3. **Jogadores** — busca (nome, apelido, time — **sem CPF**) + filtros por time e posição; grade de jogadores; clique abre o **perfil público**: foto, posição, time, overall, grade de stats (gols, assistências, pontos de craque, amarelos, vermelhos, defesas, faltas) e radar de habilidades (reutiliza `PlayerRadar`).

Skeleton loaders, `prefers-reduced-motion` respeitado, acessível por teclado.

## Componentes novos (nomes finais a critério do plano)

```
components/public/
├── LiveCarousel.tsx          # orquestra cards, durações e interrupção por gol
├── LiveMatchCard.tsx         # placar ao vivo / último + próximo jogo
├── RankingPodiumCard.tsx     # pódio genérico (recebe categoria, lista, unidade)
├── StandingsCard.tsx         # classificação para o telão
├── GoalCelebration.tsx       # animação de gol em tela cheia
└── (página stats reutiliza RankingPodiumCard em versão compacta)

features/hooks/
├── usePublicLiveData.ts      # jogo atual, eventos, realtime + polling
├── usePublicRankings.ts      # artilheiros, maestros, craque, IOG, revelações
└── useCarousel.ts            # timer, ordem, interrupção
```

## Tratamento de erros

- Realtime cai → polling continua; sem indicação alarmante no telão.
- Fetch falha → mantém últimos dados em tela + indicador discreto; **nunca** tela branca no telão.
- Campeonato inexistente → página elegante de "campeonato não encontrado"; categorias sem dados → estado vazio do card (telão pula cards vazios).

## Testes

- **Unitários (TS)**: agregação de eventos → stats; ordenação/timing do carrossel; lógica de interrupção por gol; standings extraído (casos de desempate).
- **SQL**: views/funções validadas com seed na migration; extremos (goleiro sem partidas, campeonato sem eventos).
- **Manual**: telão em 1080p real; stats nos 3 breakpoints; simulação de gol ao vivo.

## Fora de escopo (v1)

- Votação/ranking de Melhor Cartola (sem modelo de dados; card fica "em breve").
- Escolha oficial da Revelação (manual, fora do app); mostramos apenas candidatos.
- Edição/admin de qualquer dado pelas páginas públicas (somente leitura).
