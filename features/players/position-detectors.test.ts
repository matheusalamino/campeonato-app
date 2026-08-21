import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario, semComentarioSql } from "@/features/testing/sem-comentario";

/**
 * Quem LE a posicao do jogador, lido como texto.
 *
 * ── POR QUE ISTO EXISTE ──
 *
 * A 20260821010000 virou `players.preferred_position` de palavra (`Goleiro`)
 * para codigo (`GOL`), e os formularios que ESCREVEM ja foram atras
 * (position-wiring.test.ts). Os que LEEM sao o outro lado, e o modo de falha
 * deles nao tem sinal nenhum: um `=== "Goleiro"` que nunca mais casa NAO lanca
 * erro. Ele so para de reconhecer goleiro, calado. O `tsc` nao ve (e comparacao
 * de `string` com literal, legitima), o lint nao ve, e nao ha teste de runtime
 * porque quase todos estes arquivos vivem em `app/**` e `components/**`, fora
 * do `include` do `vitest.config.ts` (o porque esta escrito la).
 *
 * ── O QUE ESTAVA QUEBRADO QUANDO ESTE ARQUIVO NASCEU ──
 *
 * Nao e hipotese. Nesta branch, antes destas assertivas:
 *
 *   EvaluateModal / SubscribeForm — `preferred_position === "Goleiro"` escolhia
 *       o conjunto de habilidades. Com a coluna em codigo, TODO goleiro era
 *       avaliado com as seis habilidades de LINHA, e as notas gravavam assim.
 *
 *   LineupControl — `gkCount` contava `p.position === "Goleiro"` sobre dados que
 *       `useMatchDetail` ja entrega em codigo. O gkCount virava 0 SEMPRE, e a
 *       regra "1 goleiro + 5 de linha" degradava para "6 jogadores": dois
 *       goleiros passavam como escalacao valida.
 *
 *   generate-pots — `if (position === "Goleiro")` deixava de valer, e o pote
 *       exclusivo de goleiro (max_managers 0, pote 1) parava de existir.
 *
 *   squad/page — a cadeia palavra->sigla nao casava mais NENHUM ramo e caia no
 *       `else`: os quatro contadores da tela viravam "tudo ATA".
 *
 *   PotPreviewTab — `p.includes("MEIA")` sobre um pote que agora se chama `MEI`.
 *
 * ── POR QUE ASSERTIVA POR SITIO, E NAO UMA VARREDURA SO ──
 *
 * Uma varredura unica de "nao ha a palavra em lugar nenhum" pareceria bastar e
 * nao basta: ela nao pega a mutacao `"GOL"` -> `"XXX"`, que e exatamente a forma
 * do defeito. E `LineupControl` tem TRES detectores — uma assertiva unica de
 * `=== "GOL"` deixaria dois deles sem rede, porque o terceiro segura o verde
 * sozinho. Cada `it` abaixo foi provado mutando o SEU sitio e so ele.
 */

const RAIZ = process.cwd();

function fonteDe(caminho: string): string {
  return semComentario(readFileSync(join(RAIZ, caminho), "utf8"));
}

function sqlDe(caminho: string): string {
  return semComentarioSql(readFileSync(join(RAIZ, caminho), "utf8"));
}

const AVALIAR = "app/(protected)/players/components/EvaluateModal.tsx";
const INSCREVER = "app/(protected)/players/[id]/subscribe/SubscribeForm.tsx";
const ESCALACAO = "components/LineupControl.tsx";
const POTES = "app/api/draft/generate-pots/route.ts";
const ELENCO = "app/(team-manager)/team-manager/squad/page.tsx";
const SEED = "scripts/seed-organizer-evaluations.sql";
const CAMPO_ELENCO = "components/team-manager/FootballField.tsx";
const CAMPO_PARTIDA = "components/MatchFieldView.tsx";
const CARTA = "components/draftNight/PlayerCard.tsx";
const BUSCA = "components/team-manager/PlayerSearchCard.tsx";
const PREVIA_POTE = "components/team-manager/PotPreviewTab.tsx";
const HOOK_GOLEIRO = "features/hooks/useGoalkeeper.ts";
const WIZARD = "app/(public)/inscrever/[slug]/RegistrationWizard.tsx";

const avaliar = fonteDe(AVALIAR);
const inscrever = fonteDe(INSCREVER);
const escalacao = fonteDe(ESCALACAO);
const potes = fonteDe(POTES);
const elenco = fonteDe(ELENCO);
const seed = sqlDe(SEED);
const campoElenco = fonteDe(CAMPO_ELENCO);
const campoPartida = fonteDe(CAMPO_PARTIDA);
const carta = fonteDe(CARTA);
const busca = fonteDe(BUSCA);
const previaPote = fonteDe(PREVIA_POTE);
const hookGoleiro = fonteDe(HOOK_GOLEIRO);
const wizard = fonteDe(WIZARD);

/**
 * Palavra por extenso como LITERAL de string, igual ao irmao de
 * `position-wiring.test.ts`.
 *
 * So o literal: `LineupControl` diz "Selecione 1 Goleiro + 5 Linha" em texto de
 * JSX, e isso e rotulo de tela, nao vocabulario de coluna. O `semComentario` ja
 * tirou a prosa antes — sem ele esta varredura reprovaria os proprios docblocks
 * que explicam a virada.
 */
const SEM_PALAVRA = /["'`](Goleiro|Zagueiro|Meia|Atacante)["'`]/;

/**
 * As chaves de um mapa literal declarado como `const <nome> ... = { ... }`.
 *
 * Existe para asseverar o CONJUNTO, e nao a presenca. Um `toMatch(/GOL:/)` deixa
 * passar o mapa que hedgeia — com as quatro palavras de volta ao lado dos
 * quatro codigos —, e e justamente a metade morta que esta task veio tirar. Foi
 * a entrada morta num mapa desses que fez alguem acreditar que o repo suportava
 * dois vocabularios de proposito.
 *
 * O `[^}]*` para no primeiro `}`, o que basta porque nenhum destes quatro mapas
 * tem chave aninhada — os valores sao string.
 */
function chavesDoMapa(fonte: string, nome: string): string[] {
  const bloco = fonte.match(new RegExp(`const\\s+${nome}\\b[^=]*=\\s*\\{([^}]*)\\}`));
  if (!bloco) throw new Error(`mapa ${nome} nao encontrado`);
  return [...bloco[1].matchAll(/(?:^|,)\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:/g)].map(
    (m) => m[1],
  );
}

const CODIGOS = ["GOL", "ZAG", "MEI", "ATA"];

describe("quem le a posicao do jogador fala CODIGO", () => {
  // Sentinela. Arquivo MOVIDO nao "leria vazio": o `readFileSync` estoura ENOENT
  // e derruba este arquivo de teste inteiro, bem barulhento.
  //
  // O que este `it` pega e o caso silencioso — o arquivo continua existindo mas
  // deixou de ser o que as assertivas abaixo supoem, e ai todo `not.toMatch`
  // segue verde medindo um arquivo que nao guarda mais a leitura.
  it("le os treze arquivos, e cada um ainda e o que este teste pensa que e", () => {
    expect(avaliar).toContain("skillsGol");
    expect(inscrever).toContain("skillsGol");
    expect(escalacao).toContain("gkCount");
    expect(potes).toContain("draft_pots");
    expect(elenco).toContain("positionCounts");
    expect(seed).toContain("organizer_evaluations");
    expect(campoElenco).toContain("positionMap");
    expect(campoPartida).toContain("POSITION_KEY");
    expect(carta).toContain("player.position");
    expect(busca).toContain("positionColors");
    expect(previaPote).toContain("positionHeaderClass");
    expect(hookGoleiro).toContain("GK_POSITIONS");
    expect(wizard).toContain("activeSkills");
  });

  // ── Grupo 1: escolhem o conjunto de habilidades pela posicao ──────────────
  //
  // O ternario inteiro, e nao so o `=== "GOL"`: com as duas pontas asseveradas
  // solto, trocar `skillsGol` por `skillsLinha` devolve o defeito original com o
  // codigo certo do lado esquerdo.

  it("o modal de avaliacao do admin escolhe as habilidades pelo codigo", () => {
    expect(avaliar).toMatch(
      /preferred_position\s*===\s*["']GOL["']\s*\?\s*skillsGol\s*:\s*skillsLinha/,
    );
    expect(avaliar).not.toMatch(SEM_PALAVRA);
  });

  it("a inscricao de jogador pelo admin escolhe as habilidades pelo codigo", () => {
    expect(inscrever).toMatch(
      /preferred_position\s*===\s*["']GOL["']\s*\?\s*skillsGol\s*:\s*skillsLinha/,
    );
    expect(inscrever).not.toMatch(SEM_PALAVRA);
  });

  // ── Grupo 2: detectores de goleiro que decidem regra ──────────────────────

  it("a escalacao ja salva conta goleiro pelo codigo ao dizer se esta configurada", () => {
    expect(escalacao).toMatch(
      /gkCount\s*=\s*selected\.filter\(\s*p\s*=>\s*p\.position\s*===\s*["']GOL["']\s*\)/,
    );
  });

  it("a escalacao conta goleiro pelo codigo ao validar o salvamento", () => {
    expect(escalacao).toMatch(
      /gkCount\s*=\s*selectedPlayers\.filter\(\s*p\s*=>\s*p\.position\s*===\s*["']GOL["']\s*\)/,
    );
  });

  it("a lista de jogadores da escalacao marca o goleiro pelo codigo", () => {
    expect(escalacao).toMatch(/isGK\s*=\s*p\.position\s*===\s*["']GOL["']/);
    expect(escalacao).not.toMatch(SEM_PALAVRA);
  });

  it("a geracao de potes separa o pote de goleiro pelo codigo", () => {
    expect(potes).toMatch(/if\s*\(\s*position\s*===\s*["']GOL["']\s*\)/);
    expect(potes).not.toMatch(SEM_PALAVRA);
  });

  it("o resumo do elenco conta por posicao SEM converter nada", () => {
    // Direto pela chave: a cadeia palavra->sigla que estava aqui nao converte
    // mais nada (o valor ja chega em codigo) e, pior que virar identidade, ela
    // tinha um `else` que jogava TUDO em `ATA`. Reescrever a cadeia em codigo
    // seria identidade escrita a mao; o certo e nao ter cadeia.
    expect(elenco).toMatch(/acc\[p\.position\]\s*=\s*\(\s*acc\[p\.position\]\s*\?\?\s*0\s*\)\s*\+\s*1/);
    expect(elenco).not.toMatch(SEM_PALAVRA);
  });

  it("o seed de avaliacoes escolhe as habilidades de goleiro pelo codigo", () => {
    expect(seed).toMatch(/p\.preferred_position\s*=\s*'GOL'/);
    expect(seed).not.toMatch(/'(Goleiro|Zagueiro|Meia|Atacante)'/);
  });

  // ── Grupo 3: mapas de exibicao, com a metade das palavras removida ────────

  it("o campo do elenco distribui os jogadores por um mapa so de codigos", () => {
    expect(chavesDoMapa(campoElenco, "positionMap")).toEqual(CODIGOS);
    expect(campoElenco).not.toMatch(SEM_PALAVRA);
  });

  it("o campo da partida posiciona os jogadores por um mapa so de codigos", () => {
    expect(chavesDoMapa(campoPartida, "POSITION_KEY")).toEqual(CODIGOS);
    expect(campoPartida).not.toMatch(SEM_PALAVRA);
  });

  it("a carta do leilao mostra o codigo direto, sem tabela de abreviacao", () => {
    // A tabela `POS_ABBR` so tinha PALAVRA, e o que a fazia parecer inofensiva
    // era o `?? pos.slice(0, 3).toUpperCase()` — com codigo na entrada, cada
    // consulta errava e o fallback devolvia o proprio codigo. Um mapa que so
    // acerta quando nao e consultado nao e rede: e ruido que o proximo leitor
    // toma por suporte a dois vocabularios.
    expect(carta).not.toMatch(/POS_ABBR|posAbbr/);
    expect(carta).toMatch(/const\s+pos\s*=\s*player\.position\s*;/);
    expect(carta).not.toMatch(SEM_PALAVRA);
  });

  it("a busca de jogador pinta a etiqueta por um mapa so de codigos", () => {
    // A metade "de codigo" deste mapa estava com `MEIA`, que nao e codigo de
    // nada: o meia ja caia no cinza do fallback antes mesmo da virada.
    expect(chavesDoMapa(busca, "positionColors")).toEqual(CODIGOS);
    expect(busca).not.toMatch(SEM_PALAVRA);
  });

  it("o cabecalho da previa do pote reconhece o meia pelo codigo", () => {
    // `p.includes("MEIA")` sobre um pote que agora se chama `MEI` nunca casa, e
    // o cabecalho do pote de meias perde a cor. So cor — mas e o mesmo defeito.
    expect(previaPote).toMatch(/includes\(\s*["']MEI["']\s*\)/);
    expect(previaPote).not.toMatch(/includes\(\s*["']MEIA["']\s*\)/);
  });

  // ── Grupo 4: o hedge do hook ─────────────────────────────────────────────

  it("o ranking de goleiro reconhece UM vocabulario, e a conta e GOL contra o resto", () => {
    // Um item, e nao dois. O `"Goleiro"` que estava aqui era residuo da tentativa
    // de codigos que o repo recuou em junho, e nao caso vivo.
    //
    // Nao ha `ZAG`/`MEI`/`ATA` a enumerar: a conta e `GOL` contra tudo que nao e
    // `GOL`, que e o que tolera vocabulario novo entrando pelo CSV.
    expect(hookGoleiro).toMatch(/GK_POSITIONS\s*=\s*new Set\(\s*\[\s*["']GOL["']\s*\]\s*\)/);
    expect(hookGoleiro).not.toMatch(SEM_PALAVRA);
  });

  // ── A borda do wizard: sem posicao escolhida, nada de estrelas ────────────

  it("o passo 4 da inscricao nao desenha habilidade nenhuma antes da escolha", () => {
    // `skillsFor("")` devolve LINE_SKILLS, e isso esta certo la: ela tem quatro
    // chamadores e devolver `[]` para desconhecido mudaria a semantica do
    // `superRefine` do Zod e do filtro do insert. A politica deste repo e
    // decidir na BORDA (features/players/position.ts:46-47), e a borda e aqui.
    //
    // Sem isto, o passo 4 desenha as seis estrelas de LINHA antes de a pessoa
    // escolher posicao: o goleiro que avaliar primeiro ve o trabalho sumir da
    // tela ao escolher `Goleiro`, sem explicacao nenhuma.
    expect(wizard).toMatch(/const\s+posicaoEscolhida\s*=\s*form\.preferred_position\s*!==\s*""/);
    expect(wizard).toMatch(
      /const\s+activeSkills\s*=\s*posicaoEscolhida\s*\?\s*skillsFor\(\s*form\.preferred_position\s*\)\s*:\s*\[\]/,
    );
  });

  it("o passo 4 pede a escolha da posicao no lugar do radar", () => {
    // O radar tem guarda propria: `hasAnyRating` tambem passa por `skillsFor`, e
    // sozinho ele reapareceria com as habilidades de linha para quem avaliou e
    // depois voltou o select para vazio.
    expect(wizard).toMatch(/\{\s*posicaoEscolhida\s*&&\s*hasAnyRating\(/);
    expect(wizard).toMatch(/\{\s*!posicaoEscolhida\s*&&\s*\([\s\S]{0,300}?Escolha a posição/);
  });
});
