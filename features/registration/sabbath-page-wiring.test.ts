import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A fiacao do sabado na pagina de inscricao, lida como texto.
 *
 * `sabbathStatus` e `registrationGate` decidem tudo e sao testados de verdade,
 * mas alguem precisa LIGAR os dois na pagina — e essa ligacao e o unico ponto
 * do fluxo onde uma edicao de uma palavra abre a inscricao no sabado sem
 * quebrar nada. As tres que importam:
 *
 *   registrationGate(champ, now, pause)  ->  ...now, null)     abre no sabado
 *   endsAt={gate.endsAt}                 ->  endsAt={null}     perde a hora
 *   nextSunset={nextSunset}              ->  nextSunset={null} mata o aviso
 *
 * As tres passam no `tsc`, porque `null` e valor legitimo nos tres lugares.
 *
 * E uma quarta, que a T10 acrescentou: o `serverNow` que viaja junto com o por
 * do sol. Sem ele o wizard compara o por do sol com o relogio do APARELHO do
 * jogador, e alguns minutos de erro desligam a faixa e o corte do pagamento —
 * ou poem a pagina em loop de refresh. Tirar o campo do objeto nem chega ao
 * `tsc` como null: ele simplesmente para de existir.
 *
 * Le a pagina como texto pelo mesmo motivo que wizard-steps.test.ts le o
 * wizard: o projeto nao tem jsdom nem Testing Library (vitest roda com
 * environment "node"), e renderizar um Server Component que consulta o Supabase
 * exigiria dublar o banco inteiro para descobrir um fato que esta escrito no
 * proprio arquivo.
 */
const PAGINA = join(process.cwd(), "app/(public)/inscrever/[slug]/page.tsx");
const fonte = readFileSync(PAGINA, "utf8");

/** Toda abertura de tag `<Nome ...>` da pagina. */
function tags(nome: string): string[] {
  return [...fonte.matchAll(new RegExp(`<${nome}\\b[^>]*>`, "g"))].map((m) => m[0]);
}

/** O valor de `prop={...}` dentro de uma abertura de tag, ou null. */
function prop(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`${nome}=\\{([^}]*)\\}`));
  return m ? m[1].trim() : null;
}

describe("a fiacao do sabado na pagina de inscricao", () => {
  // Sentinela geral: um regex que casa zero linhas passaria vazio, e trocar
  // uma lacuna conhecida por falsa sensacao de cobertura seria pior que nao ter
  // teste nenhum. Cada `it` abaixo confere primeiro que ACHOU o que procura.

  it("le a pagina, e ela ainda pergunta o status do sabado", () => {
    expect(fonte.length).toBeGreaterThan(0);
    expect(fonte).toContain("sabbathStatus(");
    // O destructuring e a origem dos dois valores que os testes abaixo seguem.
    expect(fonte).toMatch(/const \{ pause, sunsetAt \} = sabbathStatus\(/);
  });

  it("a pausa chega ao gate, e nao um null no lugar dela", () => {
    const chamadas = [...fonte.matchAll(/registrationGate\(([^)]*)\)/g)];
    expect(chamadas).toHaveLength(1);

    const args = chamadas[0][1].split(",").map((a) => a.trim());
    expect(args).toHaveLength(3);
    // O terceiro argumento e a pausa. `null` ali abre a inscricao no sabado.
    expect(args[2]).toBe("pause");
  });

  it("todo RestOverlay da pagina recebe o fim da pausa vindo do gate", () => {
    const achados = tags("RestOverlay");
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.map((t) => prop(t, "endsAt"))).toEqual(
      achados.map(() => "gate.endsAt"),
    );
  });

  it("todo RegistrationWizard da pagina recebe o por do sol calculado", () => {
    // So a pagina: o `RestOverlay` renderiza um wizard borrado com
    // `nextSunset={null}` de proposito, e aquilo esta certo.
    const achados = tags("RegistrationWizard");
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.map((t) => prop(t, "nextSunset"))).toEqual(
      achados.map(() => "nextSunset"),
    );
  });

  it("o por do sol viaja com o relogio do servidor, e nao sozinho", () => {
    const montagem = [...fonte.matchAll(/const nextSunset = ([^;]*);/g)];
    expect(montagem).toHaveLength(1);

    const expressao = montagem[0][1];
    // O instante e o que `sabbathStatus` calculou — nao um `new Date()` daqui,
    // que reabriria a decisao do sabado fora do modulo que a toma.
    expect(expressao).toMatch(/\bat: sunsetAt\b/);
    // E o carimbo e o MESMO `now` que decidiu a pausa e o gate, para os tres
    // responderem sobre o mesmo instante.
    expect(expressao).toMatch(/\bserverNow: now\.toISOString\(\)/);
    // Sem por do sol nao ha o que carimbar: `null` mantem o par fora do alcance.
    expect(expressao).toMatch(/^sunsetAt \?/);
  });
});
