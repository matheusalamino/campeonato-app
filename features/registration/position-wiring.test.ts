import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";
import { CANONICAL_POSITIONS } from "@/features/players/position";
import { POSITION_LABELS } from "@/lib/public/types";

/**
 * Os quatro formularios que ESCREVEM posicao, lidos como texto.
 *
 * ── POR QUE COMO TEXTO ──
 *
 * Tres deles vivem em `app/**` e `components/**`, que o `include` do
 * `vitest.config.ts` nao alcanca (o porque esta escrito la). O quarto,
 * `features/registration/schema.ts`, TEM teste de runtime em `schema.test.ts` —
 * e o que aquele teste nao consegue ver e a DERIVACAO: um enum digitado a mao
 * com os quatro codigos passa identico ao enum derivado da constante. A lista
 * duplicada so diverge no dia em que uma das duas muda, e nesse dia o runtime
 * ainda esta verde.
 *
 * ── O QUE ESTAS ASSERTIVAS SEGURAM ──
 *
 * Desde a 20260821010000 a coluna `players.preferred_position` guarda codigo, e
 * a CHECK `players_preferred_position_known` esta VALIDADA — palavra nao entra:
 *
 *     INSERT INTO players (name, preferred_position) VALUES ('X','Meia');
 *     ERROR: violates check constraint "players_preferred_position_known"
 *
 * Cada edicao abaixo devolve exatamente esse erro ao usuario, e nenhuma delas
 * acende no `tsc` (as chaves do `insert` do Supabase nao sao tipadas contra a
 * CHECK) nem no lint:
 *
 *   z.enum(CANONICAL_POSITIONS)  ->  z.enum(["Zagueiro","Meia","Atacante","Goleiro"])
 *       A inscricao publica para de gravar: o valor validado vai direto para o
 *       `.from("players").insert(...)`.
 *
 *   <option value={codigo}>  ->  <option value={POSITION_LABELS[codigo]}>
 *       O select passa a mandar a palavra de volta. Mesmo estouro, agora com o
 *       Zod tambem recusando antes.
 *
 *   ?? ""  ->  ?? "Meia"  no preenchimento automatico do wizard
 *       Volta o defeito que o proprio comentario ali diz prevenir, so que
 *       invertido: o valor deixa de casar com qualquer `<option>`, o campo
 *       aparece em branco, e o jogador leva erro do Zod num campo que nao tocou.
 *       Pior — a decisao do usuario e que posicao NAO reconhecida obrigue a
 *       escolha, porque a cota do A6 conta `GOL` contra todo o resto e um
 *       goleiro silenciosamente jogado no balde de linha nao deixa rastro.
 *
 *   === "GOL"  ->  === "Goleiro"  em `PlayerForm`
 *       O formulario passa a oferecer as habilidades de LINHA para o goleiro.
 *
 * A varredura de palavra por extenso (`SEM_PALAVRA`) e o que fecha o conjunto:
 * ela pega a lista nova que alguem escrever a mao ao lado da constante.
 */

const RAIZ = process.cwd();

function fonteDe(caminho: string): string {
  return semComentario(readFileSync(join(RAIZ, caminho), "utf8"));
}

const SCHEMA = "features/registration/schema.ts";
const WIZARD = "app/(public)/inscrever/[slug]/RegistrationWizard.tsx";
const CRIAR_JOGADOR = "components/CreatePlayerForm.tsx";
const FORM_JOGADOR = "app/(protected)/players/components/PlayerForm.tsx";
const EDITAR_JOGADOR = "app/(protected)/players/[id]/EditPlayerForm.tsx";

const schema = fonteDe(SCHEMA);
const wizard = fonteDe(WIZARD);
const criarJogador = fonteDe(CRIAR_JOGADOR);
const formJogador = fonteDe(FORM_JOGADOR);
const editarJogador = fonteDe(EDITAR_JOGADOR);

/**
 * Palavra por extenso como LITERAL de string.
 *
 * So o literal, e de proposito: `const goleiro = [...]` em `PlayerForm` e nome
 * de variavel de habilidade e nao tem nada com o vocabulario da coluna. O
 * `semComentario` ja tirou a prosa antes — sem ele esta varredura reprovaria os
 * proprios docblocks que explicam a virada.
 */
const SEM_PALAVRA = /["'`](Goleiro|Zagueiro|Meia|Atacante)["'`]/;

/**
 * Uma `<option>` inteira: valor CODIGO, rotulo PALAVRA, e as duas amarradas ao
 * MESMO identificador pela referencia de volta.
 *
 * Amarradas de proposito, e a licao veio de uma mutacao que sobreviveu: com
 * `CANONICAL_POSITIONS.map(` e `POSITION_LABELS[` asseverados SEPARADAMENTE,
 * trocar as duas pontas —
 *
 *     <option key={codigo} value={POSITION_LABELS[codigo]}>{codigo}</option>
 *
 * — passava com os 509 testes verdes, e e exatamente o defeito que esta task
 * existe para matar: o select volta a submeter a palavra, e o insert volta a
 * bater na CHECK.
 *
 * O QUE ELA NAO PRENDE, e nao deveria: a ORDEM dos atributos e a presenca de
 * outros. `<option value={c} key={c}>` e no-op de JSX, e `className` a mais
 * tambem — reprovar por isso mandaria o proximo cacar um bug que nao existe.
 * Dai o `key` vir por LOOKAHEAD: ele acha o identificador em qualquer posicao
 * da tag sem consumir, e o `value` e procurado do inicio dela de novo. Uma
 * versao sem o lookahead (`<option[^>]*\bkey=...[^>]*\bvalue=...`) parece
 * tolerante e nao e: exige `key` ANTES de `value` e reprova a ordem trocada.
 * Medido nos dois.
 *
 * O `\s*` entre a tag e o rotulo tolera a quebra de linha do formatador, que
 * tambem nao e invariante nenhuma.
 */
const OPCAO_CODIGO_ROTULO =
  /<option(?=[^>]*\bkey=\{(\w+)\})[^>]*\bvalue=\{\1\}[^>]*>\s*\{POSITION_LABELS\[\1\]\}\s*<\/option>/;

describe("os formularios que escrevem posicao falam CODIGO", () => {
  // Sentinela. E a justificativa obvia esta ERRADA, entao fica escrita a certa:
  // arquivo MOVIDO nao "leria vazio" — o `readFileSync` la em cima estoura
  // ENOENT e o vitest derruba o arquivo de teste inteiro, bem barulhento.
  // Medido.
  //
  // O que este `it` pega e o caso silencioso: o arquivo continua existindo e
  // legivel, mas deixou de ser o que as assertivas abaixo supoem — o insert
  // migrou para um service, o select virou componente proprio, o form foi
  // reescrito. Nesse dia todo `not.toMatch` continua verde medindo um arquivo
  // que nao guarda mais a fiacao. Cada linha aqui e a ancora de um dos cinco.
  it("le os cinco arquivos, e cada um ainda e o que este teste pensa que e", () => {
    expect(schema).toContain("preferred_position:");
    expect(wizard).toContain("normalizePreferredPosition(");
    expect(criarJogador).toContain('.from("players").insert(');
    expect(formJogador).toContain("skillsToShow");
    expect(editarJogador).toContain('.from("players")');
  });

  it("a constante e o rotulo cobrem as quatro posicoes, e o rotulo nao e o codigo", () => {
    // Prende as duas pontas que todas as assertivas de texto abaixo assumem: se
    // `POSITION_LABELS` perdesse uma entrada, o select mostraria `undefined` e
    // nenhuma leitura de fonte perceberia.
    expect([...CANONICAL_POSITIONS]).toEqual(["GOL", "ZAG", "MEI", "ATA"]);
    for (const codigo of CANONICAL_POSITIONS) {
      expect(POSITION_LABELS[codigo]).toBeTruthy();
      expect(POSITION_LABELS[codigo]).not.toBe(codigo);
    }
  });

  it("o Zod da inscricao deriva da constante, em vez de repetir a lista", () => {
    expect(schema).toMatch(/preferred_position:\s*z\.enum\(\s*CANONICAL_POSITIONS/);
    expect(schema).toMatch(/from\s+["']@\/features\/players\/position["']/);
    expect(schema).not.toMatch(SEM_PALAVRA);
  });

  it("o wizard nasce sem posicao escolhida, e o nao reconhecido nao vira Meia", () => {
    expect(wizard).toMatch(/preferred_position:\s*""/);
    expect(wizard).toMatch(
      /normalizePreferredPosition\(\s*p\.preferred_position\s*\)\.position\s*\?\?\s*""/,
    );
    expect(wizard).not.toMatch(SEM_PALAVRA);
  });

  it("o select do wizard oferece o codigo como valor e a palavra como rotulo", () => {
    expect(wizard).toMatch(/CANONICAL_POSITIONS\.map\(/);
    expect(wizard).toMatch(OPCAO_CODIGO_ROTULO);
    // A opcao vazia e o que torna a escolha obrigatoria na tela: sem ela o
    // select desenha a PRIMEIRA posicao como se estivesse escolhida enquanto o
    // estado ainda e "", e o jogador manda goleiro sem nunca ter tocado no
    // campo — bem o silencio que a decisao do usuario proibiu.
    //
    // Colada ao `.map` de proposito. Solta, `<option value="">` casava com
    // qualquer um dos QUATRO selects deste arquivo (estado, grupo, camiseta), e
    // apagar justamente o da posicao passava com os 509 testes verdes. Medido.
    expect(wizard).toMatch(/<option value="">[^<]*<\/option>\s*\{CANONICAL_POSITIONS\.map\(/);
  });

  it("o cadastro de jogador do admin sai da constante", () => {
    expect(criarJogador).toMatch(/CANONICAL_POSITIONS\.map\(/);
    expect(criarJogador).toMatch(OPCAO_CODIGO_ROTULO);
    expect(criarJogador).not.toMatch(SEM_PALAVRA);
  });

  it("o formulario de avaliacao decide o goleiro pelo codigo", () => {
    // Aspas de qualquer lado: nao ha `.prettierrc` no repo, entao a escolha
    // entre `"` e `'` nao e invariante de nada.
    expect(formJogador).toMatch(/===\s*["']GOL["']/);
    expect(formJogador).toMatch(/CANONICAL_POSITIONS\.map\(/);
    expect(formJogador).toMatch(OPCAO_CODIGO_ROTULO);
    expect(formJogador).not.toMatch(SEM_PALAVRA);
  });

  it("a edicao de jogador mostra a palavra, e nao o codigo cru", () => {
    expect(editarJogador).toMatch(/CANONICAL_POSITIONS\.map\(/);
    expect(editarJogador).toMatch(OPCAO_CODIGO_ROTULO);
    expect(editarJogador).not.toMatch(SEM_PALAVRA);
  });
});
