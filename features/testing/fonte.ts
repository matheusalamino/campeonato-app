import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario, semComentarioSql } from "./sem-comentario";

/**
 * O kit de quem assevera lendo ARQUIVO COMO TEXTO.
 *
 * ── POR QUE UM SO, DE NOVO ──
 *
 * Esta e a SEGUNDA vez que este repo centraliza um antidoto de leitura de
 * fonte, e pelo mesmo motivo da primeira. O docblock de `sem-comentario.ts`
 * conta o que custou: o stripper de comentario estava copiado em QUATRO
 * arquivos, as copias DIVERGIRAM, e uma mutacao de verdade atravessou 495
 * testes verdes porque a copia fraca nao ancorava comentario no rabo da linha.
 *
 * Quando `position-detectors.test.ts` nasceu, ele copiou `fonteDe` e
 * `SEM_PALAVRA` byte a byte de `position-wiring.test.ts` — e ate ESCREVEU no
 * proprio comentario que estava copiando ("igual ao irmao de
 * position-wiring.test.ts"). Duas copias e o proximo bug esperando: o conserto
 * entra numa e a outra segue furada. Daqui em diante ha uma.
 *
 * ── O QUE MORA AQUI, E POR QUE JUNTO ──
 *
 * `fonteDe`/`sqlDe` sao leitura; `SEM_PALAVRA` e vocabulario. Concerns
 * diferentes, mesmo arquivo, de proposito: os dois unicos consumidores sao os
 * dois testes de vocabulario de posicao, e foi exatamente a pergunta "onde isso
 * mora?" que produziu as copias. Separar em dois arquivos devolveria a duvida
 * sem pagar nada.
 */

const RAIZ = process.cwd();

/** Codigo TypeScript/TSX do repo, sem comentario, pronto para assertiva. */
export function fonteDe(caminho: string): string {
  return semComentario(readFileSync(join(RAIZ, caminho), "utf8"));
}

/**
 * O irmao para SQL. Separado porque o stripper e outro: em TS `--` e
 * decremento, em SQL e comentario.
 */
export function sqlDe(caminho: string): string {
  return semComentarioSql(readFileSync(join(RAIZ, caminho), "utf8"));
}

/**
 * Palavra de posicao por extenso, como LITERAL de string.
 *
 * So o literal, e de proposito, com duas razoes medidas:
 *
 *  - `const goleiro = [...]` em `PlayerForm` e nome de variavel de habilidade e
 *    nao tem nada com o vocabulario da coluna.
 *  - `LineupControl` diz "Selecione 1 Goleiro + 5 Linha" em texto de JSX, que e
 *    rotulo de tela, nao vocabulario de coluna.
 *
 * A crase entra na classe junto com as aspas, e isso e load-bearing nos dois
 * sentidos: pega `` `Goleiro` `` num template literal, e por isso mesmo EXIGE
 * que o `semComentario` passe antes — `PlayerSearchCard` tem `Meia` entre
 * crases no docblock que explica a virada, e sem o stripper esta varredura
 * reprovaria contra codigo CERTO, castigando quem comentou bem.
 */
export const SEM_PALAVRA = /["'`](Goleiro|Zagueiro|Meia|Atacante)["'`]/;
