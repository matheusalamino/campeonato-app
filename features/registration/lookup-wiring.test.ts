import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O 404 mudo, lido como texto na propria pagina.
 *
 * `requireRow` e testado de verdade em lib/supabase/require-row.test.ts, mas
 * quem causou o incidente nao foi a funcao — foi o CALL SITE. Voltar a pagina
 * para `const { data: champ } = await supabase...` compila, passa nos 164
 * testes, e devolve o mesmo 404 seco quando o schema sai de sincronia.
 *
 * Le como texto pelo mesmo motivo dos testes irmaos: o vitest roda com
 * environment "node", sem jsdom, e renderizar um Server Component que consulta
 * o Supabase exigiria dublar o banco para descobrir um fato que esta escrito no
 * arquivo.
 */
const PAGINA = join(process.cwd(), "app/(public)/inscrever/[slug]/page.tsx");
const fonte = readFileSync(PAGINA, "utf8");

/**
 * So o componente da pagina.
 *
 * O `generateMetadata` acima dele tambem consulta com `.maybeSingle()` e tambem
 * le o `data` cru — e ali esta certo: e o preview do link, roda com o client
 * anon dentro de um try/catch e cai de proposito num titulo generico. Misturar
 * os dois faria este teste cobrar do preview uma regra que nao e dele.
 */
const ABERTURA = "export default async function InscreverPage";
const corpo = fonte.slice(fonte.indexOf(ABERTURA));

describe("a fiacao da consulta do campeonato na pagina de inscricao", () => {
  it("acha o componente da pagina e a consulta que ele faz", () => {
    // Sentinela: um recorte vazio faria os testes abaixo passarem sem ler nada.
    expect(fonte).toContain(ABERTURA);
    expect(corpo).toContain('.from("championships")');
    expect(corpo).toContain("notFound()");
  });

  it("a consulta do campeonato passa por requireRow", () => {
    expect(fonte).toContain('from "@/lib/supabase/require-row"');
    expect(corpo).toContain("requireRow(");
  });

  it("o componente nao le `data` cru de consulta nenhuma", () => {
    // A forma exata que causou o incidente, e qualquer parente dela: todo
    // `const { ... data ... } = await supabase...` dentro do componente volta a
    // descartar o `error` e a transformar falha de consulta em linha ausente.
    //
    // As DUAS formas de await, e a segunda entrou depois: a pagina passou a
    // buscar campeonato e janela de sabado em paralelo, entao existe
    // `const [{ data }, ...] = await Promise.all([...])`, que comeca com `[` e
    // escapava da regex de cima. Sem este segundo caso o teste ficaria verde
    // enquanto a forma nova voltasse a descartar o erro.
    const awaitDireto = [...corpo.matchAll(/const\s*\{[^}]*\}\s*=\s*await\s+supabase/g)];
    const awaitEmParalelo = [...corpo.matchAll(/const\s*\[[^\]]*\]\s*=\s*await\s+Promise\.all/g)];

    const descartamOErro = [...awaitDireto, ...awaitEmParalelo]
      .map((m) => m[0])
      .filter((trecho) => /\bdata\b/.test(trecho));

    expect(
      descartamOErro,
      "Consulta cujo `data` e lido na propria linha do await: o `error` some ali, " +
        "e a falha volta a se passar por linha ausente. Guarde o resultado inteiro " +
        "e passe por `requireRow`.",
    ).toEqual([]);
  });
});
