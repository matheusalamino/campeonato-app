import { CANONICAL_POSITIONS, type CanonicalPosition } from "./position";

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
 * A CONTA E `GOL` CONTRA O RESTO DO ENUM, e e de proposito que esse resto nao
 * esteja enumerado aqui. Detector de goleiro que lista os codigos de linha para
 * de reconhecer o dia em que nasce um codigo novo, e o jogador novo entra calado
 * no balde errado. Quem responde "isto e canonico?" e o proprio
 * `CANONICAL_POSITIONS`, PERGUNTADO -- codigo canonico novo DE LINHA entra so
 * la (em `./position`) e cai em `line` sozinho, sem passar por aqui.
 *
 * A excecao e um SEGUNDO codigo de goleiro. Esse exige os dois lugares: a
 * comparacao abaixo, que hoje e contra um codigo so, e o loop de
 * `position-group.test.ts` que varre o enum -- ele afirma que todo canonico que
 * nao e `GOL` e de linha, e passaria a afirmar o errado para o goleiro novo.
 *
 * FORA DO ENUM E `unknown`, E NAO `line`. Decidido pelo usuario em 2026-08-22.
 * Valor que o sistema nao entende nao pode virar AFIRMACAO POSITIVA ("este e um
 * jogador de linha") -- e a mesma doutrina que `./position` ja adota ao separar
 * `unrecognized` de `empty`, onde celula preenchida que ninguem reconhece e dado
 * que precisa ser VISTO recusado. Assim a trava do leilao falha FECHADA.
 *
 * O ALCANCE, e leia antes de creditar mais do que ha. Medido contra
 * `auction-fiscal/page.tsx:191-197`, onde `transferRuleValid` e
 * `grupoA === grupoB`, e contra `apply-transfer/route.ts:181`, que compara a
 * mesma igualdade no servidor:
 *
 *  - dado MISTO (um jogador convertido, outro nao): antes a troca era liberada,
 *    agora e barrada. E este o ganho real.
 *  - ambiente TODO em palavra: nada muda. Os dois caem em `unknown`, e
 *    `unknown === unknown` libera a troca exatamente como `line === line` liberava.
 *
 * Ou seja, isto NAO e rede contra subir codigo sem a migration -- nesse cenario
 * os dois desfechos se comportam igual. O que se ganha e o caso misto e a
 * coerencia com a doutrina acima.
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
 * O codigo do goleiro esta preso ao TIPO do enum, e a razao NAO e a que parece.
 *
 * Em `features/hooks/useGoalkeeper.ts` o `"Goleiro"` sobreviveu dois meses --
 * 7e44372 (2026-06-13) ate b591e55 (2026-08-21). E ele nunca esteve solto pelo
 * corpo do hook: NASCEU dentro da constante nomeada, como
 * `new Set(["GOL", "Goleiro"])`. Nomear, portanto, nao impediu coisa nenhuma; o
 * nome hospedou a palavra e ninguem viu por dois meses.
 *
 * Quem pega e a anotacao de tipo, e disso ha prova medida: com
 * `: CanonicalPosition`, um valor de fora do enum reprova o `tsc` na linha do
 * `GOALKEEPER_CODE` abaixo, com TS2322, antes de rodar. Constante nomeada serve
 * para ACHAR o vocabulario; so o tipo RECUSA o vocabulario errado.
 */
export type PositionGroup = "goalkeeper" | "line" | "unknown";

const GOALKEEPER_CODE: CanonicalPosition = "GOL";

/**
 * O teste de pertinencia ao enum, e nao a declaracao do vocabulario -- essa mora
 * em `CANONICAL_POSITIONS`. E `Set<string>` de proposito, porque o que chega
 * aqui e texto arbitrario do banco e da API; `Set<CanonicalPosition>` faria o
 * `.has()` recusar o proprio argumento que precisa testar.
 */
const CANONICAL_CODES = new Set<string>(CANONICAL_POSITIONS);

/**
 * TRES desfechos, e `unknown` nao pode virar `line` por descuido.
 *
 * Quem chama compara os grupos de DOIS jogadores para liberar a troca. Colapsar
 * `unknown` em `line` faria jogador sem posicao — ou com posicao que ninguem
 * reconhece — passar como par valido de um jogador de linha, e a trava abriria
 * justo no dado que ninguem conferiu. Manter o terceiro desfecho faz dois
 * jogadores nessa situacao casarem entre si, e nao com um jogador de linha.
 *
 * `unknown` chega por DOIS caminhos, e os dois sao deliberados: sem valor
 * nenhum, e valor fora do enum (ver a doutrina no topo do arquivo).
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
  if (code === GOALKEEPER_CODE) return "goalkeeper";
  return CANONICAL_CODES.has(code) ? "line" : "unknown";
}
