import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  semComentario,
  semComentarioMantendoLinhas,
  semComentarioSql,
} from "./sem-comentario";

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
 * O mesmo codigo, em LINHAS, com a numeracao intacta: `linhas[i]` e a linha
 * `i + 1` do arquivo de verdade.
 *
 * Serve a quem VARRE e precisa dizer ONDE: `vocabulary-sweep.test.ts` cita
 * `caminho:linha` na mensagem de falha, e com `fonteDe` ela citava quinze
 * linhas ACIMA do defeito, porque o docblock do arquivo tinha sumido junto com
 * as suas quebras de linha. Quem assevera com regex sobre o arquivo inteiro nao
 * paga esse preco e fica com `fonteDe`.
 */
export function linhasDe(caminho: string): string[] {
  return semComentarioMantendoLinhas(
    readFileSync(join(RAIZ, caminho), "utf8"),
  ).split("\n");
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

/**
 * O irmao para o vocabulario do POTE, e ele e mais largo em duas direcoes.
 *
 * MAIUSCULA NAO IMPORTA (`i`), porque no pote a palavra aparecia minuscula: os
 * detectores de `qualification-*`, `join-pot-bid` e `PotBidsSlide` comparavam
 * `pos.toLowerCase()` com `"goleiro"`. Sem o `i`, `SEM_PALAVRA` passaria por
 * cima de todos eles.
 *
 * E TEM MAIS ENTRADAS: `extra` e `adicional`, que sao o pote que nao e posicao
 * de ninguem (hoje `EXT`); e `meio`, `defensor` e `lateral`, que `PotMenuSlide`
 * testava e que NUNCA existiram na coluna — vocabulario que so morava naquele
 * `if`.
 *
 * O literal entre aspas segue sendo o alvo, e aqui isso rende mais do que no
 * irmao: `"Saldo Extra"`, `Pote Extra` e `extraBalance` sao rotulo de tela e
 * nome de variavel, nao vocabulario de coluna, e nenhum deles casa.
 */
export const SEM_PALAVRA_DE_POTE =
  /["'`](goleiro|zagueiro|meia|meio|atacante|extra|adicional|defensor|lateral)["'`]/i;
