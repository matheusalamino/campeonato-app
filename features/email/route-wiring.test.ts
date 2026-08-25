import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";
import { VERIFY_EMAIL_PATH } from "./verification";

/**
 * A rota de verificacao, lida como TEXTO -- porque nao ha outro jeito de le-la.
 *
 * ── O BURACO QUE ESTE ARQUIVO FECHA, MEDIDO ──
 *
 * `app/**` nao esta no `include` de `vitest.config.ts` (que so alcanca `lib/**`,
 * `features/**` e `scripts/**`), nenhum glob deste repo alcanca `.test.tsx`, e
 * nao ha job de teste no CI -- `.github/workflows` so tem `migrate.yml`. Isso
 * fazia da pasta `app/(public)/verify-email/[token]/` territorio de ZERO
 * discriminacao: ate um no-op plantado la ficava verde, o que e outra forma de
 * dizer que os portoes nao viam nada.
 *
 * TRES mutacoes reais passaram pelos CINCO portoes inteiros com a logica ainda
 * escrita naqueles arquivos:
 *
 *  1. `p_token_hash: token` no lugar de `p_token_hash: hashToken(token)` -- todo
 *     link do mundo passa a responder "este link nao vale mais", E o valor em
 *     claro passa a viajar como argumento de funcao, que e o que aparece em
 *     `log_statement` e em `pg_stat_statements`;
 *  2. a pagina montando o texto de `verified` sem olhar o veredito -- "E-mail
 *     confirmado" para todo mundo, inclusive para quem nao verificou nada;
 *  3. `unknown` dobrado em `error` na saida da rota -- a cicatriz do A4 de
 *     volta, pela porta que a uniao `VerificationOutcome` existe para fechar.
 *
 * ── POR QUE A RESPOSTA FOI MOVER, E NAO SO ASSEVERAR ──
 *
 * Assertiva de texto tem teto: ela prende que um nome esta escrito, nunca que a
 * funcao certa roda. As mutacoes 1 e 3 estao FECHADAS por construcao -- o hash,
 * o nome do argumento e o veredito mudaram de casa para
 * `features/email/verification.ts`, onde ha teste de COMPORTAMENTO. Este arquivo
 * cuida do que sobrou: que a delegacao continue existindo, e que os literais que
 * saíram nao voltem.
 *
 * As negativas carregam o peso, e e deliberado. Uma positiva ("o token
 * `verificationOutcome` aparece") e satisfeita por um decoy homonimo local; uma
 * negativa ("`state:` NAO aparece neste arquivo") so e satisfeita por quem de
 * fato nao escreveu a decisao aqui.
 */

const RAIZ = join(process.cwd(), "app", "(public)", VERIFY_EMAIL_PATH, "[token]");
const CAMINHO_ACTIONS = join(RAIZ, "actions.ts");
const CAMINHO_PAGE = join(RAIZ, "page.tsx");

const actions = semComentario(readFileSync(CAMINHO_ACTIONS, "utf8"));
const page = semComentario(readFileSync(CAMINHO_PAGE, "utf8"));

describe("app/(public)/verify-email/[token]/actions.ts", () => {
  it("delega o plano e o veredito a features/", () => {
    expect(actions).toMatch(/verificationLookupPlan\(/);
    expect(actions).toMatch(/verificationOutcome\(/);
    expect(actions).toMatch(/VERIFY_EMAIL_RPC/);
  });

  it("entrega a RPC o argumento que veio PRONTO do plano", () => {
    // A costura exata. Sem ela, `plano.args` poderia ser importado, ignorado, e
    // o argumento remontado a mao logo abaixo -- que e a mutacao 1 com um passo
    // a mais.
    expect(actions).toMatch(/\.rpc\(\s*VERIFY_EMAIL_RPC\s*,\s*plano\.args\s*\)/);
  });

  it("nao remonta o argumento da RPC nem calcula hash nenhum", () => {
    // ── A NEGATIVA QUE FECHA A MUTACAO 1 ──
    //
    // O nome do argumento e a chamada do hash moraram aqui, e e por isso que a
    // troca por `token` era escrevivel. Fora daqui, escreve-la de novo exige
    // reintroduzir um destes literais -- e ai esta assertiva acende.
    for (const literal of [
      "p_token_hash",
      "hashToken(",
      "verificationTokenFrom(",
      "createHash",
      "randomBytes",
      "sha256",
    ]) {
      expect(
        actions,
        `actions.ts voltou a escrever \`${literal}\`. A escolha entre o token em ` +
          "CLARO e o HASH mora em `verificationLookupPlan` " +
          "(features/email/verification.ts), onde ha teste: `app/**` nao e " +
          "varrido por include nenhum deste repo, e a troca por texto puro " +
          "passou pelos CINCO portoes quando ela morava aqui.",
      ).not.toContain(literal);
    }
  });

  it("nao escreve veredito nenhum a mao", () => {
    // ── A NEGATIVA QUE FECHA A MUTACAO 3 ──
    //
    // Todo `VerificationOutcome` que sai daqui vem de `verificationOutcome`,
    // inclusive o do `catch`. Um `{ state: "error" }` escrito a mao no catch
    // parece inofensivo e e a porta: com um literal ja aceito no arquivo, dobrar
    // `unknown` em `error` uma linha adiante deixa de destoar.
    expect(
      actions,
      "actions.ts voltou a escrever um literal de estado. O veredito -- e o " +
        "`unknown` que NAO pode virar `error` -- e `verificationOutcome`, em " +
        "features/email/verification.ts.",
    ).not.toMatch(/state\s*:/);
  });

  it("continua fora do alcance do bundle de cliente", () => {
    // `import "server-only"` e o que quebra o BUILD se este modulo for
    // importado por componente de cliente -- que e por onde a chave
    // `service_role` de `createAdminClient()` vazaria.
    expect(actions).toMatch(/import\s+"server-only"/);
    // E `"use server"` continua FORA: ele publicaria cada export como endpoint
    // HTTP, abrindo uma segunda porta para a mesma mutacao sem ninguem usa-la.
    expect(actions).not.toMatch(/["']use server["']/);
  });
});

describe("app/(public)/verify-email/[token]/page.tsx", () => {
  it("monta o texto A PARTIR do veredito daquele token", () => {
    // ── A COSTURA QUE FECHA A MUTACAO 2 ──
    //
    // Para a tela mentir, esta composicao precisa ser quebrada: ou o resultado
    // de `verifyEmailByToken` deixa de alimentar `verificationCopy`, ou o
    // argumento vira outra coisa. Os dois acendem aqui.
    expect(page).toMatch(
      /verificationCopy\(\s*await\s+verifyEmailByToken\(\s*token\s*\)\s*\)/,
    );
  });

  it("nao carrega texto de tela nem veredito escrito a mao", () => {
    // O texto inteiro mora em `verificationCopy`, onde ha assertiva sobre o que
    // ele nao pode dizer -- que `already` nao soe como erro, que `unknown` ofereca
    // saida, que nenhum estado ameace a inscricao. Uma frase escrita aqui nasce
    // sem nenhuma dessas.
    expect(page).not.toMatch(/state\s*:/);
    for (const frase of [
      "E-mail confirmado",
      "já tinha confirmado",
      "não vale mais",
      "Não conseguimos confirmar",
    ]) {
      expect(
        page,
        `page.tsx escreveu "${frase}" a mao. O texto dos quatro estados e ` +
          "`verificationCopy`, em features/email/verification.ts.",
      ).not.toContain(frase);
    }
  });

  it("nao imprime o token na tela", () => {
    // Denylist, e assumida como tal: ela pega as duas formas que alguem
    // escreveria sem pensar, e nao fecha a familia. O que fecha e a pagina nao
    // ter motivo para exibi-lo -- o token e credencial de uso unico, e uma tela
    // que o mostra convida a captura de tela e a colagem em conversa.
    expect(page).not.toContain("{token}");
    expect(page).not.toContain("{params.token}");
  });

  it("nunca e servida de cache", () => {
    // Abrir esta pagina GRAVA no banco. Uma resposta cacheada faria a segunda
    // visita mostrar o estado da primeira sem consultar nada e, pior, poderia
    // servir a pagina de um token para outro.
    expect(page).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  });

  it("fica fora do indice dos buscadores", () => {
    // A URL carrega um token de uso unico. Indexada, ela vira link de
    // verificacao publico -- e o rastreador que a visitasse consumiria a
    // verificacao de alguem.
    expect(page).toMatch(/robots\s*:\s*\{[^}]*index\s*:\s*false/);
  });
});
