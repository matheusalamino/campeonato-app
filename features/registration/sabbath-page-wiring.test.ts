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
 *   registrationGate(champ, now, pause)  ->  ...now, null)   abre no sabado
 *   endsAt={gate.endsAt}                 ->  endsAt={null}   perde a hora
 *   sunsetAt={sunsetAt}                  ->  sunsetAt={null} mata o aviso
 *
 * As tres passam no `tsc`, porque `null` e valor legitimo nos tres lugares.
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
    // `sunsetAt={null}` de proposito, e aquilo esta certo.
    const achados = tags("RegistrationWizard");
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.map((t) => prop(t, "sunsetAt"))).toEqual(
      achados.map(() => "sunsetAt"),
    );
  });
});
