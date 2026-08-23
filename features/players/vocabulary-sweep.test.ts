import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { linhasDe } from "@/features/testing/fonte";
import { POSITION_ALIASES } from "@/features/players/position";

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
 * `SEM_PALAVRA_DE_POTE` de la nomeia, um por um, os detectores minusculos que
 * justificaram o `i`.
 *
 * O preco esta na allowlist: `goleiro` minusculo tambem e a chave do PREMIO
 * "Melhor Goleiro", que convive com `craque`, `revelacao` e `tecnico` e nao tem
 * nada com a coluna. Tres arquivos pagam esse preco, cada um com o motivo
 * escrito abaixo. Rede que perde o unico defeito vivo nao vale o silencio que
 * ela compra.
 *
 * ── POR QUE LE O DISCO, E NAO IMPORTA O MODULO ──
 *
 * Porque TRES das cinco pastas varridas — `app/**`, `components/**` e
 * `services/**` — estao fora do `include` do vitest, que so alcanca `lib/**`,
 * `features/**` e `scripts/**`. E ali que mora a maioria do alvo. So a ausencia
 * de `services/**` tem motivo escrito em `vitest.config.ts`; `app/**` e
 * `components/**` nunca entraram, e o arquivo nao diz por que. Assertiva
 * que le texto tem um modo de falha proprio — casar a PROSA em vez do codigo —
 * e por isso a leitura passa por `linhasDe`, que tira comentario antes. Sem
 * isso, o proprio docblock que voce esta lendo reprovaria a varredura.
 *
 * E O PRECO DISSO, que e real e voce precisa saber ANTES de topar com ele:
 * `readdirSync` ve o DISCO, e nao o git. Arquivo NAO RASTREADO conta. O
 * worktree principal deste projeto carrega copias de trabalho como
 * `lib/pix (1).ts` e `services/public-registration (1).ts` — hoje sem nenhuma
 * palavra de posicao dentro, entao ninguem sente. MEDIDO em 2026-08-22: plantar
 * um `lib/copia (1).ts` com a palavra deixa esta suite VERMELHA, citando o
 * caminho da copia. E o comportamento CERTO — leitor esquecido dentro de uma
 * copia continua sendo leitor esquecido, e a copia costuma virar commit — mas
 * se voce chegou aqui por um vermelho num arquivo que nem sabia que existia: e
 * isso. Apague a copia, ou commite-a.
 *
 * Trocar por `git ls-files` NAO e o conserto, e ja foi tentado: o glob
 * (`'app/**\/*.ts'`) exige um `/` depois da pasta, entao perdia TODO arquivo
 * que mora na RAIZ de uma das cinco pastas — `lib/` e `components/` respondem
 * pela maioria deles, `services/` inteiro mora na raiz, e `app/layout.tsx`
 * tambem cai ai. Eram 51 no dia da medicao, inclusive o unico defeito vivo.
 *
 * ── POR QUE A ALLOWLIST DECLARA O QUE ESCONDE ──
 *
 * A primeira versao desta rede PULAVA o arquivo liberado INTEIRO, e isso e um
 * buraco do tamanho do arquivo. MEDIDO em 2026-08-22: plantar
 * `if (position === "Goleiro") return POT_LABELS.GOL;` dentro de
 * `features/draft/pot-position.ts`, que esta liberado, deixava a varredura
 * VERDE, os 634 testes VERDES e o `tsc --noEmit` em zero. O defeito exato que
 * esta rede existe para pegar, vivo e invisivel DENTRO dela.
 *
 * O unico guarda que restava nos liberados era o `tsc`, e so onde o tipo e
 * estreito: a mesma mutacao em `features/hooks/usePublicRankings.ts` da TS2367,
 * porque la o `position` e `CanonicalPosition`. Mas `lib/public/types.ts`
 * (`positionLabel`) e `features/draft/pot-position.ts` (`potLabel`, `potTitle`)
 * recebem `position: string` — de proposito, porque quem chama le a coluna
 * crua —, e ali nao havia guarda nenhuma. Nos dois liberados de premiacao
 * (`settings/page.tsx` e `PremiosTab.tsx`) nem havia o que guardar: a sequencia
 * `position` nao aparece neles em caixa nenhuma.
 *
 * Por isso cada entrada declara, em `esconde`, as LINHAS que ela legitimamente
 * cala — e a rede assevera esse conjunto. Literal NOVO dentro de arquivo
 * liberado passa a ser vermelho; os legitimos seguem calados.
 *
 * ── E POR QUE O CODIGO DA LINHA, E NAO A CONTAGEM NEM `caminho:linha` ──
 *
 * Porque o defeito mais barato de cometer aqui e trocar um literal legitimo por
 * um defeituoso NO LUGAR: virar `GOL: "Goleiro",` em `position === "Goleiro"`
 * na mesma linha, no meio de um arquivo que ninguem varre. Contagem nao acusa
 * (quatro continua quatro). `caminho:linha -> palavra` TAMBEM nao acusa — a
 * linha e a mesma e a palavra e a mesma. So o CODIGO da linha muda, e por isso
 * e ele que fica guardado.
 *
 * De quebra, guardar o codigo e o que menos chateia: inserir vinte linhas acima
 * nao mexe em nada, reindentar nao mexe (o `\s+` colapsa), e comentar no rabo
 * da linha nao mexe (o `linhasDe` ja tirou o comentario). O conjunto e ORDENADO
 * antes de comparar, entao reordenar as chaves de um mapa tambem nao mexe.
 */

/** As cinco pastas de codigo de produto. Nada fora delas grava posicao. */
const PASTAS = ["app", "components", "features", "lib", "services"];

/**
 * O vocabulario varrido, so como LITERAL de string (aspas simples, duplas ou
 * crase). O literal e o alvo, e nao a palavra solta, por duas razoes medidas
 * que `features/testing/fonte.ts` ja documentava: `const goleiro = [...]` em
 * `PlayerForm` e nome de variavel de habilidade, e "Selecione 1 Goleiro + 5
 * Linha" em `LineupControl` e texto de tela. Nenhum dos dois e vocabulario de
 * coluna, e nenhum dos dois casa aqui.
 *
 * ── AS OITO QUE NAO SAO OS QUATRO CANONICOS ──
 *
 * Sao as PALAVRAS de `POSITION_ALIASES`, e nao so as quatro que a coluna ja
 * guardou. `Lateral` e `Volante` entram porque a Task 2 do A8 os tirou de
 * `POSITION_LABELS` por decisao do usuario: viraram apelido de `MEI`, e a
 * coluna nunca mais guarda nenhum dos dois. Quem ficou comparando com
 * `"Lateral"` tem exatamente o defeito desta rede, e ate 2026-08-22 escapava
 * dela. `Fixo`, `Ala`, `Ala Esquerda`, `Ala Direita` e `Pivo`/`Pivô` entram
 * pelo mesmo motivo: sao apelido de ENTRADA, nunca valor de coluna.
 *
 * MEDIDO em 2026-08-22, uma palavra por vez, sobre os 281 arquivos ESCANEADOS
 * (dos 333 achados, 52 sao `.test.` e o laco os pula antes de ler): as
 * quatro canonicas acusam 15 linhas; as doze juntas acusam 17. As duas novas
 * sao as chaves CITADAS de `POSITION_ALIASES` (`"ala esquerda"` e
 * `"ala direita"`), que sao a propria fonte. Nenhuma das oito acusa um sitio
 * legitimo novo, entao nao ha ruido a pagar por elas.
 *
 * `Lat` e `Vol` dariam zero hoje tambem, e mesmo assim ficam de fora: sao
 * CODIGO, e o docblock do topo explica por que codigo nao entra nesta rede.
 */
const PALAVRAS = [
  "Goleiro",
  "Zagueiro",
  "Meia",
  "Atacante",
  "Lateral",
  "Volante",
  "Fixo",
  "Ala",
  "Ala Esquerda",
  "Ala Direita",
  "Pivo",
  "Pivô",
] as const;

/**
 * Os apelidos de `POSITION_ALIASES` que sao CODIGO, e nao palavra. Ficam fora
 * de `PALAVRAS` pelo motivo do docblock do topo, e ficam listados aqui para a
 * assertiva de fim de arquivo saber distinguir "codigo, de proposito" de
 * "palavra que ninguem lembrou de acrescentar".
 */
const APELIDOS_QUE_SAO_CODIGO = ["gol", "zag", "mei", "ata", "lat", "vol"];

/**
 * O `i` esta explicado no docblock do topo. A crase entra na classe junto com
 * as aspas porque template literal tambem e literal.
 */
function detector(palavra: string): RegExp {
  return new RegExp("[\"'`]" + palavra + "[\"'`]", "i");
}

type Liberado = {
  /**
   * Por que este arquivo pode conter a palavra. Vive na entrada, e nao em
   * comentario ao lado: motivo em comentario descola da entrada na primeira
   * reordenacao. Sem o motivo, a proxima pessoa nao sabe se pode acrescentar a
   * dela — e o jeito mais barato de matar uma rede destas e alguem calar o
   * vermelho sem saber o que estava calando.
   */
  motivo: string;

  /**
   * As linhas que este arquivo legitimamente esconde, sem comentario e com os
   * espacos colapsados — exatamente o que `codigoDe` produz. A rede assevera
   * este conjunto, entao literal NOVO aqui dentro fica vermelho.
   */
  esconde: readonly string[];
};

/**
 * A pergunta a responder antes de acrescentar uma linha em `esconde`: este
 * literal e ROTULO (a palavra existe para ser LIDA por uma pessoa) ou
 * COMPARACAO (a palavra existe para casar com um valor)? Rotulo entra.
 * Comparacao e o bug.
 */
const LIBERADOS: Record<string, Liberado> = {
  "features/players/position.ts": {
    motivo:
      "A FONTE: os apelidos por extenso vivem aqui, e e por eles que a " +
      "planilha antiga do CSV continua entrando. Das dezessete chaves de " +
      "POSITION_ALIASES so as duas alas estao CITADAS — as outras sao " +
      "identificadores nus (`goleiro: \"GOL\"`) e nao casam com o detector.",
    esconde: ['"ala direita": "MEI",', '"ala esquerda": "MEI",'],
  },

  "lib/public/types.ts": {
    motivo:
      "O ROTULO do JOGADOR: POSITION_LABELS mapeia codigo -> palavra, entao a " +
      "palavra e o VALOR do mapa. E o unico lugar autorizado a exibir a palavra.",
    esconde: [
      'ATA: "Atacante",',
      'GOL: "Goleiro",',
      'MEI: "Meia",',
      'ZAG: "Zagueiro",',
    ],
  },

  "features/draft/pot-position.ts": {
    motivo:
      "O ROTULO do POTE: POT_LABELS e o mapa proprio do pote, com cinco " +
      "entradas (os quatro codigos mais o EXT de quem nao foi vendido). Mapa " +
      "separado, e nao POSITION_LABELS estendido, porque aquele e " +
      "Record<CanonicalPosition, string>: um EXT ali dentro NAO COMPILA " +
      "(TS2353, medido). Quem recusa EXT em players.preferred_position e a " +
      "CHECK da 20260821010000. A 20260821020000 grita o INVERSO: nao tirar o " +
      "EXT da CHECK do pote em nome da simetria, porque isso apaga o pote " +
      "extra na proxima finalizacao.",
    esconde: [
      'ATA: "Atacante",',
      'GOL: "Goleiro",',
      'MEI: "Meia",',
      'ZAG: "Zagueiro",',
    ],
  },

  "app/(protected)/championship/settings/page.tsx": {
    motivo:
      "PREMIO, e nao posicao: `goleiro` aqui e uma PrizeKey ao lado de " +
      "`craque`, `revelacao` e `tecnico` — a chave do premio Melhor Goleiro. " +
      "O arquivo nao toca preferred_position em lugar nenhum.",
    esconde: ["type PrizeKey = 'craque' | 'goleiro' | 'revelacao' | 'tecnico';"],
  },

  "components/landing/PremiosTab.tsx": {
    motivo:
      "PREMIO, e nao posicao: mesma familia AwardId (`craque` | `goleiro` | " +
      "`revelacao` | `tecnico`) da tela de premiacao publica. O arquivo nao " +
      "toca preferred_position em lugar nenhum.",
    esconde: [
      ': award === "goleiro"',
      'case "goleiro": return rankings.goalkeepers;',
      'type AwardId = "craque" | "goleiro" | "revelacao" | "tecnico";',
      '{ id: "goleiro", label: "Melhor Goleiro", emoji: "🧤" },',
      '{award === "goleiro"',
    ],
  },

  "features/hooks/usePublicRankings.ts": {
    motivo:
      "PREMIO, e nao posicao: `applyPlayerOverride('goleiro', ...)` escolhe o " +
      "ranking do premio Melhor Goleiro. O hook carrega `position` dos " +
      "jogadores, mas so o repassa adiante — nao ha nenhuma comparacao de " +
      "posicao aqui.",
    esconde: ["goalkeepers: applyPlayerOverride('goleiro', goalkeepers),"],
  },
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

/**
 * A linha como ela entra em `esconde`: espacos colapsados e pontas aparadas. O
 * comentario ja saiu antes, no `linhasDe`.
 */
function codigoDe(linha: string): string {
  return linha.replace(/\s+/g, " ").trim();
}

type Achado = {
  caminho: string;
  linha: number;
  codigo: string;
  palavras: string[];
};

/**
 * Uma passada so, e ela NAO consulta a allowlist: quem separa liberado de
 * proibido e cada assertiva, com o achado inteiro na mao. Varredura que ja
 * chega filtrada nao consegue asseverar o que foi filtrado — que era
 * exatamente o buraco de antes.
 */
function varrer(): { caminhos: string[]; achados: Achado[] } {
  const raiz = process.cwd();
  const caminhos = PASTAS.flatMap((pasta) => arquivosDe(raiz, pasta)).sort();
  const achados: Achado[] = [];

  for (const caminho of caminhos) {
    // Teste cita as duas pontas por natureza: `position-detectors.test.ts`
    // procura a palavra JUSTAMENTE para reprovar quem a usa.
    if (caminho.includes(".test.")) continue;

    // `linhasDe`, e nao `fonteDe`: a numeracao TEM de bater com o arquivo de
    // verdade. MEDIDO — a mutacao em `features/registration/skills.ts:41` era
    // acusada como `:26` com `fonteDe`, porque o strip come as quebras de linha
    // de dentro dos blocos `/* */`. Mensagem cujo trabalho e dizer ONDE e que
    // aponta comentario nao vale mais do que mensagem sem linha.
    linhasDe(caminho).forEach((linha, i) => {
      const palavras = PALAVRAS.filter((palavra) =>
        detector(palavra).test(linha),
      );
      if (palavras.length === 0) return;
      achados.push({
        caminho,
        linha: i + 1,
        codigo: codigoDe(linha),
        palavras: [...palavras],
      });
    });
  }

  return { caminhos, achados };
}

function mensagemDoLiberado(
  caminho: string,
  liberado: Liberado,
  dentro: Achado[],
): string {
  return (
    `${caminho} esta LIBERADO, e o que ele esconde MUDOU.\n\n` +
    `Motivo da liberacao:\n${liberado.motivo}\n\n` +
    "Achado agora no arquivo:\n" +
    dentro.map((a) => `  ${a.linha}: ${a.codigo}`).join("\n") +
    "\n\nDeclarado em LIBERADOS.esconde:\n" +
    liberado.esconde.map((c) => `  ${c}`).join("\n") +
    "\n\nArquivo liberado nao e arquivo invisivel, e as duas listas acima " +
    "divergem nos DOIS sentidos.\n\n" +
    "SOBROU no arquivo uma linha que ninguem declarou: se ela for ROTULO " +
    "legitimo, acrescente o codigo dela em `esconde`. Se for COMPARACAO, e o " +
    "bug que esta rede existe para pegar: o leitor nao lanca erro, so para de " +
    "reconhecer a posicao, e nem o `tsc` acusa onde o `position` e `string`.\n\n" +
    "SUMIU do arquivo uma linha que `esconde` declara: o rotulo foi apagado ou " +
    "reescrito, e ai o conserto e tirar a linha de `esconde`. Declaracao que " +
    "sobra compra silencio para codigo que nao existe mais.\n\n" +
    "Para COMPARAR, use o codigo direto (`=== \"GOL\"`) ou " +
    "normalizePositionGroup de @/features/players/position-group, que e o " +
    "helper de goleiro-contra-linha. NAO use CANONICAL_POSITIONS: ela DECLARA " +
    "o vocabulario e e tipada como os quatro literais, entao " +
    "`.includes(algumaString)` nem compila (TS2345). Teste de pertinencia pede " +
    "`new Set<string>(CANONICAL_POSITIONS)`, como em " +
    "features/players/position-group.ts."
  );
}

describe("nenhuma palavra de posicao sobrevive fora da fonte e do rotulo", () => {
  it("todo literal por extenso vive na allowlist, com motivo", () => {
    const { caminhos, achados } = varrer();

    // Se a varredura encolher, ela para de provar qualquer coisa em silencio.
    // O piso e frouxo de proposito: prende a ORDEM DE GRANDEZA, e nao o numero
    // exato, que sobe a cada arquivo novo. MEDIDO em 2026-08-22: 333 arquivos
    // (332 antes deste, que tambem se varre).
    expect(
      caminhos.length,
      `A varredura achou so ${caminhos.length} arquivos em ${PASTAS.join(", ")}` +
        ", e o piso e 300. Isto nao e defeito do codigo varrido: e a VARREDURA " +
        "que encolheu, e varredura encolhida fica verde sem provar nada. " +
        "Confira se `PASTAS` ainda lista as cinco pastas, se `arquivosDe` ainda " +
        "desce nos subdiretorios, e se o vitest esta rodando da RAIZ do repo " +
        "(a leitura e relativa a `process.cwd()`).\n\n" +
        "Isto ja mordeu: o `git ls-files -- 'app/**/*.ts'` da primeira versao " +
        "devolvia 281 dos 332, porque o glob do git exige um `/` depois da " +
        "pasta — TODO arquivo na RAIZ de uma das cinco pastas ficava de fora, " +
        "inclusive `lib/calculateRadar.ts`, o unico defeito vivo, e " +
        "`components/PenaltyShootoutControl.tsx`, o falso positivo que a rede " +
        "foi desenhada para nao ter. Cinquenta e um arquivos invisiveis, e a " +
        "rede verde.",
    ).toBeGreaterThan(300);

    const fora = achados
      .filter((achado) => !(achado.caminho in LIBERADOS))
      .flatMap((achado) =>
        achado.palavras.map(
          (palavra) => `${achado.caminho}:${achado.linha} -> ${palavra}`,
        ),
      );

    expect(
      fora,
      "Literal de posicao POR EXTENSO fora da fonte e dos mapas de rotulo:\n\n" +
        fora.join("\n") +
        "\n\nA coluna guarda CODIGO desde a 20260821010000.\n\n" +
        'Para COMPARAR: o codigo direto (`=== "GOL"`); ou ' +
        "normalizePositionGroup de @/features/players/position-group, se a " +
        "pergunta for goleiro-contra-linha; ou normalizePreferredPosition de " +
        "@/features/players/position, se o texto chegar de fora (planilha, " +
        "formulario). NAO use CANONICAL_POSITIONS para comparar: ela DECLARA o " +
        "vocabulario — e dela que saem os `<option>` dos formularios e o " +
        "z.enum do schema — e e tipada como os quatro literais, entao " +
        "`.includes(algumaString)` nem compila (TS2345). Teste de pertinencia " +
        "pede `new Set<string>(CANONICAL_POSITIONS)`, e " +
        "features/players/position-group.ts teve de fazer exatamente isso.\n\n" +
        "Para EXIBIR, use positionLabel de @/lib/public/types — ou potLabel de " +
        "@/features/draft/pot-position, se for pote.\n\n" +
        "Se o literal for ROTULO legitimo, acrescente o arquivo em LIBERADOS " +
        "COM O MOTIVO e com as linhas que ele esconde. Se for COMPARACAO, e o " +
        "bug: o leitor nao lanca erro, so para de reconhecer a posicao, e o A6 " +
        "conta cota de goleiro em cima disso.",
    ).toEqual([]);
  });

  it("arquivo liberado esconde exatamente o que a allowlist declara", () => {
    const { caminhos, achados } = varrer();

    expect(
      Object.keys(LIBERADOS).filter((caminho) => !caminhos.includes(caminho)),
      "Entrada de LIBERADOS que nao aponta para nenhum arquivo varrido. " +
        "Entrada morta e silencio comprado por nada: o arquivo foi renomeado ou " +
        "apagado, e a entrada ficou para tras autorizando um caminho que nao " +
        "existe. Corrija o caminho, ou remova a entrada.",
    ).toEqual([]);

    for (const [caminho, liberado] of Object.entries(LIBERADOS)) {
      const dentro = achados.filter((achado) => achado.caminho === caminho);

      expect(
        dentro.map((achado) => achado.codigo).sort(),
        mensagemDoLiberado(caminho, liberado, dentro),
      ).toEqual([...liberado.esconde].sort());
    }
  });

  it("toda palavra de POSITION_ALIASES entra no vocabulario varrido", () => {
    const varridas = new Set(PALAVRAS.map((palavra) => palavra.toLowerCase()));

    const esquecidas = Object.keys(POSITION_ALIASES).filter(
      (apelido) =>
        !APELIDOS_QUE_SAO_CODIGO.includes(apelido) && !varridas.has(apelido),
    );

    expect(
      esquecidas,
      "Apelido de posicao que existe em POSITION_ALIASES e que esta varredura " +
        "NAO procura:\n\n" +
        esquecidas.map((apelido) => `  ${apelido}`).join("\n") +
        "\n\nFoi assim que `Lateral` e `Volante` ficaram de fora ate " +
        "2026-08-22: a lista daqui nasceu com os quatro canonicos e nunca " +
        "acompanhou a tabela de apelidos, entao quem comparasse com " +
        '`"Lateral"` passava batido. Apelido e, por definicao, palavra que a ' +
        "coluna NAO guarda — comparar com ela e o defeito desta rede.\n\n" +
        "Acrescente a palavra em PALAVRAS, e MECA antes quantos sitios ela " +
        "acusa: se ela acusar rotulo legitimo em massa, ela pode nao valer o " +
        "ruido, e a decisao e sua com o numero na mao. Se o apelido novo for " +
        "CODIGO e nao palavra, ele vai em APELIDOS_QUE_SAO_CODIGO.",
    ).toEqual([]);
  });
});
