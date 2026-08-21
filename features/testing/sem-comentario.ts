/**
 * Tirar comentario do texto ANTES de assertar sobre ele.
 *
 * ── POR QUE ISTO EXISTE ──
 *
 * Vinte por cento deste repo esta coberto por assertivas que leem ARQUIVO COMO
 * TEXTO, porque a fiacao que elas prendem vive em `app/**` e `services/**`, que
 * o `include` do vitest nao alcanca. Assertiva que le texto tem um modo de falha
 * proprio: casar a PROSA em vez do codigo. Ele ja mordeu nas duas direcoes.
 *
 * Falso VERMELHO: a primeira versao de `rest-overlay-source.test.ts` reprovou
 * contra o codigo CERTO, porque o docblock do SabbathVideo cita o dominio da
 * capa. O jeito de deixar verde teria sido apagar a explicacao — comentar bem
 * passando a custar caro.
 *
 * Falso VERDE, que e o pior: uma mutacao de verdade sobrevive porque a versao
 * boa continua escrita logo acima, em comentario. Duas atravessaram os 495
 * testes assim, e mais duas atravessaram porque o stripper era fraco demais.
 *
 * ── POR QUE UM SO, EM VEZ DE QUATRO ──
 *
 * Este antidoto estava copiado em QUATRO arquivos, e as copias haviam DIVERGIDO:
 * as tres de `features/registration/` tinham a versao boa, e a de
 * `features/players/import-wiring.test.ts` estava ancorada em inicio de linha
 * (`/^[ \t]*\/\/.*$/gm`), entao so pegava comentario de linha inteira.
 * Comentario no RABO da linha sobrevivia e alimentava assertiva posicional como
 * se fosse codigo. Medido: tirar o `return;` de dentro do `if (error)` do
 * EditPlayerForm e deixar `// TODO: voltar o return;` no fim da linha do
 * `toast.error` passou com os 495 testes verdes, com o defeito original inteiro
 * de volta.
 *
 * Quatro versoes de um antidoto e o proximo bug esperando: o conserto entra numa
 * copia e as outras tres seguem furadas. Daqui em diante ha uma.
 */

/**
 * Codigo TypeScript/TSX sem comentario: bloco `/* *\/` e linha `//`, esteja o
 * `//` no comeco da linha ou no rabo de uma linha de codigo.
 *
 * O `(?<!:)` guarda o `https://` de virar comentario: sem ele, o strip comeria a
 * propria URL do embed do SabbathVideo e a assertiva do dominio passaria a medir
 * o nada.
 *
 * NAO serve para SQL: aqui `--` e decremento (`i--`), e la e comentario. Para
 * SQL, use `semComentarioSql`.
 */
export function semComentario(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

/**
 * SQL sem comentario: `--` ate o fim da linha, e bloco `/* *\/`.
 *
 * Separado do irmao de TypeScript de proposito — ver a nota sobre `i--` acima.
 *
 * Limite conhecido e aceito: um `--` DENTRO de string literal SQL seria cortado
 * junto. Nao ha nenhum nas migrations que este repo assevera, e tokenizar SQL
 * custa mais do que a assertiva vale.
 */
export function semComentarioSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}
