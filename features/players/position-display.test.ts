import { describe, it, expect } from "vitest";
import { positionLabel } from "@/lib/public/types";
import { fonteDe, SEM_PALAVRA } from "@/features/testing/fonte";

/**
 * Quem EXIBE posicao de JOGADOR tem de exibir PALAVRA.
 *
 * ── O QUE ESTE ARQUIVO PRENDE, E CONTRA O QUE ──
 *
 * A virada do A8 trocou o vocabulario da coluna: `players.preferred_position`
 * guardava `Goleiro` e passou a guardar `GOL`. Toda tela que imprimia o valor
 * CRU seguiu compilando e seguiu verde — e passou a mostrar `GOL` ao usuario,
 * sem ninguem ter pedido. Nao e bug de tipo nem de teste de unidade: e uma
 * regressao que so a tela mostra, e por isso a assertiva le FONTE.
 *
 * A regra decidida pelo usuario, e ela e assimetrica de proposito: onde hoje
 * sai palavra, sai palavra; onde hoje sai sigla, sai sigla.
 *
 * ── OS SEIS QUE FICAM DE FORA, E POR QUE NAO SAO ESQUECIMENTO ──
 *
 * `app/(protected)/games/[id]/page.tsx` (quatro sitios),
 * `components/BestPlayerVoteModal.tsx` e `components/LineupControl.tsx`
 * imprimem a posicao numa etiqueta `uppercase tracking-widest`. DECIDIDO pelo
 * usuario: esses passam a mostrar a SIGLA, e isso acontece sozinho porque o
 * valor ja e codigo. Nenhuma assertiva aqui os alcanca, e "consertar" um deles
 * com `positionLabel` desfaria a decisao.
 *
 * ── POR QUE ASSERTIVA DE FONTE, E NAO DE RENDER ──
 *
 * Os cinco arquivos vivem em `app/**` e `components/**`, que o `include` do
 * vitest nao alcanca (a razao inteira esta no comentario do `include`, em
 * `vitest.config.ts`). O antidoto e o de sempre: ler com `fonteDe`, que tira
 * comentario antes, para a assertiva nao casar a PROSA em vez do codigo.
 *
 * ── COMO ESTAS ASSERTIVAS FORAM CALIBRADAS ──
 *
 * Cada sitio tem par: um positivo que exige o rotulo, e um NEGATIVO que proibe
 * a forma crua exata daquele arquivo. O negativo e quem mata a mutacao de
 * verdade — o positivo sozinho sobrevive a um sitio revertido enquanto os
 * outros continuarem certos.
 *
 * Os identificadores sao `\w+` e nao o nome real, e isso e deliberado: renomear
 * um local e refatoracao, nao regressao, e assertiva que reprova contra renome
 * castiga quem organiza o codigo. Pela mesma razao tudo que costura tokens usa
 * `\s*`: quebrar uma chamada em linhas nao pode ficar vermelho.
 *
 * A regra e facil de escrever e facil de furar: quando este arquivo nasceu,
 * UMA das assertivas dele — a da cor do `PlayerSearchCard` — trazia
 * `positionColors[position]` com o nome fixo, tres paragrafos abaixo do texto
 * que proibia isso. Renomear o binding do prop para `posicao` deixava o `tsc`
 * limpo, o comportamento identico, e o teste VERMELHO. Regra em prosa nao se
 * cumpre sozinha; quem a cumpre e a mutacao de renome que roda contra ela.
 *
 * O `,?` antes do parenteses de fecho tem a mesma origem, e ele custou uma
 * medicao: `\s*\)` sozinho REPROVAVA quando a chamada era quebrada em linhas,
 * porque o prettier poe virgula final no ultimo argumento ao faze-lo. Assertiva
 * que so aceita a chamada em uma linha manda o autor desfazer a formatacao do
 * proprio repo para ficar verde.
 */

/** `{jogador.preferred_position}` — o valor cru direto no JSX. */
const CRU_PREFERIDA = /\{\s*\w+\.preferred_position\s*\}/;

/** `{positionLabel(jogador.preferred_position)}` — a forma consertada. */
const ROTULADA_PREFERIDA =
  /\{\s*positionLabel\(\s*\w+\.preferred_position\s*,?\s*\)\s*\}/;

/** `{position}` — o prop cru direto no JSX. */
const CRU_PROP = /\{\s*position\s*\}/;

/** `{positionLabel(position)}` — a forma consertada, com o nome livre. */
const ROTULADA_PROP = /\{\s*positionLabel\(\s*\w+\s*,?\s*\)\s*\}/;

/** `{p.position || "Sem posição"}` — cru com o guarda de vazio na frente. */
const CRU_COM_FALLBACK = /\{\s*\w+\.position\s*\|\|/;

/** `${playerA.position}` — cru dentro de template literal. */
const CRU_EM_TEMPLATE = /\$\{\s*\w+\.position\s*\}/;

/** `positionLabel(p.position)` — a forma consertada do auction-fiscal. */
const ROTULADA_PONTO_POSITION = /positionLabel\(\s*\w+\.position\s*,?\s*\)/g;

describe("positionLabel", () => {
  it("troca o codigo pela palavra que o usuario le", () => {
    expect(positionLabel("GOL")).toBe("Goleiro");
    expect(positionLabel("ZAG")).toBe("Zagueiro");
    expect(positionLabel("MEI")).toBe("Meia");
    expect(positionLabel("ATA")).toBe("Atacante");
  });

  // MEDIDO, e as duas linhas nao valem o mesmo: trocar a normalizacao pelo
  // `Object.hasOwn` do irmao do pote so reprova a SEGUNDA. `Goleiro` sai
  // `Goleiro` pelos dois caminhos — a palavra canonica exata cai no ramo do
  // bruto e renderiza igual —, entao aquela linha e tautologia, e fica so como
  // documentacao de que a palavra legada nao QUEBRA.
  //
  // O ganho real da normalizacao e a variante: caixa e espaco sobrando. E ele e
  // barato, nao urgente — `features/players/position.ts` registra que os tres
  // ambientes estao 100% nas quatro palavras canonicas exatas, sem variante
  // nenhuma. Vale por ser a mesma defesa de fronteira que `mapPlayer` ja faz.
  it("aceita a palavra legada, e tambem a variante dela, que e onde ganha", () => {
    expect(positionLabel("Goleiro")).toBe("Goleiro");
    expect(positionLabel("atacante")).toBe("Atacante");
  });

  // Melhor `XYZ` na tela do que `undefined`: valor estranho segue legivel.
  it("devolve o bruto quando ninguem reconhece o valor", () => {
    expect(positionLabel("XYZ")).toBe("XYZ");
  });

  // Load-bearing: `auction-fiscal` escreve `positionLabel(p.position) || "Sem
  // posicao"`. Se o vazio virasse rotulo, o guarda de vazio pararia de disparar.
  it("preserva o vazio, para o guarda de vazio de quem chama seguir valendo", () => {
    expect(positionLabel("")).toBe("");
    expect(positionLabel("   ")).toBe("   ");
  });

  // Mesmo furo que `POSITION_ALIASES` teve: sem guarda de propriedade propria,
  // a tela renderizaria uma FUNCAO.
  it("nao alcanca o prototipo de Object", () => {
    expect(positionLabel("constructor")).toBe("constructor");
    expect(positionLabel("toString")).toBe("toString");
  });
});

describe("quem exibe posicao de jogador nao imprime o codigo cru", () => {
  it("PlayersSection rotula a posicao da lista de inscritos", () => {
    const fonte = fonteDe(
      "app/(protected)/championship/players/PlayersSection.tsx",
    );

    expect(fonte).toMatch(ROTULADA_PREFERIDA);
    expect(fonte).not.toMatch(CRU_PREFERIDA);
  });

  it("PlayerList rotula a posicao da etiqueta do admin", () => {
    const fonte = fonteDe("components/PlayerList.tsx");

    expect(fonte).toMatch(ROTULADA_PREFERIDA);
    expect(fonte).not.toMatch(CRU_PREFERIDA);
  });

  // O conserto entra AQUI, e nao no `PlayersSection` que passa o valor ao prop,
  // porque este e o ponto por onde todo chamador do modal passa.
  it("PlayerRadarModal rotula a posicao do cabecalho", () => {
    const fonte = fonteDe(
      "app/(protected)/players/components/PlayerRadarModal.tsx",
    );

    expect(fonte).toMatch(ROTULADA_PROP);
    expect(fonte).not.toMatch(CRU_PROP);
  });

  // O destino de `team-manager/players/page.tsx`, que so repassa o valor. A
  // etiqueta segue COLORIDA pelo codigo (`positionColors[position]`): quem muda
  // e o texto, nao a chave da cor.
  it("PlayerSearchCard rotula o texto da etiqueta e mantem a cor no codigo", () => {
    const fonte = fonteDe("components/team-manager/PlayerSearchCard.tsx");

    expect(fonte).toMatch(ROTULADA_PROP);
    expect(fonte).not.toMatch(CRU_PROP);
    expect(fonte).toMatch(/positionColors\[\s*\w+\s*\]/);
  });

  it("auction-fiscal rotula os quatro sitios da troca", () => {
    const fonte = fonteDe("app/(auction-fiscal)/auction-fiscal/page.tsx");

    expect(fonte.match(ROTULADA_PONTO_POSITION) ?? []).toHaveLength(4);
    expect(fonte).not.toMatch(CRU_COM_FALLBACK);
    expect(fonte).not.toMatch(CRU_EM_TEMPLATE);
  });

  // O rotulo vem do mapa, e nao de uma copia local. Uma tabela inline neste
  // arquivo passaria pelas assertivas acima e divergiria do mapa no primeiro
  // conserto que entrasse so num dos lados.
  it("nenhum dos cinco escreve a palavra de posicao a mao", () => {
    const arquivos = [
      "app/(protected)/championship/players/PlayersSection.tsx",
      "components/PlayerList.tsx",
      "app/(protected)/players/components/PlayerRadarModal.tsx",
      "components/team-manager/PlayerSearchCard.tsx",
      "app/(auction-fiscal)/auction-fiscal/page.tsx",
    ];

    for (const arquivo of arquivos) {
      expect(fonteDe(arquivo)).not.toMatch(SEM_PALAVRA);
    }
  });
});
