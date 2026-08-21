import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A fiacao da normalizacao de posicao, lida como texto.
 *
 * `normalizePreferredPosition` esta coberta em position.test.ts. As LINHAS QUE A
 * CHAMAM estao todas em `app/**`, que o `include` do `vitest.config.ts` nao
 * alcanca — so `lib/**`, `features/**` e `scripts/**`. Sem estas assertivas, as
 * quatro edicoes abaixo passam nos tres portoes (tsc limpo, suite verde, lint
 * nos mesmos 119):
 *
 *   preferred_position: preferredPosition  ->  safeString(row["Posição"])
 *       Volta a gravar a celula crua. A CHECK recusa, e o admin leva erro cru do
 *       Postgres numa linha que ele nao sabe consertar.
 *
 *   apagar o `if (positionResult.kind === "unrecognized") throw`
 *       `Goleir0` passa a gravar null em silencio. A cota do A6 conta `Goleiro`
 *       contra o resto, entao esse goleiro vira jogador de LINHA e a trava de
 *       capacidade erra calada — o defeito que o bloco existe para matar.
 *
 *   isGk = normalize(...)  ->  safeString(row["Posição"]) === "Goleiro"
 *       `GOL` e `' goleiro '` deixam de ser goleiro, e o import le as 6 colunas
 *       de LINHA para um goleiro: autoavaliacao errada, silenciosa.
 *
 *   apagar o `if (error)` do EditPlayerForm
 *       Reintroduz o defeito LITERAL que este commit existe para matar: update
 *       recusado terminando em `router.refresh()`, com a tela mostrando sucesso.
 *
 * Le como texto pelo mesmo motivo e com o mesmo idioma de
 * service-wiring.test.ts: padroes toleram formatacao, porque vermelho por causa
 * de quebra de linha manda o proximo cacar bug que nao existe. O que eles NAO
 * toleram e o efeito mudar de forma.
 */
const IMPORT = join(process.cwd(), "app/api/import-players/route.ts");
const EDIT = join(process.cwd(), "app/(protected)/players/[id]/EditPlayerForm.tsx");
const WIZARD = join(process.cwd(), "app/(public)/inscrever/[slug]/RegistrationWizard.tsx");

const ler = (p: string) => readFileSync(p, "utf8");

/**
 * O texto SEM comentario.
 *
 * Nao e purismo: a primeira versao deste arquivo reprovou porque a assertiva
 * posicional achou `router.refresh()` DENTRO do comentario que explica por que
 * ele nao pode ser alcancado — prosa casando como se fosse codigo, e a ordem
 * saindo invertida (2215 antes de 2327). Assertiva de controle tem de casar o
 * CODIGO.
 */
const semComentario = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("fiacao: import-players normaliza a posicao", () => {
  // JA sem comentario: toda assertiva deste arquivo mede CODIGO. A versao
  // anterior aplicava semComentario em UMA assertiva -- a que ja tinha queimado
  // -- e as outras nove liam texto cru. Duas mutacoes reais atravessaram os 494
  // testes por isso: apagar o throw do desconhecido e devolver o isGk para
  // `row["Posição"]`, ambas deixando a versao boa virar comentario logo acima.
  const src = semComentario(ler(IMPORT));

  it("importa a funcao de features/", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*normalizePreferredPosition[^}]*\}\s*from\s*["']@\/features\/players\/position["']/,
    );
  });

  it("NAO grava mais a celula crua em preferred_position", () => {
    expect(src).not.toMatch(/preferred_position:\s*safeString\(/);
    // E nenhum acesso cru a linha do CSV, seja qual for a grafia.
    expect(src).not.toMatch(/preferred_position:\s*[^,\n]*row\[/);
  });

  it("os DOIS escritores gravam o valor normalizado", () => {
    // O nome local e lido do arquivo: renomear pela IDE nao pode matar teste.
    const decl = src.match(
      /const\s+(\w+)\s*=\s*normalizePreferredPosition\(\s*row\[["']Posição["']\]\s*\)\s*;/,
    );
    expect(decl).not.toBeNull();
    const resultado = decl![1];

    const campo = src.match(
      /const\s+(\w+)\s*=\s*(?:\w+)\.position\s*;|const\s+(\w+)\s*=\s*.*\bposition\b\s*;/,
    );
    expect(campo).not.toBeNull();

    const escritas = src.match(/preferred_position:\s*(\w+)\s*,/g) ?? [];
    expect(escritas).toHaveLength(2);
    // As duas escritas usam o MESMO identificador, e ele nao e `safeString(...)`.
    const nomes = new Set(
      escritas.map((e) => e.replace(/preferred_position:\s*/, "").replace(/\s*,$/, "")),
    );
    expect(nomes.size).toBe(1);
    expect([...nomes][0]).not.toBe("undefined");
    expect(src).toContain(`${resultado}.position`);
  });

  it("o desconhecido ABORTA a linha em vez de gravar null", () => {
    expect(src).toMatch(/kind\s*===\s*["']unrecognized["']/);
    expect(src).toMatch(/kind\s*===\s*["']unrecognized["'][\s\S]{0,400}?throw\s+new\s+Error/);
  });

  it("o isGk olha o canonico, e nao a celula crua", () => {
    const m = src.match(/const\s+isGk\s*=\s*([^;]+);/);
    expect(m).not.toBeNull();
    const rhs = m![1];
    // Exige a FORMA, em vez de proibir uma grafia: a negativa antiga bloqueava
    // `safeString(` e deixava passar `row["Posição"] === "Goleiro"` cru.
    expect(rhs).toMatch(/^normalizePreferredPosition\(/);
    expect(rhs).toMatch(/\.position\s*===\s*["']Goleiro["']/);
  });
});

describe("fiacao: EditPlayerForm olha o erro e normaliza a semente", () => {
  const src = semComentario(ler(EDIT));

  it("destrutura o error do update", () => {
    expect(src).toMatch(/const\s*\{\s*error\s*(?::\s*\w+\s*)?\}\s*=\s*await\s+supabase/);
  });

  it("um update recusado NAO chega ao router.refresh()", () => {
    // Ha um `if (error) { ... return; }` ANTES do refresh. Sobre codigo, e nao
    // sobre prosa: ver `semComentario` acima.
    const codigo = src;
    const guarda = codigo.match(/if\s*\(\s*error\s*\)\s*\{[\s\S]{0,300}?return\s*;[\s\S]*?\}/);
    expect(guarda).not.toBeNull();
    const iGuarda = codigo.search(/if\s*\(\s*error\s*\)/);
    const iRefresh = codigo.search(/router\.refresh\(\)/);
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iRefresh).toBeGreaterThan(iGuarda);
  });

  it("a falha aparece para o admin", () => {
    expect(src).toMatch(/toast\.error\(/);
  });

  it("a semente da posicao passa pela normalizacao", () => {
    expect(src).toMatch(/normalizePreferredPosition\(\s*stored\s*\)|normalizePreferredPosition\(\s*player\.preferred_position\s*\)/);
  });
});

describe("fiacao: o prefill do wizard normaliza", () => {
  const src = semComentario(ler(WIZARD));

  it("nao joga mais o valor cru do banco no select de quatro opcoes", () => {
    expect(src).not.toMatch(/preferred_position:\s*p\.preferred_position\s*\?\?/);
    expect(src).toMatch(
      /preferred_position:\s*[\s\S]{0,120}?normalizePreferredPosition\(\s*p\.preferred_position\s*\)\.position/,
    );
  });
});
