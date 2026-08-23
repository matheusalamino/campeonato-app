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

/** Os cinco valores da CHECK das nove colunas de pote. */
export const POT_POSITIONS = [
  ...CANONICAL_POSITIONS,
  EXTRA_POT_POSITION,
] as const;

export type PotPosition = (typeof POT_POSITIONS)[number];

/**
 * O rotulo por extenso de cada categoria de pote.
 *
 * ── POR QUE UM MAPA PROPRIO, E NAO O `POSITION_LABELS` ──
 *
 * Porque `POSITION_LABELS` e `Record<CanonicalPosition, string>`, e um `EXT` la
 * dentro NAO COMPILA — TS2353, medido. O mapa do jogador ja recusa o
 * vocabulario do pote sozinho; nao e preciso creditar a ele nenhuma proibicao
 * de banco.
 *
 * E as duas migrations dizem coisas DIFERENTES, que e facil trocar de lugar:
 * quem recusa `EXT` em `players.preferred_position` e a CHECK da
 * 20260821010000, que aceita quatro valores e nada mais. O que a 20260821020000
 * grita em letras maiusculas e o inverso — nao TIRAR o `EXT` da CHECK do pote
 * em nome da simetria, porque a proxima finalizacao de pote falharia e os nao
 * vendidos ficariam sem destino.
 *
 * A porta que "uniformizar" abriria de verdade nao e o mapa de rotulo: e
 * `CANONICAL_POSITIONS`, que declara o vocabulario do jogador uma vez so e
 * alimenta o `z.enum` de `features/registration/schema.ts` (cujo valor vai
 * direto para o insert de `services/public-registration.ts`), os `<option>` dos
 * formularios de jogador e o `POT_POSITIONS` logo abaixo. Alargar AQUELA lista
 * e que ofereceria `EXT` como posicao de jogador.
 *
 * Mapa proprio nao uniformiza nada — RECONHECE que o pote tem vocabulario
 * proprio. Sao dois dominios e dois mapas: quatro entradas la, cinco aqui.
 *
 * Tipado por `PotPosition`, entao entrada faltando NAO compila. Isso resolve
 * metade do problema; a outra metade e que a fonte real e a coluna, que o `tsc`
 * ve como `string`. Dai o `potLabel` abaixo, e nao indexacao crua.
 */
export const POT_LABELS: Record<PotPosition, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  MEI: "Meia",
  ATA: "Atacante",
  EXT: "Extra",
};

/**
 * O rotulo de uma categoria de pote vinda do BANCO, que o `tsc` ve como
 * `string`.
 *
 * A CHECK das nove colunas garante o dominio no banco, mas garantia de banco
 * nao e tipo: o valor chega aqui como `string` e indexar o `Record` cru
 * imprimiria `undefined` na tela para qualquer coisa fora dos cinco. Devolve o
 * BRUTO nesse caso — pote com rotulo estranho e legivel; pote escrito
 * `undefined` nao.
 *
 * O `Object.hasOwn` nao e cerimonia: sem ele, `POT_LABELS["constructor"]`
 * alcanca o prototipo de Object e a tela renderiza uma FUNCAO. Mesmo furo que
 * `POSITION_ALIASES` teve em `features/players/position.ts`, e o conserto entrou
 * la depois de acontecer.
 */
export function potLabel(position: string): string {
  return Object.hasOwn(POT_LABELS, position)
    ? POT_LABELS[position as PotPosition]
    : position;
}

/**
 * `Pote 3 (Meia)` — o titulo que aparece no extrato do cartola.
 *
 * Existe como funcao, e nao como template solto em cada chamador, por causa de
 * um acoplamento MEDIDO: `team-manager/balance/page.tsx` casa transacao com o
 * pote ativo procurando esta string DENTRO da `description` gravada pelos
 * routes, quando a linha nao tem `pot_position` preenchido. Produtor e
 * consumidor montavam o texto separados, cada um com seu template. Trocar o
 * rotulo em um so quebraria o casamento em silencio — a aba de saldo pararia de
 * destacar as transacoes do pote aberto, sem erro nenhum.
 */
export function potTitle(potNumber: number | string, position: string): string {
  return `Pote ${potNumber} (${potLabel(position)})`;
}
