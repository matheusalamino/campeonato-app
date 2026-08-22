import { describe, it, expect } from "vitest";
import { fonteDe, SEM_PALAVRA_DE_POTE } from "@/features/testing/fonte";

/**
 * Quem LE (e quem ESCREVE) a categoria de pote, lido como texto.
 *
 * ── POR QUE ISTO EXISTE ──
 *
 * A migration 20260821020000 virou as sete colunas de pote de palavra
 * (`Goleiro`, `Extra`) para codigo (`GOL`, `EXT`). Como no lado do jogador, o
 * modo de falha de quem le nao tem sinal nenhum: um `=== "goleiro"` que nunca
 * mais casa NAO lanca erro, so para de reconhecer. O `tsc` nao ve, o lint nao
 * ve, e todos estes arquivos vivem em `app/**` e `components/**`, fora do
 * `include` do `vitest.config.ts`.
 *
 * ── O QUE ESTAVA QUEBRADO OU IA QUEBRAR ──
 *
 * Nao e hipotese. Medido nesta branch:
 *
 *   bulk-general-fine — `potPosition.toUpperCase() === "GOL"` esta QUEBRADO
 *       HOJE: com a coluna em palavra, `"Goleiro".toUpperCase()` e `"GOLEIRO"`,
 *       que nunca e `"GOL"`. A multa geral do pote de goleiro saia gravada como
 *       `no_bid_player` / `FINE_NO_BID_PLAYER`, com o rotulo errado no extrato.
 *       A migration CONSERTA este sitio sem tocar nele — e e por isso que ele
 *       precisa de assertiva: conserto que veio de fora volta a quebrar calado.
 *
 *   qualification-window, qualification-resolve, qualification-refund-losers,
 *   join-pot-bid — os quatro decidiam com `pos.toLowerCase() === "goleiro"`.
 *       Com a coluna em codigo isso vira falso SEMPRE, e a guarda "pote de
 *       goleiro nao usa habilitacao" some: o pote de goleiro passa a aceitar
 *       janela de habilitacao e lance cego.
 *
 *   pot-entry-state e PotMenuSlide — o `isGoalkeeper` de ambos ja hedgeava com
 *       `=== "gol"` e sobreviveria; o `isExtra` NAO: `posLower === "extra" ||
 *       posLower.includes("adicional")` nao casa `EXT` por nenhum dos dois
 *       lados. O pote extra voltaria a pedir habilitacao que ele nao usa.
 *
 *   PotBidsSlide — `.toLowerCase().includes("goleiro")` sobre `EXT`/`GOL` nunca
 *       casa, e a tela de lances abre a janela de habilitacao para o pote de
 *       goleiro.
 *
 *   PotMenuSlide/PositionIcon — tres `includes` de palavra escolhiam o icone.
 *       Todos falsos depois da virada: os quatro potes cairiam no icone de
 *       estrela do fallback.
 *
 * ── POR QUE ASSERTIVA POR SITIO ──
 *
 * Mesma razao do irmao `features/players/position-detectors.test.ts`:
 * `PotMenuSlide` tem CINCO detectores em duas funcoes — tres no icone
 * (`GOL`/`ZAG`/`MEI`) e dois no cartao (goleiro e pote extra) — e uma assertiva
 * unica de `=== "GOL"` deixaria quatro sem rede, porque o primeiro segura o
 * verde sozinho. Dai o `corpoDaFuncao` abaixo, e MEDIDO: quebrar so o
 * `isGoalkeeper` do cartao reprova so o `it` do cartao, com o do icone verde.
 */

const MULTA_GERAL = "app/api/draft/fiscal/bulk-general-fine/route.ts";
const JANELA_HABILITACAO = "app/api/draft/qualification-window/route.ts";
const RESOLVE_HABILITACAO = "app/api/draft/qualification-resolve/route.ts";
const ESTORNO_HABILITACAO =
  "app/api/draft/qualification-refund-losers/route.ts";
const ENTRAR_NO_LANCE = "app/api/draft/join-pot-bid/route.ts";
const ESTADO_DE_ENTRADA = "app/api/draft/pot-entry-state/route.ts";
const FINALIZAR_POTE = "app/api/draft/finalize-pot/route.ts";
const TELA_DE_LANCES = "components/draftNight/PotBidsSlide.tsx";
const MENU_DE_POTES = "components/draftNight/PotMenuSlide.tsx";
const PREVIA_DO_POTE = "components/team-manager/PotPreviewTab.tsx";

const multaGeral = fonteDe(MULTA_GERAL);
const janelaHabilitacao = fonteDe(JANELA_HABILITACAO);
const resolveHabilitacao = fonteDe(RESOLVE_HABILITACAO);
const estornoHabilitacao = fonteDe(ESTORNO_HABILITACAO);
const entrarNoLance = fonteDe(ENTRAR_NO_LANCE);
const estadoDeEntrada = fonteDe(ESTADO_DE_ENTRADA);
const finalizarPote = fonteDe(FINALIZAR_POTE);
const telaDeLances = fonteDe(TELA_DE_LANCES);
const menuDePotes = fonteDe(MENU_DE_POTES);
const previaDoPote = fonteDe(PREVIA_DO_POTE);

/**
 * O corpo de uma funcao de topo de arquivo, ate a proxima.
 *
 * Existe por causa de `PotMenuSlide`, que tem QUATRO comparacoes de vocabulario
 * repartidas em duas funcoes. Sem recortar, a assertiva do icone e a do cartao
 * leriam o arquivo inteiro e uma cobriria a outra.
 *
 * Nao prende formatacao: aceita `function X(`, `export function X(` e
 * `export default function X(`, e o corte e no proximo `function` de coluna
 * zero — reindentar o miolo, quebrar argumentos em linhas ou trocar aspas nao
 * mexe em nada disso.
 *
 * Pelo mesmo motivo o operador nao entra: as assertivas abaixo aceitam
 * `=== "GOL"` E `case "GOL":`. Reescrever um detector de tres ramos como
 * `switch` tem `tsc` limpo, comportamento identico e codigo melhor; a versao
 * anterior destas assertivas reprovava contra ele, o que transformava uma
 * limpeza legitima em "desfaca para voltar ao verde". Medido pela revisao.
 *
 * O `export` sem `default` no TERMINADOR e load-bearing, e a primeira versao
 * nao o tinha: `PotPreviewTab.tsx` declara `export function PotPreviewTab(`, o
 * corte nao achava fim nenhum e o "corpo" de `positionHeaderClass` seguia ate o
 * fim do arquivo. O `not.toMatch(/includes\(/)` reprovava contra codigo CERTO,
 * casando o `.includes` do filtro de busca do componente la embaixo.
 */
const DECLARACAO = "^(?:export\\s+(?:default\\s+)?)?function\\s+";

function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.search(new RegExp(`${DECLARACAO}${nome}\\b`, "m"));
  if (inicio < 0) throw new Error(`funcao ${nome} nao encontrada`);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(new RegExp(DECLARACAO, "m"));
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe("quem le a categoria de pote fala CODIGO", () => {
  // Sentinela. Arquivo MOVIDO nao "leria vazio": o `readFileSync` estoura
  // ENOENT e derruba este arquivo inteiro, bem barulhento. O que este `it` pega
  // e o caso silencioso — o arquivo continua existindo mas deixou de ser o que
  // as assertivas abaixo supoem, e ai todo `not.toMatch` segue verde medindo um
  // arquivo que nao guarda mais a leitura.
  it("le os dez arquivos, e cada um ainda e o que este teste pensa que e", () => {
    expect(multaGeral).toContain("FINE_NO_BID_GOALKEEPER");
    expect(janelaHabilitacao).toContain("draft_qualification_pot_position");
    expect(resolveHabilitacao).toContain("draft_qualification_bids");
    expect(estornoHabilitacao).toContain("draft_qualification_bids");
    expect(entrarNoLance).toContain("draft_qualification_pot_position");
    expect(estadoDeEntrada).toContain("nextScreen");
    expect(finalizarPote).toContain("movedToExtraCount");
    expect(telaDeLances).toContain("isGoalkeeper");
    expect(menuDePotes).toContain("PositionIcon");
    expect(previaDoPote).toContain("positionHeaderClass");
  });

  // ── O sitio que a migration consertou de fora ─────────────────────────────

  it("a multa geral do leilao reconhece o pote de goleiro pelo codigo", () => {
    // O `.toUpperCase()` que estava aqui era a prova de que ninguem tinha
    // rodado este caminho depois de escreve-lo: ele so faz sentido contra um
    // vocabulario minusculo, e a coluna nunca guardou um. Sai junto — normalizar
    // caixa e a tolerancia a dois vocabularios que o bloco A8 veio remover, e
    // aqui o PRODUTOR VALIDA: `auction-window` so grava
    // `draft_auction_pot_position` depois de achar a linha em `draft_pots` com
    // `.eq("position", ...)`, e essa coluna tem CHECK desde a 20260821020000.
    expect(multaGeral).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(multaGeral).not.toMatch(/toUpperCase|toLowerCase/);
    expect(multaGeral).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  // ── Os quatro que perdiam a guarda do pote de goleiro ─────────────────────

  it("a janela de habilitacao recusa o pote de goleiro pelo codigo", () => {
    expect(janelaHabilitacao).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(janelaHabilitacao).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  it("a apuracao da habilitacao recusa o pote de goleiro pelo codigo", () => {
    expect(resolveHabilitacao).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(resolveHabilitacao).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  it("o estorno dos perdedores pula o pote de goleiro pelo codigo", () => {
    expect(estornoHabilitacao).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(estornoHabilitacao).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  it("a entrada no lance cego recusa o pote de goleiro pelo codigo", () => {
    expect(entrarNoLance).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(entrarNoLance).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  // ── Os dois detectores do estado de entrada, cada um com sua rede ─────────

  it("o estado de entrada reconhece goleiro E pote extra pelo codigo", () => {
    // Dois `toMatch`, e nao um: sao dois detectores independentes no mesmo
    // arquivo, e o `isGoalkeeper` sozinho seguraria o verde com o `isExtra`
    // quebrado — que e exatamente o defeito que a virada introduziria, porque o
    // `isGoalkeeper` ja hedgeava com `=== "gol"` e o `isExtra` nao.
    expect(estadoDeEntrada).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(estadoDeEntrada).toMatch(/(?:===|case)\s*["']EXT["']/);
    expect(estadoDeEntrada).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  // ── Quem ESCREVE o pote extra ────────────────────────────────────────────

  it("a finalizacao do pote manda os nao vendidos para o pote EXT", () => {
    // Aceita a constante nomeada ou o literal: importar
    // `EXTRA_POT_POSITION` e a costura melhor, mas escrever `"EXT"` na mao nao
    // e defeito, e reprovar por isso seria prender forma.
    expect(finalizarPote).toMatch(/EXTRA_POT_POSITION|["']EXT["']/);
    expect(finalizarPote).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  // ── A noite de draft ─────────────────────────────────────────────────────

  it("a tela de lances reconhece o pote de goleiro pelo codigo", () => {
    expect(telaDeLances).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(telaDeLances).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  it("o icone do pote sai do codigo, e o quarto pote cai no fallback", () => {
    // Tres ramos e um fallback, como sempre foi: `ATA` nunca teve `if` proprio,
    // e a estrela e o `return` final. Prender os TRES separadamente e o que
    // impede que um deles morra escondido atras dos outros dois.
    const icone = corpoDaFuncao(menuDePotes, "PositionIcon");
    expect(icone).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(icone).toMatch(/(?:===|case)\s*["']ZAG["']/);
    expect(icone).toMatch(/(?:===|case)\s*["']MEI["']/);
    expect(icone).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  it("o cartao do pote reconhece goleiro E pote extra pelo codigo", () => {
    const cartao = corpoDaFuncao(menuDePotes, "PotCard");
    expect(cartao).toMatch(/(?:===|case)\s*["']GOL["']/);
    expect(cartao).toMatch(/(?:===|case)\s*["']EXT["']/);
    expect(cartao).not.toMatch(SEM_PALAVRA_DE_POTE);
  });

  // ── A cor do cabecalho da previa ─────────────────────────────────────────

  it("o cabecalho da previa do pote pinta por igualdade, e nao por substring", () => {
    // Este sitio vinha da Task 4 comparando por SUBSTRING de proposito, e o
    // comentario de la explicava: `"GOLEIRO"` contem `"GOL"` e `"MEIA"` contem
    // `"MEI"`, entao ele pintava certo nos DOIS vocabularios e atravessava o
    // pote legado sem perder cor. Era rede enquanto `draft_pots.position` ainda
    // guardava palavra.
    //
    // A 20260821020000 converteu a coluna, e a rede virou hedge: um `includes`
    // sobre um dominio de cinco valores fixos so ensina o proximo leitor a
    // esperar palavra de volta.
    const cabecalho = corpoDaFuncao(previaDoPote, "positionHeaderClass");
    for (const codigo of ["GOL", "ZAG", "MEI", "ATA"]) {
      expect(cabecalho).toMatch(new RegExp(`(?:===|case)\\s*["']${codigo}["']`));
    }
    expect(cabecalho).not.toMatch(/includes\(/);
    expect(cabecalho).not.toMatch(SEM_PALAVRA_DE_POTE);
  });
});

/**
 * Quem EXIBE a categoria de pote, e mostra a PALAVRA.
 *
 * A virada para codigo tem um efeito que nao e defeito de logica e aparece na
 * tela: `Pote 3 (MEI)` no extrato do cartola, onde antes lia `(Meia)`. Decisao
 * do usuario: mapa proprio do pote (`POT_LABELS`), com cinco entradas, e nao
 * estender o mapa de QUATRO do jogador — que autorizaria `EXT` em
 * `players.preferred_position`.
 *
 * ── O ACOPLAMENTO QUE ESTA VARREDURA ACHOU ──
 *
 * `team-manager/balance/page.tsx` casa transacao com o pote aberto procurando
 * `Pote N (Pos)` DENTRO da `description` que os routes gravam, no caminho em
 * que a linha nao tem `pot_position`. Produtor e consumidor montavam o texto
 * separados. Trocar o rotulo so no produtor quebraria o casamento CALADO: a aba
 * de saldo pararia de destacar as transacoes do pote ativo, sem erro nenhum.
 * Dai `potTitle` ser funcao, e dai o `it` que prende os dois lados nela.
 *
 * ── O QUE NAO ENTRA ──
 *
 * Chave de React e query string (`key={...}`, `potKey`, `encodeURIComponent`)
 * seguem no CODIGO CRU, e trocar por rotulo seria defeito: a query string vira
 * `.eq("pot_position", ...)` do outro lado, e o banco guarda codigo. Por isso as
 * assertivas abaixo pedem o rotulo em sitio de EXIBICAO, e nao "sem codigo cru
 * no arquivo".
 *
 * `draftNight/PlayerCard.tsx` tambem fica de fora, e por decisao da Task 4: a
 * etiqueta da CARTA e o codigo de proposito, como num card de FIFA.
 */

const COMPRA = "app/api/draft/purchase-player/route.ts";
const PAINEL_FISCAL = "app/(auction-fiscal)/auction-fiscal/page.tsx";
const AVISO_MULTA = "components/team-manager/AutoFineNotifier.tsx";
const SALDO = "components/team-manager/BalanceDisplay.tsx";
const ABA_SALDO = "app/(team-manager)/team-manager/balance/page.tsx";
const LEILAO = "components/draftNight/PotAuctionSlide.tsx";
const NOITE_DE_DRAFT = "app/(protected)/draft-night/page.tsx";

const compra = fonteDe(COMPRA);
const painelFiscal = fonteDe(PAINEL_FISCAL);
const avisoMulta = fonteDe(AVISO_MULTA);
const saldo = fonteDe(SALDO);
const abaSaldo = fonteDe(ABA_SALDO);
const leilao = fonteDe(LEILAO);
const noiteDeDraft = fonteDe(NOITE_DE_DRAFT);

/** Um `Pote ${n} (${p})` montado a mao, que e o que `potTitle` veio substituir. */
const TITULO_NA_MAO = /Pote \$\{[^}]*\}\s*\(\$\{/;

describe("quem EXIBE a categoria de pote mostra a PALAVRA", () => {
  it("le os seis arquivos novos, e cada um ainda e o que este teste pensa que e", () => {
    expect(compra).toContain("draft_player_purchases");
    expect(painelFiscal).toContain("auctionOpen");
    expect(avisoMulta).toContain("Multa automática");
    expect(saldo).toContain("potBudget");
    expect(abaSaldo).toContain("transactionMatchesActivePot");
    expect(leilao).toContain("pot_letter");
    expect(noiteDeDraft).toContain("expandedPot");
  });

  // ── O extrato do cartola: cinco routes gravam a descricao ─────────────────

  for (const [nome, fonte] of [
    ["a finalizacao do pote", finalizarPote],
    ["o estorno dos perdedores", estornoHabilitacao],
    ["a compra de jogador", compra],
    ["a multa geral do leilao", multaGeral],
    ["a entrada no lance cego", entrarNoLance],
  ] as const) {
    it(`${nome} grava o rotulo na descricao, e nao o codigo`, () => {
      expect(fonte).toMatch(/potTitle\(/);
      // A outra metade, e ela e o que mata a mutacao de verdade: com o template
      // a mao de volta AO LADO da chamada, o `toMatch` acima seguiria verde.
      expect(fonte).not.toMatch(TITULO_NA_MAO);
    });
  }

  // ── O consumidor da mesma string ─────────────────────────────────────────

  it("a aba de saldo procura a transacao pelo MESMO texto que os routes gravam", () => {
    // Os dois lados na mesma funcao: e isto que impede a agulha e a descricao
    // de divergirem no dia em que o rotulo mudar.
    expect(abaSaldo).toMatch(/potTitle\(/);
    expect(abaSaldo).not.toMatch(TITULO_NA_MAO);
  });

  // ── As telas ─────────────────────────────────────────────────────────────

  for (const [nome, fonte] of [
    ["o painel do fiscal de leilao", painelFiscal],
    ["o aviso de multa automatica", avisoMulta],
    ["o resumo de saldo do cartola", saldo],
    ["a tela de lances da noite de draft", telaDeLances],
    ["o menu de potes da noite de draft", menuDePotes],
    ["a tela de leilao da noite de draft", leilao],
    ["a previa do pote do cartola", previaDoPote],
    ["o cabecalho de pote da noite de draft", noiteDeDraft],
  ] as const) {
    it(`${nome} exibe o rotulo, e nao o codigo`, () => {
      expect(fonte).toMatch(/potLabel\(|potTitle\(/);
    });
  }

  // O laco acima e um POSITIVO, e positivo sozinho nao mata reversao de um
  // sitio quando o arquivo tem outros certos. Este negativo e o par do
  // `draft-night`, que so tem UM sitio de exibicao e o tinha cru.
  //
  // O `(?<!\$)` e load-bearing e nao cerimonia: a chave de React da mesma tela
  // e `key={`${pot.position}-...`}`, e `${pot.position}` CONTEM
  // `{pot.position}` como substring. Sem o lookbehind este negativo reprovaria
  // contra a chave, que tem de seguir no codigo cru — falso vermelho contra
  // codigo certo, exatamente o modo de falha que o `it` logo abaixo protege.
  it("o cabecalho da noite de draft nao imprime a categoria crua", () => {
    expect(noiteDeDraft).toMatch(/potLabel\(\s*pot\.position\s*,?\s*\)/);
    expect(noiteDeDraft).not.toMatch(/(?<!\$)\{\s*pot\.position\s*\}/);
  });

  it("as chaves de React e a query string seguem no codigo CRU", () => {
    // O contrapeso das assertivas acima. Trocar por rotulo aqui seria DEFEITO:
    // a query string vira `.eq("pot_position", ...)` do outro lado, e o banco
    // guarda codigo. Uma varredura de "nao ha codigo cru neste arquivo"
    // empurraria justamente para esse erro.
    //
    // O SEPARADOR nao entra: trocar o `:` por `-` na chave e no-op puro --
    // chave de React so precisa ser unica e estavel -- e prender o texto
    // literal reprovaria contra codigo certo. O que se prende e que a chave
    // ainda e montada com `p.position` CRU, ao lado do numero do pote.
    expect(menuDePotes).toMatch(/\$\{p\.pot_number\}\W{1,3}\$\{p\.position\}/);
    expect(leilao).toMatch(/encodeURIComponent\(pot\.position\)/);
  });
});
