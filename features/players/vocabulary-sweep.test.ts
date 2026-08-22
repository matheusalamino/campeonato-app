import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fonteDe } from "@/features/testing/fonte";

/**
 * A rede que pega o LEITOR ESQUECIDO.
 *
 * ── O DEFEITO QUE ELA EXISTE PARA PEGAR ──
 *
 * O bloco A8 virou `players.preferred_position` de PALAVRA para CODIGO
 * (`GOL`/`ZAG`/`MEI`/`ATA`, com CHECK no banco desde a 20260821010000). Quem
 * ficou comparando com a palavra depois da virada NAO LANCA ERRO: so para de
 * reconhecer a posicao, calado, para sempre. `tsc` fica limpo — os dois lados
 * sao `string`. A suite fica verde — ninguem asseverava aquele ramo.
 *
 * E isso nao e hipotese. A varredura nasceu ACHANDO um: `lib/calculateRadar.ts`
 * decidia o radar por `position.toLowerCase().includes("goleiro")`, e desde a
 * virada `"GOL".toLowerCase()` nao contem `"goleiro"` — todo goleiro passou a
 * receber o radar de jogador de LINHA, com as seis habilidades erradas e valor
 * zero em todas. Tres irmaos do mesmo `if` (`EvaluateModal`, `PlayerForm`,
 * `SubscribeForm`) ja tinham sido convertidos para `=== "GOL"` nas tasks 3-5; o
 * quarto escapou porque escrevia a comparacao de outro jeito. Uma lista feita a
 * olho ve os tres que se parecem e perde o que nao se parece. Uma varredura,
 * nao.
 *
 * A cota de goleiro do A6 conta o goleiro contra tudo que nao e goleiro. Um
 * leitor esquecido ali nao mostra tela quebrada: mostra vaga errada.
 *
 * ── POR QUE A PALAVRA, E NAO O CODIGO ──
 *
 * Procurar `"GOL"` acusaria `components/PenaltyShootoutControl.tsx` para
 * sempre: o `"GOL"` de la e GOL MARCADO (`p.result === "scored" ? "GOL" : "X"`),
 * nao posicao. Alarme que sempre toca e alarme que se aprende a ignorar, e a
 * rede morreria no primeiro `.skip`. A palavra por extenso, ao contrario, so
 * tem dois lares legitimos: a fonte dos apelidos e os mapas de rotulo.
 *
 * Pelo mesmo motivo a rede nao tem nada com as tres colunas `position` que sao
 * `integer` — `group_slots.position`, `knockout_match_sources.source_position` e
 * `phase_advancement_rules.position` guardam COLOCACAO no chaveamento, e nao
 * posicao de jogador. Nenhum codigo nem palavra deste vocabulario aparece perto
 * delas.
 *
 * ── POR QUE MAIUSCULA NAO IMPORTA ──
 *
 * MEDIDO: com a comparacao sensivel a caixa (so `"Goleiro"`), esta varredura
 * fica VERDE em cima de `lib/calculateRadar.ts`, que era o unico defeito vivo
 * no repo no dia em que ela nasceu. O leitor esquecido compara depois de
 * `.toLowerCase()` tantas vezes quanto compara cru — `features/testing/fonte.ts`
 * ja tinha chegado a mesma conclusao para o vocabulario do POTE, e o docblock do
 * `SEM_PALAVRA_DE_POTE` de la lista tres detectores minusculos como razao do
 * `i`.
 *
 * O preco esta na allowlist: `goleiro` minusculo tambem e a chave do PREMIO
 * "Melhor Goleiro", que convive com `craque`, `revelacao` e `tecnico` e nao tem
 * nada com a coluna. Tres arquivos pagam esse preco, cada um com o motivo
 * escrito abaixo. Rede que perde o unico defeito vivo nao vale o silencio que
 * ela compra.
 *
 * ── POR QUE LE O DISCO, E NAO IMPORTA O MODULO ──
 *
 * Porque metade do alvo vive em `app/**` e `services/**`, que o `include` do
 * vitest nao alcanca (o motivo esta escrito em `vitest.config.ts`). Assertiva
 * que le texto tem um modo de falha proprio — casar a PROSA em vez do codigo —
 * e por isso a leitura passa por `fonteDe`, que tira comentario antes. Sem ele,
 * o proprio docblock que voce esta lendo reprovaria a varredura.
 */

/** As cinco pastas de codigo de produto. Nada fora delas grava posicao. */
const PASTAS = ["app", "components", "features", "lib", "services"];

/**
 * As quatro palavras, so como LITERAL de string (aspas simples, duplas ou
 * crase). O literal e o alvo, e nao a palavra solta, por duas razoes medidas
 * que `features/testing/fonte.ts` ja documentava: `const goleiro = [...]` em
 * `PlayerForm` e nome de variavel de habilidade, e "Selecione 1 Goleiro + 5
 * Linha" em `LineupControl` e texto de tela. Nenhum dos dois e vocabulario de
 * coluna, e nenhum dos dois casa aqui.
 */
const PALAVRAS = ["Goleiro", "Zagueiro", "Meia", "Atacante"] as const;

/**
 * O `i` esta explicado no docblock do topo. A crase entra na classe junto com
 * as aspas porque template literal tambem e literal.
 */
function detector(palavra: string): RegExp {
  return new RegExp("[\"'`]" + palavra + "[\"'`]", "i");
}

/**
 * Cada entrada leva o MOTIVO junto, e nao em comentario ao lado: motivo em
 * comentario descola da entrada na primeira reordenacao. Sem o motivo, a
 * proxima pessoa nao sabe se pode acrescentar a dela — e o jeito mais barato de
 * matar uma rede destas e alguem calar o vermelho sem saber o que estava
 * calando.
 *
 * A pergunta a responder antes de acrescentar uma linha aqui: este literal e
 * ROTULO (a palavra existe para ser LIDA por uma pessoa) ou COMPARACAO (a
 * palavra existe para casar com um valor)? Rotulo entra. Comparacao e o bug.
 */
const LIBERADOS: Record<string, string> = {
  "features/players/position.ts":
    "A FONTE: os apelidos por extenso vivem aqui, e e por eles que a planilha " +
    "antiga do CSV continua entrando. Hoje esta entrada NAO dispara — as chaves " +
    "de POSITION_ALIASES sao identificadores nus (`goleiro: \"GOL\"`), sem aspas " +
    "— e fica de proposito, porque o arquivo ja tem chaves citadas " +
    "(`\"ala esquerda\"`) e um dia de `quoteProps: \"consistent\"` no prettier " +
    "citaria as outras, pintando a fonte da verdade de vermelho.",

  "lib/public/types.ts":
    "O ROTULO do JOGADOR: POSITION_LABELS mapeia codigo -> palavra, entao a " +
    "palavra e o VALOR do mapa. E o unico lugar autorizado a exibir a palavra.",

  "features/draft/pot-position.ts":
    "O ROTULO do POTE: POT_LABELS e o mapa proprio do pote, com cinco entradas " +
    "(os quatro codigos mais o EXT de quem nao foi vendido). Mapa separado de " +
    "proposito — a 20260821020000 proibe unificar os dois vocabularios, porque " +
    "um EXT dentro de POSITION_LABELS autorizaria gravar EXT em " +
    "players.preferred_position.",

  "app/(protected)/championship/settings/page.tsx":
    "PREMIO, e nao posicao: `goleiro` aqui e uma PrizeKey ao lado de `craque`, " +
    "`revelacao` e `tecnico` — a chave do premio Melhor Goleiro. O arquivo nao " +
    "toca preferred_position em lugar nenhum.",

  "components/landing/PremiosTab.tsx":
    "PREMIO, e nao posicao: mesma familia AwardId (`craque` | `goleiro` | " +
    "`revelacao` | `tecnico`) da tela de premiacao publica. O arquivo nao toca " +
    "preferred_position em lugar nenhum.",

  "features/hooks/usePublicRankings.ts":
    "PREMIO, e nao posicao: `applyPlayerOverride('goleiro', ...)` escolhe o " +
    "ranking do premio Melhor Goleiro. O hook carrega `position` dos jogadores, " +
    "mas so o repassa adiante — nao ha nenhuma comparacao de posicao aqui.",
};

/** Todo `.ts`/`.tsx` das cinco pastas, em caminho relativo a raiz do repo. */
function arquivosDe(raiz: string, pasta: string): string[] {
  const achados: string[] = [];

  function desce(dir: string): void {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const cheio = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        desce(cheio);
      } else if (/\.tsx?$/.test(entrada.name)) {
        achados.push(relative(raiz, cheio));
      }
    }
  }

  desce(join(raiz, pasta));
  return achados;
}

describe("nenhuma palavra de posicao sobrevive fora da fonte e do rotulo", () => {
  it("todo literal por extenso vive na allowlist, com motivo", () => {
    const raiz = process.cwd();
    const caminhos = PASTAS.flatMap((pasta) => arquivosDe(raiz, pasta)).sort();

    // Se a varredura encolher, ela para de provar qualquer coisa em silencio.
    // O piso e frouxo de proposito: prende a ORDEM DE GRANDEZA, e nao o numero
    // exato, que sobe a cada arquivo novo. MEDIDO em 2026-08-22: 332 arquivos.
    //
    // Isto nao e cerimonia. O `git ls-files -- 'app/**/*.ts'` que a primeira
    // versao desta rede usava devolvia 281 dos 332: o glob do git exige um `/`
    // depois da pasta, entao TODO arquivo na raiz de `lib/`, `components/` e
    // `services/` ficava de fora -- inclusive `lib/calculateRadar.ts`, o unico
    // defeito vivo, e `components/PenaltyShootoutControl.tsx`, o falso positivo
    // que a rede foi desenhada para nao ter. Cinquenta e um arquivos invisiveis,
    // e a rede verde.
    expect(caminhos.length).toBeGreaterThan(300);

    const achados: string[] = [];

    for (const caminho of caminhos) {
      // Teste cita as duas pontas por natureza: `position-detectors.test.ts`
      // procura a palavra JUSTAMENTE para reprovar quem a usa.
      if (caminho.includes(".test.")) continue;
      if (caminho in LIBERADOS) continue;

      const linhas = fonteDe(caminho).split("\n");
      linhas.forEach((linha, i) => {
        for (const palavra of PALAVRAS) {
          if (detector(palavra).test(linha)) {
            achados.push(`${caminho}:${i + 1} -> ${palavra}`);
          }
        }
      });
    }

    expect(
      achados,
      "Literal de posicao POR EXTENSO fora da fonte e dos mapas de rotulo:\n\n" +
        achados.join("\n") +
        "\n\nA coluna guarda CODIGO desde a 20260821010000. Para COMPARAR, use " +
        "CANONICAL_POSITIONS de @/features/players/position (ou o codigo direto, " +
        'como `=== "GOL"`). Para EXIBIR, use positionLabel de @/lib/public/types ' +
        "— ou potLabel de @/features/draft/pot-position, se for pote.\n\n" +
        "Se o literal for ROTULO legitimo, acrescente o arquivo em LIBERADOS " +
        "COM O MOTIVO. Se for COMPARACAO, e o bug: o leitor nao lanca erro, so " +
        "para de reconhecer a posicao, e o A6 conta cota de goleiro em cima disso.",
    ).toEqual([]);
  });
});
