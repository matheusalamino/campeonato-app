import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";

/**
 * A fiacao do formulario de campeonato, lida como texto.
 *
 * `derivedCapacity` esta coberta em capacity.test.ts e `toRow` em row.test.ts.
 * O que NAO tinha assertiva nenhuma e a ponte entre as duas e a tela: o
 * `include` do `vitest.config.ts` alcanca `lib/**`, `features/**` e
 * `scripts/**`, e o formulario mora em `app/**`.
 *
 * A lacuna nao e hipotetica — ela ja mordeu. A T3 pos `toRow` a gravar as cinco
 * colunas do formato, mas `buildPayload` monta o payload campo a campo e nao
 * mandava nenhuma delas. Com `tsc` limpo e os 522 testes verdes, o admin ficou
 * assim, MEDIDO contra o banco em 8/10/1/1/4:
 *
 *   salvar um rascunho APAGAVA a configuracao
 *       `teams_count` 8 -> NULL, `players_per_team` 10 -> NULL,
 *       `waitlist_goalkeepers` 1 -> 0, `waitlist_outfield` 4 -> 0. Quem escreve
 *       e `updateChampionship`, com `.update(row)` da linha inteira: nao
 *       mencionar a coluna e apaga-la. Perda de dado sem desfazer pela UI.
 *
 *   todo save fora de `draft` era RECUSADO
 *       `refineChampionship` exige `teams_count` e `players_per_team` para
 *       publicados. Os dois nao existiam na tela, entao o toast dizia "Corrija
 *       os campos destacados" sem destacar nada, e o campeonato do seed (que
 *       esta em `active`) ficou ineditavel.
 *
 * As tres edicoes que estas assertivas matam, e que passam nos tres portoes:
 *
 *   tirar `teams_count: emptyToUndef(form.teams_count)` do payload
 *       Volta o apagamento acima para uma coluna so. `tsc` fica LIMPO: a
 *       entrada de `createChampionship`/`updateChampionship` e `unknown`, e no
 *       schema `teams_count` e `.optional()`.
 *
 *   devolver `set("max_players", ...)` para a tela
 *       Duas fontes para a mesma coluna: o admin digita 80, `toRow` sobrescreve
 *       pela formula, e a tela recarrega com outro numero. O input mente.
 *
 *   trocar o resumo por aritmetica escrita aqui (`times * jogadores`)
 *       A tela passa a prometer uma conta e o banco a gravar outra assim que as
 *       duas divergirem — e `derivedCapacity` tem piso, teto e o `Math.min` do
 *       goleiro, nenhum deles reproduzido a olho.
 *
 * Le como texto pelo mesmo motivo e com o mesmo idioma de
 * `features/registration/service-wiring.test.ts` e
 * `features/players/import-wiring.test.ts`: os nomes locais sao LIDOS do
 * arquivo em vez de escritos aqui — renomear pelo atalho da IDE e no-op e nao
 * pode matar teste —, e os padroes toleram espaco e quebra de linha, porque
 * vermelho por causa de formatacao manda o proximo cacar um bug que nao existe.
 *
 * O `semComentario` nao e enfeite: neste bloco tres assertivas ja casaram a
 * mencao dentro de um comentario em vez do codigo, e duas mutacoes reais
 * atravessaram a suite assim.
 */
const FORMULARIO = join(
  process.cwd(),
  "app/(protected)/championships/components/ChampionshipForm.tsx",
);

const formulario = semComentario(readFileSync(FORMULARIO, "utf8"));

/** Os cinco campos do formato, na ordem em que a DDL de 20260820010000 os declara. */
const FORMATO = [
  "teams_count",
  "players_per_team",
  "goalkeepers_per_team",
  "waitlist_goalkeepers",
  "waitlist_outfield",
] as const;

/** As duas grandezas derivadas: sao SAIDA de `derivedCapacity`, nunca entrada. */
const DERIVADAS = ["max_players", "max_waitlist_players"] as const;

/** Um unico casamento de `padrao`, com os grupos. Falha se nao houver exatamente um. */
function achado(fonte: string, padrao: RegExp): RegExpMatchArray {
  const achados = [...fonte.matchAll(new RegExp(padrao, `${padrao.flags.replace("g", "")}g`))];
  expect(achados).toHaveLength(1);
  return achados[0];
}

/**
 * O corpo de `function nome(...)`, contando chaves.
 *
 * Existe para que "esta no payload" signifique o payload, e nao o arquivo
 * inteiro: `teams_count:` tambem aparece no `useState`, entao uma assertiva
 * sobre a fonte toda sobreviveria a tirar a linha de `buildPayload` — que e
 * exatamente a mutacao que este arquivo precisa matar.
 */
function corpoDaFuncao(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`function ${nome}(`);
  expect(inicio, `nao encontrei \`function ${nome}(\``).toBeGreaterThan(-1);
  const abre = fonte.indexOf("{", inicio);
  expect(abre, `nao encontrei o corpo de \`${nome}\``).toBeGreaterThan(-1);

  let profundidade = 0;
  for (let i = abre; i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    else if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(abre + 1, i);
    }
  }
  throw new Error(`chave sem fechamento em \`${nome}\``);
}

describe("a fiacao do formulario de campeonato", () => {
  it("le o formulario, e ele ainda e o que estas assertivas pensam que e", () => {
    // Sentinela, e nao formalidade: os `not.toContain` abaixo passariam felizes
    // contra um arquivo vazio ou renomeado, e cobertura falsa e pior que lacuna
    // conhecida.
    expect(formulario.length).toBeGreaterThan(0);
    expect(formulario).toContain("export function ChampionshipForm(");
    expect(formulario).toContain("championshipFormSchema.safeParse(payload)");
  });

  it("os cinco campos do formato entram no payload", () => {
    const payload = corpoDaFuncao(formulario, "buildPayload");
    // O nome do ajudante sai do proprio payload: renomea-lo e no-op.
    const [, vazioParaIndefinido] = achado(payload, /const (\w+) = \(v: string\) =>/);

    for (const campo of FORMATO) {
      // O `,?` nao e zelo: sem ele a assertiva prende FORMATACAO, e nao efeito.
      // MEDIDO — quebrar a chamada em tres linhas, que e como o prettier a
      // quebraria, poe a virgula final antes do `)` e reprovava uma edicao que
      // nao muda nada. Vermelho por formatacao manda o proximo cacar um bug que
      // nao existe.
      expect(payload, `\`${campo}\` nao chega ao payload`).toMatch(
        new RegExp(`\\b${campo}:\\s*${vazioParaIndefinido}\\(\\s*form\\.${campo}\\s*,?\\s*\\)`),
      );
    }
  });

  it("os cinco tem input e FieldError na tela", () => {
    for (const campo of FORMATO) {
      // Sem o input o admin nao tem como preencher o que `refineChampionship`
      // exige para publicar; sem o `FieldError` a recusa nao destaca nada e o
      // toast manda "corrigir os campos destacados" contra uma tela intacta.
      expect(formulario, `\`${campo}\` nao tem input`).toContain(`set("${campo}"`);
      expect(formulario, `\`${campo}\` nao tem FieldError`).toContain(`name="${campo}"`);
    }
  });

  it("o total e a espera nao sao mais digitaveis", () => {
    const payload = corpoDaFuncao(formulario, "buildPayload");
    for (const coluna of DERIVADAS) {
      expect(formulario, `\`${coluna}\` voltou a ser digitavel`).not.toContain(`set("${coluna}"`);
      expect(payload, `\`${coluna}\` voltou ao payload`).not.toContain(coluna);
    }
  });

  it("o resumo vem de derivedCapacity, e nao de aritmetica na view", () => {
    // A CHAMADA, e nao so o import: `toContain("derivedCapacity")` casaria a
    // linha do `import` e deixaria passar um resumo calculado a mao logo abaixo.
    expect(formulario).toContain("derivedCapacity({");

    const [, resumo] = achado(formulario, /const (\w+) = derivedCapacity\(\s*\{/);
    // Os quatro numeros que a tela mostra saem do RESULTADO. `outfield` e o que
    // mais importa aqui: e `total - goalkeepers` com o `Math.min` do goleiro por
    // dentro, e quem o refizer a olho erra em cota maior que o time.
    for (const grandeza of ["total", "goalkeepers", "outfield", "waitlistTotal"]) {
      expect(formulario, `o resumo nao mostra \`${grandeza}\` do derivado`).toMatch(
        new RegExp(`\\{\\s*${resumo}\\.${grandeza}\\s*\\}`),
      );
    }
  });
});
