/**
 * A posicao do jogador, normalizada para o vocabulario que o banco aceita.
 *
 * Existe porque `players.preferred_position` ganhou CHECK em
 * 20260820010000_capacity_formula_columns.sql, e quatro caminhos de escrita
 * gravavam fora desses quatro valores. O mais grave era o CSV
 * (`app/api/import-players/route.ts`), que gravava a celula CRUA da planilha.
 *
 * A cota de goleiro do A6 conta `Goleiro` contra tudo que nao e `Goleiro`, e por
 * isso a normalizacao importa mais do que parece: `' goleiro '` com espaco
 * sobrando nao e goleiro para nenhum dos oito detectores `=== "Goleiro"` do
 * codigo, e passaria a contar como jogador de linha.
 *
 * PALAVRAS, e nao codigos, de proposito. O terreno ja foi pisado: a migration
 * 20260615000000 subiu comparando `preferred_position = 'GOL'` e a SEGUINTE
 * consertou na direcao das palavras, com o motivo escrito no cabecalho
 * ("gravado por extenso"). A unificacao em enum de codigos e o bloco A8.
 *
 * ALCANCE, e leia isto antes de "limpar" a tabela de aliases: futsal (`Fixo`,
 * `Ala Esquerda`, `Ala Direita`, `Pivo`), `Lateral` e `Volante` NAO EXISTEM em
 * dado real. Medido em 2026-08-21: producao tem 80 jogadores e staging 82, e nos
 * dois os 100% estao nos quatro canonicos — zero futsal, zero codigo, zero nulo.
 * O futsal vinha do SEED local, que foi alinhado aos canonicos no mesmo bloco.
 *
 * Entao isto NAO e traducao de legado vivo, e sim defesa de entrada: o CSV de
 * `app/api/import-players/route.ts` aceita celula arbitraria de planilha, e e
 * dali que vocabulario alheio entra. Os aliases ficam por isso, e nao porque ha
 * linha no banco esperando conversao.
 */

/** Os quatro valores da CHECK. Um teste prende esta lista ao SQL. */
export const CANONICAL_POSITIONS = ["Goleiro", "Zagueiro", "Meia", "Atacante"] as const;

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
 * Chaves em forma dobrada (`fold`), valores canonicos.
 *
 * Os grupos, e a razao de cada um:
 *  - identidade: as quatro palavras canonicas, mais os SEIS codigos de
 *    POSITION_LABELS em `lib/public/types.ts` — GOL, ZAG, LAT, VOL, MEI e ATA.
 *    Sao seis, e nao quatro: `LAT` e `VOL` estao la junto com os outros, e por
 *    isso `lateral`/`volante` e `lat`/`vol` entram por esta porta, e nao por
 *    extrapolacao. O que eles tem de diferente e so o destino — POSITION_LABELS
 *    tem seis rotulos e a CHECK aceita quatro valores, entao os dois excedentes
 *    precisam de um canonico de chegada (ambos `Meia`; a decisao do `lateral`
 *    esta anotada no proprio mapa abaixo).
 *  - futsal: vocabulario que NAO existe em dado real (ver ALCANCE acima); entra
 *    so por planilha. O fixo e o
 *    defensor; as alas sao o corredor, meio-campo na taxonomia de quatro; o pivo
 *    e o homem de referencia a frente.
 *  - `ala` sozinho: a UNICA extrapolacao deste mapa, e segura — as DUAS alas
 *    listadas concordam em `Meia`, entao nao ha o que desempatar.
 */
export const POSITION_ALIASES: Record<string, CanonicalPosition> = {
  goleiro: "Goleiro",
  gol: "Goleiro",
  zagueiro: "Zagueiro",
  zag: "Zagueiro",
  meia: "Meia",
  mei: "Meia",
  atacante: "Atacante",
  ata: "Atacante",

  fixo: "Zagueiro",
  "ala esquerda": "Meia",
  "ala direita": "Meia",
  ala: "Meia",
  pivo: "Atacante",

  volante: "Meia",
  vol: "Meia",

  // DECIDIDO pelo usuario em 2026-08-21, e nao mais em aberto. Foi o unico
  // mapeamento genuinamente discutivel: `Zagueiro` pela leitura brasileira de
  // campo, onde o lateral e defensor.
  //
  // Ganhou `Meia`, e a razao e que o campeonato e de FUTSAL. No futsal o
  // corredor e a ala, e `Ala Esquerda`/`Ala Direita` ja vao para `Meia` logo
  // acima — mandar `Lateral` para `Zagueiro` colocaria o mesmo papel em dois
  // destinos diferentes dependendo da palavra usada.
  lateral: "Meia",
  lat: "Meia",
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

  const canonical = POSITION_ALIASES[key];
  if (canonical) return { kind: "mapped", position: canonical };

  return { kind: "unrecognized", position: null, raw };
}
