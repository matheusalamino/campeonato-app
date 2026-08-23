import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAMPIONSHIP_STATUS } from "@/types/championship";
import { semComentario } from "@/features/testing/sem-comentario";
import { opensRegistration, publishBlock } from "./publish-guard";

/**
 * A guarda de publicacao: a decisao, e a linha do action que a chama.
 *
 * Duas metades porque o defeito tem duas metades. A regra vive em `features/`,
 * onde o `include` do vitest alcanca e da para asseverar COMPORTAMENTO; a
 * chamada vive em `app/(protected)/championships/actions.ts`, que fica de fora
 * do `include` e so pode ser varrido como TEXTO. Uma guarda certa que ninguem
 * chama e igual a guarda nenhuma.
 */

const ACTIONS = join(process.cwd(), "app/(protected)/championships/actions.ts");
const actions = semComentario(readFileSync(ACTIONS, "utf8"));

describe("qual status abre inscricao", () => {
  it("e `subscribing`, e so ele", () => {
    expect(opensRegistration("subscribing")).toBe(true);

    // A lista NAO esta escrita aqui: sai de CHAMPIONSHIP_STATUS. Status novo
    // entra nesta assertiva sozinho, e quem quiser que ele aceite inscricao
    // tera de dize-lo em dois lugares — aqui e nas RPCs.
    const outros = CHAMPIONSHIP_STATUS.filter((s) => s !== "subscribing");
    expect(outros).toHaveLength(6);
    for (const status of outros) {
      expect(opensRegistration(status)).toBe(false);
    }
  });

  it("`rest` e `subscribed` aparecem publicamente, mas nao abrem inscricao", () => {
    // Os dois tem tela propria na pagina de inscricao e `rest` ainda entra no
    // link do topo da landing (getOpenRegistrationChampionship). Nada disso
    // grava: as duas RPCs recusam com not_open fora de `subscribing`.
    expect(opensRegistration("rest")).toBe(false);
    expect(opensRegistration("subscribed")).toBe(false);
  });

  it("valor fora da lista, nulo e indefinido nao abrem nada", () => {
    expect(opensRegistration("Subscribing")).toBe(false);
    expect(opensRegistration("")).toBe(false);
    expect(opensRegistration(null)).toBe(false);
    expect(opensRegistration(undefined)).toBe(false);
  });
});

describe("o que impede a linha de abrir inscricao", () => {
  it("capacidade de verdade passa — senao isto seria uma trava, e nao uma guarda", () => {
    // 80 e a capacidade do campeonato do seed (8 times de 10) e a do unico
    // campeonato em `subscribing` de staging, medidas em 2026-08-23.
    expect(publishBlock({ max_players: 80 })).toBeNull();
    // Uma vaga basta: a guarda mede se ha vaga, nao se ha vaga bastante.
    expect(publishBlock({ max_players: 1 })).toBeNull();
  });

  it("zero vaga e recusado — a RPC diria `full` para toda inscricao", () => {
    const bloqueio = publishBlock({ max_players: 0 });
    expect(bloqueio?.reason).toBe("zero_capacity");
    expect(bloqueio?.message).toContain("0 vagas");
  });

  it("capacidade ausente e recusada — a RPC entregaria vaga sem olhar limite", () => {
    // `max_players IS NULL` faz a RPC cair em `IF v_max_players IS NULL OR ...`
    // e conceder sempre. Motivo PROPRIO, e nao o mesmo de zero: o desfecho e o
    // oposto, e a frase que o admin le tem de dizer qual dos dois ele ia causar.
    expect(publishBlock({ max_players: null })?.reason).toBe("missing_capacity");
    expect(publishBlock({ max_players: undefined })?.reason).toBe("missing_capacity");
    expect(publishBlock({})?.reason).toBe("missing_capacity");

    expect(publishBlock({ max_players: null })?.message).not.toContain("0 vagas");
  });

  it("negativo e NaN caem no mesmo lado do zero", () => {
    // `!(max > 0)` em vez de `max <= 0` — a forma negada e a unica que recusa
    // NaN. Trocar as duas nao muda nada vindo do Postgres, onde a coluna e int;
    // muda tudo se alguem passar aritmetica por aqui.
    expect(publishBlock({ max_players: -80 })?.reason).toBe("zero_capacity");
    expect(publishBlock({ max_players: Number.NaN })?.reason).toBe("zero_capacity");
  });

  it("as duas linhas REAIS medidas em 2026-08-23 passam", () => {
    // Staging: a migration 20260820010000 nao rodou la, entao nenhuma das cinco
    // colunas de formato existe — e o unico campeonato em `subscribing` tem
    // `max_players = 80` e funciona. Uma guarda que exigisse `teams_count`
    // fecharia aquela inscricao no dia em que subisse.
    const staging = {
      max_players: 80,
      max_waitlist_players: 5,
      status: "subscribing",
    };
    expect(publishBlock(staging)).toBeNull();

    // Local: o campeonato do seed, em `active` com as QUATRO datas nulas — um
    // estado que `refineChampionship` recusa salvar. As RPCs tratam data nula
    // como borda inexistente, de proposito, entao copiar a regra do formulario
    // aqui tiraria de todo ambiente local a unica transicao para `subscribing`
    // que ele tem.
    const seed = {
      max_players: 80,
      teams_count: 8,
      players_per_team: 10,
      registration_start_date: null,
      registration_end_date: null,
      gala_night_date: null,
      tournament_start_date: null,
    };
    expect(publishBlock(seed)).toBeNull();
  });
});

describe("a fiacao da guarda no action de status", () => {
  it("le o action, e ele ainda e o que este teste pensa que e", () => {
    // Sentinela: regex que casa zero linhas passaria vazio, e falsa cobertura e
    // pior que lacuna conhecida.
    expect(actions.length).toBeGreaterThan(0);
    expect(actions).toContain("export async function changeChampionshipStatus");
    expect(actions).toContain("statusChangeSchema.safeParse(input)");
  });

  it("importa as duas metades da guarda de features/", () => {
    expect(actions).toMatch(
      /import \{[^}]*\bopensRegistration\b[^}]*\bpublishBlock\b[^}]*\} from "@\/features\/championships\/publish-guard"/,
    );
  });

  it("traz `max_players` na leitura da linha", () => {
    // Sem a coluna no `.select()` o valor chega `undefined`, `publishBlock`
    // devolve `missing_capacity` e NENHUM campeonato consegue mais abrir
    // inscricao. A guarda vira trava, e verde.
    const [, colunas] = achado(actions, /\.select\(\s*"([^"]*max_players[^"]*)"\s*\)/);
    expect(colunas).toContain("max_players");
  });

  it("consulta a guarda ANTES de gravar o status", () => {
    const guarda = actions.indexOf("opensRegistration(to)");
    const gravacao = actions.indexOf(".update(updatePayload)");
    expect(guarda).toBeGreaterThan(-1);
    expect(gravacao).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(gravacao);
  });

  it("recusa devolvendo a mensagem do bloqueio, e nao uma frase escrita no action", () => {
    // As tres edicoes que esta assertiva mata, e que passam nos quatro portoes:
    //
    //   apagar o `return` de dentro do `if (block)`
    //       A guarda calcula o bloqueio e grava o status assim mesmo. Vira
    //       comentario executavel; `tsc` limpo, lint inalterado.
    //
    //   trocar `block.message` por um literal
    //       O admin passa a ler a mesma frase para os dois motivos, e o unico
    //       que distingue "sem limite" de "recusa todo mundo" some.
    //
    //   trocar `opensRegistration(to)` por `opensRegistration(from)`
    //       Guarda a ORIGEM em vez do alvo: sair de `subscribing` passa a ser
    //       checado, e ENTRAR nele deixa de ser. O defeito volta inteiro, com
    //       de quebra um campeonato lotado que nao consegue mais ser fechado.
    const [, nome] = achado(
      actions,
      /const (\w+)\s*=\s*publishBlock\(\s*current\s*\)/,
    );
    expect(actions).toMatch(
      new RegExp(`if \\(${nome}\\) return \\{ ok: false, error: ${nome}\\.message \\};`),
    );
    expect(actions).toMatch(/if \(current && opensRegistration\(to\)\)/);
  });
});

/** Um unico casamento de `padrao`, com os grupos. Falha se nao houver exatamente um. */
function achado(fonte: string, padrao: RegExp): RegExpMatchArray {
  const achados = [...fonte.matchAll(new RegExp(padrao, `${padrao.flags.replace("g", "")}g`))];
  expect(achados).toHaveLength(1);
  return achados[0];
}
