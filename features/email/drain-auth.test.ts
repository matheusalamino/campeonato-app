import { describe, it, expect, vi } from "vitest";
import {
  bearerToken,
  drainAccess,
  DRAIN_REFUSAL,
  secretMatches,
} from "./drain-auth";
import { DRAIN_ENDPOINT_METHOD } from "./post-action-drain";

/**
 * A porta do dreno.
 *
 * O que ha para provar aqui e curto e nao perdoa: a rota manda e-mail que nao
 * volta atras e gasta uma cota de 300/dia. Cada `it` abaixo corresponde a uma
 * forma conhecida de deixar essa porta encostada.
 */

/** Um segredo com a cara do que `openssl rand -base64 32` produz. */
const SEGREDO = "Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4OWFiY2RlZmdoaQ==";

/** Errado, e do MESMO tamanho. So o conteudo separa este do certo. */
const ERRADO_MESMO_TAMANHO = "Zm9vYmFyYmF6cXV1eDEyMzQ1Njc4OWFiY2RlZmdoSQ==";

/** Errado e CURTO. E o que faz `timingSafeEqual` levantar quando mal usado. */
const ERRADO_CURTO = "x";

/** Errado e LONGO, pelo outro lado do mesmo defeito. */
const ERRADO_LONGO = SEGREDO + SEGREDO + SEGREDO;

function pedido(over: {
  method?: string;
  authorization?: string | null;
  cronSecret?: string | null;
  isAdmin?: () => Promise<boolean>;
}) {
  return {
    method: over.method ?? "GET",
    authorization: over.authorization ?? null,
    // `in`, e nao `?? SEGREDO` nem `=== undefined ? SEGREDO : ...`: o caso que
    // mais importa deste arquivo passa `undefined` DE PROPOSITO (CRON_SECRET nao
    // configurado), e um default por coalescencia o trocaria pelo segredo certo
    // em silencio. MEDIDO: com `=== undefined`, o cenario de `undefined` do laco
    // acendia vermelho contra o codigo CERTO.
    cronSecret: "cronSecret" in over ? over.cronSecret : SEGREDO,
    isAdmin: over.isAdmin ?? (async () => false),
  };
}

describe("bearerToken", () => {
  it("tira o segredo do cabecalho que o cron da Vercel manda", () => {
    expect(bearerToken(`Bearer ${SEGREDO}`)).toBe(SEGREDO);
  });

  it("aceita o esquema em qualquer caixa, porque a RFC 7235 manda", () => {
    expect(bearerToken(`bearer ${SEGREDO}`)).toBe(SEGREDO);
    expect(bearerToken(`BEARER ${SEGREDO}`)).toBe(SEGREDO);
  });

  it("devolve null para cabecalho ausente, vazio ou sem segredo nenhum", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer    ")).toBeNull();
  });

  it("nao confunde outro esquema com Bearer", () => {
    // `Basic <base64>` chega com a mesma forma e NAO e o segredo do cron.
    expect(bearerToken(`Basic ${SEGREDO}`)).toBeNull();
    // E o segredo cru, sem esquema, tambem nao: aceitar as duas formas dobra a
    // superficie de graca.
    expect(bearerToken(SEGREDO)).toBeNull();
  });
});

describe("secretMatches", () => {
  it("o segredo certo confere", () => {
    expect(secretMatches(SEGREDO, SEGREDO)).toBe(true);
  });

  it("o errado do MESMO tamanho nao confere", () => {
    // Sem este caso, uma comparacao que so olhasse `length` passaria.
    expect(ERRADO_MESMO_TAMANHO).toHaveLength(SEGREDO.length);
    expect(secretMatches(ERRADO_MESMO_TAMANHO, SEGREDO)).toBe(false);
  });

  it("o errado de tamanho DIFERENTE nao confere, e nao LEVANTA", () => {
    // ── A ARMADILHA CENTRAL DESTE ARQUIVO ──
    //
    // `timingSafeEqual` levanta `RangeError` com buffers de tamanhos
    // diferentes. Alimentado com os bytes crus do segredo, este caso vira 500 na
    // rota -- e um 500 distingue "tamanho errado" de "conteudo errado" pela
    // RESPOSTA, que e o vazamento que a comparacao em tempo constante existe
    // para nao ter.
    //
    // As duas assertivas sao necessarias: `.toBe(false)` sozinho passa se a
    // funcao conferir o tamanho antes (o que conserta o 500 e VAZA o tamanho
    // pelo tempo), e `.not.toThrow()` sozinho passa se ela devolver `true`.
    expect(() => secretMatches(ERRADO_CURTO, SEGREDO)).not.toThrow();
    expect(() => secretMatches(ERRADO_LONGO, SEGREDO)).not.toThrow();
    expect(secretMatches(ERRADO_CURTO, SEGREDO)).toBe(false);
    expect(secretMatches(ERRADO_LONGO, SEGREDO)).toBe(false);
  });

  it("segredo apresentado ausente nao confere", () => {
    expect(secretMatches(null, SEGREDO)).toBe(false);
    expect(secretMatches(undefined, SEGREDO)).toBe(false);
    expect(secretMatches("", SEGREDO)).toBe(false);
  });

  it("CRON_SECRET nao configurado RECUSA -- nunca o contrario", () => {
    // A linha que mais importa do arquivo. Um ambiente novo, com a variavel
    // ainda por preencher, e onde ninguem esta olhando: se ausencia de segredo
    // autorizasse, o dreno nasceria aberto para a internet ali.
    expect(secretMatches(SEGREDO, undefined)).toBe(false);
    expect(secretMatches(SEGREDO, null)).toBe(false);
    expect(secretMatches(SEGREDO, "")).toBe(false);
    // E ninguem entra apresentando a propria ausencia.
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(undefined, undefined)).toBe(false);
  });

  it("CRON_SECRET so com espaco conta como nao configurado", () => {
    // `" "` sobrevive a um `!expected`, e nao e segredo nenhum. Sem esta
    // assertiva, um `.env` com a linha `CRON_SECRET= ` abriria a porta para
    // quem mandasse exatamente um espaco.
    expect(secretMatches(" ", " ")).toBe(false);
    expect(secretMatches("   ", "   ")).toBe(false);
  });
});

describe("drainAccess", () => {
  it("o segredo certo entra pela porta do cron", async () => {
    const acesso = await drainAccess(
      pedido({ authorization: `Bearer ${SEGREDO}` }),
    );
    expect(acesso).toEqual({ allowed: true, door: "cron" });
  });

  it("com o segredo certo, NAO consulta a sessao de admin", async () => {
    // O disparo do cron e a maioria esmagadora das chamadas. Duas idas ao
    // Postgres por disparo, para uma resposta que nao muda nada, e desperdicio
    // -- e pior: acopla o cron a um caminho que pode estar fora do ar.
    const isAdmin = vi.fn(async () => true);
    const acesso = await drainAccess(
      pedido({
        method: DRAIN_ENDPOINT_METHOD,
        authorization: `Bearer ${SEGREDO}`,
        isAdmin,
      }),
    );
    expect(acesso).toEqual({ allowed: true, door: "cron" });
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it("o segredo errado do mesmo tamanho nao entra", async () => {
    const acesso = await drainAccess(
      pedido({ authorization: `Bearer ${ERRADO_MESMO_TAMANHO}` }),
    );
    expect(acesso).toEqual({ allowed: false, ...DRAIN_REFUSAL });
  });

  it("o segredo errado de tamanho diferente nao entra, e nao LEVANTA", async () => {
    await expect(
      drainAccess(pedido({ authorization: `Bearer ${ERRADO_CURTO}` })),
    ).resolves.toEqual({ allowed: false, ...DRAIN_REFUSAL });
  });

  it("sem cabecalho nenhum nao entra", async () => {
    const acesso = await drainAccess(pedido({ authorization: null }));
    expect(acesso).toEqual({ allowed: false, ...DRAIN_REFUSAL });
  });

  it("CRON_SECRET ausente fecha a porta do cron, com o segredo que for", async () => {
    for (const configurado of [undefined, null, "", "   "]) {
      const acesso = await drainAccess(
        pedido({ authorization: `Bearer ${SEGREDO}`, cronSecret: configurado }),
      );
      expect(
        acesso,
        `com CRON_SECRET = ${JSON.stringify(configurado)} a porta do cron ficou ` +
          "ABERTA. Ausencia de segredo nunca pode autorizar: e assim que um " +
          "endpoint de cron nasce aberto num ambiente recem-criado.",
      ).toEqual({ allowed: false, ...DRAIN_REFUSAL });
    }
  });

  it("a sessao de admin entra, e so pelo verbo da segunda porta", async () => {
    const acesso = await drainAccess(
      pedido({ method: DRAIN_ENDPOINT_METHOD, isAdmin: async () => true }),
    );
    expect(acesso).toEqual({ allowed: true, door: "admin" });
  });

  it("a sessao de admin NAO entra por GET", async () => {
    // O estreitamento contra o `<img src="/api/email/drain">` numa pagina de
    // terceiro, que dispara GET com os cookies de quem esta logado junto. Ver o
    // docblock de DRAIN_ENDPOINT_METHOD.
    const isAdmin = vi.fn(async () => true);
    const acesso = await drainAccess(pedido({ method: "GET", isAdmin }));
    expect(acesso).toEqual({ allowed: false, ...DRAIN_REFUSAL });
    expect(
      isAdmin,
      "a sessao foi consultada num verbo que a segunda porta nao aceita. " +
        "Consultar e barrar depois gasta duas idas ao Postgres para nada.",
    ).not.toHaveBeenCalled();
  });

  it("quem nao e admin nao entra nem no verbo certo", async () => {
    const acesso = await drainAccess(
      pedido({ method: DRAIN_ENDPOINT_METHOD, isAdmin: async () => false }),
    );
    expect(acesso).toEqual({ allowed: false, ...DRAIN_REFUSAL });
  });

  it("recusa com 401, e nao com 403", async () => {
    const acesso = await drainAccess(pedido({}));
    expect(acesso.allowed).toBe(false);
    expect(acesso).toMatchObject({ status: 401 });
  });
});
