import { CANONICAL_POSITIONS } from "@/features/players/position";

/**
 * O vocabulario da coluna de POTE do draft.
 *
 * ── POR QUE NAO E O MESMO DO JOGADOR ──
 *
 * `players.preferred_position` guarda POSICAO: `GOL`, `ZAG`, `MEI`, `ATA`, e
 * nada alem. A coluna do pote guarda CATEGORIA DE POTE, que quase sempre e uma
 * posicao — a geracao de potes copia a posicao do jogador — e as vezes e o pote
 * `EXT`, criado por `app/api/draft/finalize-pot/route.ts` para receber quem nao
 * foi vendido no leilao. `EXT` nao e posicao de ninguem.
 *
 * Entao sao dois dominios, e o do pote e SUPERCONJUNTO do outro: cinco valores
 * contra quatro. As duas CHECK no banco sao diferentes DE PROPOSITO, e a
 * migration 20260821020000 diz isso no cabecalho pelo mesmo motivo que este
 * docblock diz aqui — "uniformizar as duas" e a limpeza plausivel que apaga o
 * pote extra.
 *
 * ── POR QUE DERIVADO, E NAO ESCRITO A MAO ──
 *
 * `POT_POSITIONS` e montado a partir de `CANONICAL_POSITIONS`, e nao repetido.
 * Uma lista literal aqui envelheceria em silencio: uma quinta posicao de
 * jogador entraria na CHECK dos jogadores e o pote continuaria recusando-a, com
 * a geracao de potes falhando no meio da noite de draft. Derivado, o teste de
 * `pot-position.test.ts` reprova no mesmo commit e pede a migration junto.
 */

/** O pote que nao e posicao: destino de quem nao foi vendido no leilao. */
export const EXTRA_POT_POSITION = "EXT";

/** Os cinco valores da CHECK das sete colunas de pote. */
export const POT_POSITIONS = [
  ...CANONICAL_POSITIONS,
  EXTRA_POT_POSITION,
] as const;

export type PotPosition = (typeof POT_POSITIONS)[number];
