import type { CanonicalPosition } from "./position";

/**
 * O agrupamento grosso que a regra da troca do leilao usa: goleiro, linha, ou
 * "nao da para dizer".
 *
 * UMA COPIA, e nao duas. Esta funcao existia byte a byte identica em
 * `app/(auction-fiscal)/auction-fiscal/page.tsx` e em
 * `app/api/draft/fiscal/apply-transfer/route.ts` — a tela e a API que valida a
 * mesma troca. Duas copias de uma regra concordam ate o dia em que alguem mexe
 * numa: a tela liberaria o botao e a API recusaria o POST, ou pior, o contrario.
 *
 * A CONTA E `GOL` CONTRA O RESTO, e e de proposito que o resto nao esteja
 * enumerado aqui. Detector de goleiro que lista os codigos de linha para de
 * reconhecer o dia em que nasce um codigo novo, e o jogador novo entra calado no
 * balde errado. Quem for adicionar codigo canonico mexe em `CANONICAL_POSITIONS`
 * (em `./position`) e nao precisa passar por aqui.
 *
 * A METADE MORTA SAIU. As duas copias traziam
 * `p === "gol" || p.includes("goleiro")`, tolerando os dois vocabularios da
 * travessia do bloco A8. A palavra nao chega mais: a migration
 * 20260821010000_position_vocabulary_codes.sql converteu o dado e pos CHECK em
 * `players.preferred_position` (NULL ou um dos quatro codigos), e e essa coluna
 * que os dois chamadores leem — direto em `apply-transfer`, e via
 * `app/api/draft/fiscal/transfer-window-options/route.ts` na tela. Ficar era
 * pior do que inutil: mantinha viva a impressao de que a palavra ainda circula.
 *
 * O codigo do goleiro esta preso ao tipo do enum de proposito, e nao solto num
 * literal. Foi por literal solto que o `"Goleiro"` sobreviveu dois meses dentro
 * de `features/hooks/useGoalkeeper.ts` — a mesma licao que virou o
 * `GK_POSITIONS` nomeado de la. Com a anotacao, renomear o codigo no enum quebra
 * o `tsc` NESTA linha, em vez de degradar em silencio.
 */
export type PositionGroup = "goalkeeper" | "line" | "unknown";

const GOALKEEPER_CODE: CanonicalPosition = "GOL";

/**
 * TRES desfechos, e `unknown` nao pode virar `line` por descuido.
 *
 * Quem chama compara os grupos de DOIS jogadores para liberar a troca. Colapsar
 * o vazio em `line` faria jogador sem posicao passar como par valido de um
 * jogador de linha — a trava abriria justo no dado que ninguem conferiu. Manter
 * o terceiro desfecho faz dois jogadores sem posicao casarem entre si, o que e
 * o comportamento que a tela e a API sempre tiveram.
 *
 * O trim e a caixa NAO sao a metade morta: a versao original ja normalizava
 * antes de comparar, e ` GOL ` vindo de um caminho que nao passou pelo
 * `normalizePreferredPosition` continua sendo goleiro.
 */
export function normalizePositionGroup(
  position: string | null | undefined,
): PositionGroup {
  const code = (position ?? "").trim().toUpperCase();
  if (!code) return "unknown";
  return code === GOALKEEPER_CODE ? "goalkeeper" : "line";
}
