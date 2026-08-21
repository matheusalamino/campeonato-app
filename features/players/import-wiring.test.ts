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
 *
 * A versao anterior era `/^[ \t]*\/\/.*$/gm`, ANCORADA em inicio de linha, e por
 * isso so pegava comentario de linha inteira. Comentario no RABO de linha de
 * codigo sobrevivia, e alimentava as assertivas posicionais como se fosse
 * codigo. Mutacao medida que atravessou: tirar o `return;` de dentro do
 * `if (error)` do EditPlayerForm e deixar `// TODO: voltar o return;` no fim da
 * linha do `toast.error` — dentro do bloco, entao nem recortar o bloco salva.
 *
 * O `(?<!:)` guarda o `https://` de virar comentario de linha; e a mesma versao
 * de `features/registration/service-wiring.test.ts` e dos dois irmaos dela.
 */
const semComentario = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");

/**
 * O corpo `{...}` do bloco que `padrao` abre, com as chaves balanceadas.
 *
 * Existe porque regex com janela de N caracteres nao respeita bloco: a versao
 * anterior de duas assertivas deste arquivo usava
 * `[\s\S]{0,400}?throw new Error` e `[\s\S]{0,300}?return\s*;`, e as duas
 * alcancavam linhas de FORA do `if` — `if (fetchError) throw new Error(...)` doze
 * linhas abaixo, e um `return;` posterior ao `router.refresh()`. Nos dois casos a
 * mutacao real passou com a suite verde.
 *
 * Conta chave crua. Bloco cujo corpo tem `{` ou `}` DESBALANCEADO dentro de
 * string (ex.: `"}"`) sairia errado; nenhum dos blocos medidos aqui tem, e os
 * `${...}` de template literal sao balanceados por construcao. Vem depois de
 * `semComentario`, entao chave em comentario ja nao conta.
 */
function corpoDoBloco(fonte: string, padrao: RegExp): string | null {
  const m = fonte.match(padrao);
  if (!m || m.index === undefined) return null;
  const abre = fonte.indexOf("{", m.index);
  if (abre === -1) return null;
  let nivel = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === "{") nivel += 1;
    else if (fonte[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(abre + 1, i);
    }
  }
  return null;
}

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

    // O identificador gravado tem de ser o DERIVADO de `<resultado>.position`, e
    // nao um nome qualquer. A versao anterior deste par de assertivas era morta
    // nas duas pontas: o grupo `campo` era casado e nunca usado, e a segunda
    // alternativa da regex (`const (\w+) = .*\bposition\b\s*;`) casava quase
    // qualquer declaracao do arquivo. Cobertura falsa e pior que lacuna
    // conhecida, porque ela conta como rede e ninguem volta a olhar.
    const campo = src.match(new RegExp(`const\\s+(\\w+)\\s*=\\s*${resultado}\\.position\\s*;`));
    expect(campo).not.toBeNull();
    const derivado = campo![1];

    const escritas = src.match(/preferred_position:\s*(\w+)\s*,/g) ?? [];
    expect(
      escritas,
      "Sao DOIS escritores de `preferred_position:` em route.ts: o INSERT do " +
        "jogador novo e o UPDATE do que ja existe. Se um TERCEIRO apareceu e e " +
        "legitimo, some 1 aqui DEPOIS de conferir que ele tambem grava o valor " +
        "normalizado. Se caiu para 1 ou 0, alguem trocou a escrita por uma " +
        "expressao (ex.: `safeString(...)`) e a celula crua voltou a ir para o " +
        "banco -- a CHECK players_preferred_position_known recusa, e o admin leva " +
        "erro cru do Postgres.",
    ).toHaveLength(2);

    // As duas escritas usam o MESMO identificador, e ele e o derivado.
    const nomes = new Set(
      escritas.map((e) => e.replace(/preferred_position:\s*/, "").replace(/\s*,$/, "")),
    );
    expect(nomes.size).toBe(1);
    expect([...nomes][0]).toBe(derivado);
  });

  it("o desconhecido ABORTA a linha em vez de gravar null", () => {
    expect(src).toMatch(/kind\s*===\s*["']unrecognized["']/);

    // DENTRO do bloco, e nao "em algum lugar nos proximos 400 caracteres". A
    // janela lazy alcancava o `if (fetchError) throw new Error(fetchError.message)`
    // doze linhas abaixo, que nao tem nada com posicao: trocar o `throw` deste
    // ramo por um `console.warn` compacto passava com os 495 testes verdes e o
    // tsc limpo, e `Goleir0` voltava a gravar null em silencio -- o goleiro
    // contado como jogador de linha, que e o defeito que o A6 existe para matar.
    const corpo = corpoDoBloco(src, /if\s*\([^)]*kind\s*===\s*["']unrecognized["']\s*\)/);
    expect(corpo).not.toBeNull();
    expect(corpo!).toMatch(/throw\s+new\s+Error/);
    // E a mensagem junto: `throw new Error()` mudo aborta, mas nao diz ao admin
    // qual celula consertar, e o import roda linha a linha.
    expect(corpo!).toMatch(/Posição não reconhecida/);
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
    //
    // O `return;` tem de estar DENTRO do bloco. A janela anterior
    // (`\{[\s\S]{0,300}?return\s*;[\s\S]*?\}`) aceitava um `return;` de FORA, e a
    // mutacao em duas etapas passava inteira: tirar o `return;` do `if (error)` e
    // por um depois do `router.refresh()`. Isso devolve o defeito literal que
    // este commit matou -- toast de sucesso e refresh num update RECUSADO.
    const corpo = corpoDoBloco(src, /if\s*\(\s*error\s*\)/);
    expect(corpo).not.toBeNull();
    expect(corpo!).toMatch(/return\s*;/);
    expect(corpo!).toMatch(/toast\.error\(/);
    // E o refresh nao pode estar dentro do ramo de erro.
    expect(corpo!).not.toMatch(/router\.refresh\(/);

    const iGuarda = src.search(/if\s*\(\s*error\s*\)/);
    const iRefresh = src.search(/router\.refresh\(\)/);
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
