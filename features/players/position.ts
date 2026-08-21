/**
 * A posicao do jogador, normalizada para o vocabulario que o banco aceita.
 *
 * Existe porque `players.preferred_position` ganhou CHECK em
 * 20260820010000_capacity_formula_columns.sql, e quatro caminhos de escrita
 * gravavam fora desses quatro valores. O mais grave era o CSV
 * (`app/api/import-players/route.ts`), que gravava a celula CRUA da planilha.
 *
 * CODIGOS, e nao palavras. Esta e a virada do bloco A8, e a migration
 * 20260821010000_position_vocabulary_codes.sql converteu a coluna junto: o
 * banco guarda GOL/ZAG/MEI/ATA e a palavra por extenso existe SO na exibicao,
 * por POSITION_LABELS em `lib/public/types.ts`.
 *
 * O terreno ja foi pisado na outra direcao, e o registro fica para nao voltar
 * atras por engano: a migration 20260615000000 subiu comparando
 * `preferred_position = 'GOL'` quando a coluna guardava palavra, e a SEGUINTE
 * consertou na direcao das palavras. O que faltava la era converter o DADO;
 * e o que a 20260821010000 faz.
 *
 * A cota de goleiro do A6 conta o goleiro contra tudo que nao e goleiro, e por
 * isso a normalizacao importa mais do que parece: `' goleiro '` com espaco
 * sobrando nao casa com nenhum detector de igualdade exata do codigo, e
 * passaria a contar como jogador de linha.
 *
 * ALCANCE, e leia isto antes de "limpar" a tabela de aliases: futsal (`Fixo`,
 * `Ala Esquerda`, `Ala Direita`, `Pivo`), `Lateral` e `Volante` NAO EXISTEM em
 * dado real. Medido em 2026-08-21 nos tres ambientes: local 64 jogadores,
 * staging 82 e producao 80, todos 100% nos quatro canonicos de entao (as
 * palavras) — zero futsal, zero nulo. Essas palavras seguem sendo APELIDO aqui
 * exatamente por isso: e o que toda planilha antiga traz.
 *
 * Entao isto NAO e traducao de legado vivo, e sim defesa de entrada: o CSV de
 * `app/api/import-players/route.ts` aceita celula arbitraria de planilha, e e
 * dali que vocabulario alheio entra.
 */

/** Os quatro valores da CHECK. Um teste prende esta lista ao SQL. */
export const CANONICAL_POSITIONS = ["GOL", "ZAG", "MEI", "ATA"] as const;

export type CanonicalPosition = (typeof CANONICAL_POSITIONS)[number];

/**
 * Tres desfechos, e nao dois, porque vazio e desconhecido pedem tratamento
 * diferente de quem chama: celula em branco e "nao informado" (null e o modelo
 * exato), enquanto celula preenchida que ninguem reconhece e um dado que o
 * admin digitou e precisa VER recusado. Quem decide a politica e a borda —
 * o import aborta a linha, o form do admin mostra o aviso.
 */
export type PositionNormalization =
  | { kind: "empty"; position: null }
  | { kind: "mapped"; position: CanonicalPosition }
  | { kind: "unrecognized"; position: null; raw: string };

/**
 * A forma comparavel: sem acento, sem separador exotico, sem espaco duplo, em
 * minuscula. `Pivô` e `Pivo` colapsam aqui, e nao em duas entradas da tabela.
 *
 * A ordem importa: o NFD tem de vir antes do lowercase para o combining mark
 * sair, e o trim depois da colagem de espacos, senao `' Ala  Esquerda '` sobra
 * com espaco na ponta.
 */
function fold(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Chaves em forma dobrada (`fold`), valores canonicos (os codigos).
 *
 * Os grupos, e a razao de cada um:
 *  - identidade: os quatro codigos canonicos, mais as quatro PALAVRAS por
 *    extenso. As palavras nao sao ornamento: e nelas que todo o dado historico
 *    dos tres ambientes estava, e e o que a planilha do CSV continua trazendo.
 *    Tirar a palavra daqui faria todo import antigo recusar linha.
 *  - excedentes de POSITION_LABELS: `LAT` e `VOL` sao codigos de rotulo que a
 *    CHECK nao aceita, entao precisam de um canonico de chegada (ambos `MEI`;
 *    a decisao do `lateral` esta anotada no proprio mapa abaixo).
 *  - futsal: vocabulario que NAO existe em dado real (ver ALCANCE acima); entra
 *    so por planilha. O fixo e o
 *    defensor; as alas sao o corredor, meio-campo na taxonomia de quatro; o pivo
 *    e o homem de referencia a frente.
 *  - `ala` sozinho: a UNICA extrapolacao deste mapa, e segura — as DUAS alas
 *    listadas concordam em `MEI`, entao nao ha o que desempatar.
 */
export const POSITION_ALIASES: Record<string, CanonicalPosition> = {
  goleiro: "GOL",
  gol: "GOL",
  zagueiro: "ZAG",
  zag: "ZAG",
  meia: "MEI",
  mei: "MEI",
  atacante: "ATA",
  ata: "ATA",

  fixo: "ZAG",
  "ala esquerda": "MEI",
  "ala direita": "MEI",
  ala: "MEI",
  pivo: "ATA",

  volante: "MEI",
  vol: "MEI",

  // DECIDIDO pelo usuario em 2026-08-21, e nao mais em aberto. Foi o unico
  // mapeamento genuinamente discutivel: `ZAG` pela leitura brasileira de campo,
  // onde o lateral e defensor.
  //
  // Ganhou `MEI`, e a razao e que o campeonato e de FUTSAL. No futsal o
  // corredor e a ala, e `Ala Esquerda`/`Ala Direita` ja vao para `MEI` logo
  // acima — mandar `Lateral` para `ZAG` colocaria o mesmo papel em dois
  // destinos diferentes dependendo da palavra usada.
  lateral: "MEI",
  lat: "MEI",
};

/**
 * Qualquer vocabulario -> canonico, ou null com o motivo.
 *
 * Nunca devolve valor inventado: o que nao esta na tabela sai como
 * `unrecognized` com o bruto preservado, para a borda poder citar o que o admin
 * digitou. Null e aceito pela CHECK, e essa permissividade e load-bearing —
 * `scripts/test-registration-slots.sh` insere jogador so com (cpf, name).
 */
export function normalizePreferredPosition(
  raw: string | null | undefined,
): PositionNormalization {
  if (raw == null) return { kind: "empty", position: null };

  const key = fold(raw);

  // Sem letra nem digito e celula em branco, e nao posicao desconhecida: `-` e
  // `--` sao o marcador universal de "nada aqui" em planilha, e reprovar a linha
  // por causa deles seria hostil. A regra e EXPLICITA de proposito -- cair no
  // ramo vazio por efeito colateral do `fold` (que troca `-` por espaco) morreria
  // calado no dia em que alguem mexesse na dobra dos separadores.
  //
  // `n/a` NAO cai aqui, e isso e deliberado: tem letra, entao vira
  // `unrecognized` e o admin ve o aviso em vez de perder o dado em silencio.
  if (!/[a-z0-9]/.test(key)) return { kind: "empty", position: null };

  // `POSITION_ALIASES[key]` sozinho alcanca o prototipo de Object: uma celula
  // com `constructor` voltava truthy e virava `position: <function Object>` no
  // insert. O guarda de propriedade propria fecha isso.
  const canonical = Object.hasOwn(POSITION_ALIASES, key)
    ? POSITION_ALIASES[key]
    : undefined;
  if (canonical) return { kind: "mapped", position: canonical };

  return { kind: "unrecognized", position: null, raw };
}
