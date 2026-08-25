import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_KINDS } from "./kinds";
import { hashToken } from "./verification-token";
import {
  canIssueVerificationToken,
  isVerificationStatus,
  kindNeedsVerificationLink,
  verificationCopy,
  verificationLinkFor,
  verificationOutcome,
  verificationLookupPlan,
  verificationTokenColumns,
  VERIFICATION_STATUSES,
  VERIFY_EMAIL_RPC,
  VERIFY_EMAIL_PATH,
  type VerificationOutcome,
} from "./verification";

/** Os quatro estados, por extenso. Derivar a lista do proprio modulo faria a
 *  varredura de baixo concordar com qualquer mudanca. */
const ESTADOS = ["verified", "already", "unknown", "error"] as const;

describe("verificationOutcome", () => {
  it("traduz os tres status que a funcao do banco devolve", () => {
    expect(verificationOutcome({ ok: true, status: "verified" })).toEqual({ state: "verified" });
    expect(verificationOutcome({ ok: true, status: "already" })).toEqual({ state: "already" });
    expect(verificationOutcome({ ok: true, status: "unknown" })).toEqual({ state: "unknown" });
  });

  it("consulta que falhou vira `error`, e NUNCA `unknown`", () => {
    // ── A CICATRIZ DO A4, PELO LADO DELA ──
    //
    // La, `reserveSlot` dobrava qualquer falha em `not_found` e a tela dizia
    // "as vagas se esgotaram" para quem tinha vaga. Aqui a metade correspondente
    // e esta: consulta quebrada nao pode virar "este link nao vale mais", porque
    // isso manda a pessoa procurar um comprovante novo que nao vai resolver
    // nada, e some com o defeito.
    const r = verificationOutcome({ ok: false, message: "connection refused" });
    expect(r).toEqual({ state: "error" });
    expect(r.state).not.toBe("unknown");
  });

  it("token que nao casa vira `unknown`, e NUNCA `error`", () => {
    // A outra metade, e a que a tela mais vai mostrar: reemitir o token mata o
    // link anterior, entao "link velho" e o caso NORMAL -- nao e defeito de
    // ninguem, e chamar de erro faria a pessoa achar que o sistema quebrou.
    const r = verificationOutcome({ ok: true, status: "unknown" });
    expect(r).toEqual({ state: "unknown" });
    expect(r.state).not.toBe("error");
  });

  it("status que este codigo nao conhece vira `error`", () => {
    // Desencontro entre o SQL e o TypeScript e defeito NOSSO, e nao link velho.
    // Se virasse `unknown`, uma funcao do banco reescrita com outros nomes
    // deixaria toda verificacao dizendo "este link nao vale mais" -- e a tela
    // ficaria verde-mentirosa para sempre.
    for (const cru of ["", "ok", "VERIFIED", "verified ", "nao_encontrado", "null"]) {
      expect(verificationOutcome({ ok: true, status: cru }).state, `status cru: ${cru}`).toBe(
        "error",
      );
    }
  });

  it("os tres status declarados sao exatamente os que a traducao aceita", () => {
    // Prende a lista contra o `isVerificationStatus`: um status acrescentado a
    // constante sem `case` no switch deixa `tsc --noEmit` vermelho (o `never`),
    // e um `case` sem entrada na constante cai aqui.
    expect([...VERIFICATION_STATUSES]).toEqual(["verified", "already", "unknown"]);
    for (const s of VERIFICATION_STATUSES) {
      expect(isVerificationStatus(s)).toBe(true);
      expect(verificationOutcome({ ok: true, status: s }).state).not.toBe("error");
    }
    expect(isVerificationStatus("outro")).toBe(false);
    expect(isVerificationStatus(null)).toBe(false);
    expect(isVerificationStatus(1)).toBe(false);
  });
});

describe("verificationLookupPlan", () => {
  const TOKEN = "ab".repeat(32);

  it("manda o HASH para o banco, nunca o valor em claro", () => {
    // ── A ASSERTIVA QUE SE PAGA, E O QUE ELA CUSTOU PARA EXISTIR ──
    //
    // Esta decisao morava em `app/(public)/verify-email/[token]/actions.ts`.
    // MEDIDO: trocar `hashToken(token)` por `token` no argumento da RPC passava
    // os CINCO portoes -- 873 testes, 21 do contrato, `tsc` em zero, os dois
    // scripts de banco --, porque `app/**` nao esta no `include` de nenhum
    // deles.
    //
    // O dano e duplo. Funcional: o hash gravado nunca casa com o claro, entao
    // TODO link responde "este link nao vale mais". E de sigilo: argumento de
    // funcao aparece em `log_statement` e em `pg_stat_statements`, e um token em
    // claro num desses e um link valido esperando ser lido -- exatamente o que o
    // cabecalho da migration 20260824010000 diz estar evitando.
    const plano = verificationLookupPlan(TOKEN);

    expect(plano.lookup).toBe(true);
    if (!plano.lookup) return;

    expect(plano.args.p_token_hash).toBe(hashToken(TOKEN));
    // As tres afirmacoes que separam "e o hash" de "e alguma string":
    expect(plano.args.p_token_hash).not.toBe(TOKEN);
    expect(plano.args.p_token_hash).not.toContain(TOKEN);
    expect(plano.args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nomeia o argumento como a funcao do banco o espera", () => {
    // O nome saiu da rota e veio para ca justamente para ter esta assertiva.
    // Errado, o PostgREST recusa a chamada e a tela responde `error` a todo
    // mundo -- e nada em `app/**` veria.
    const plano = verificationLookupPlan(TOKEN);
    expect(plano.lookup).toBe(true);
    if (!plano.lookup) return;
    expect(Object.keys(plano.args)).toEqual(["p_token_hash"]);
    expect(VERIFY_EMAIL_RPC).toBe("verify_registration_email");
  });

  it("token sem forma nao vira consulta, e vira `unknown` -- nunca `error`", () => {
    // Link truncado, segmento vazio, colagem que perdeu o fim. Nenhum deles e
    // defeito NOSSO, entao nenhum pode aparecer como falha do sistema. E nenhum
    // chega ao banco: a forma e conferida antes de existir hash.
    for (const cru of ["", "   ", "abc", "z".repeat(64), "A".repeat(64), null, undefined]) {
      const plano = verificationLookupPlan(cru);
      expect(plano.lookup, `deveria recusar: ${String(cru)}`).toBe(false);
      if (plano.lookup) continue;
      expect(plano.outcome).toEqual({ state: "unknown" });
    }
  });
});

describe("verificationCopy", () => {
  const copias = ESTADOS.map((state) => ({
    state,
    copy: verificationCopy({ state } as VerificationOutcome),
  }));

  it("todo estado tem titulo, emoji e pelo menos um paragrafo", () => {
    for (const { state, copy } of copias) {
      expect(copy.titulo.trim(), `titulo vazio em ${state}`).not.toBe("");
      expect(copy.emoji.trim(), `emoji vazio em ${state}`).not.toBe("");
      expect(copy.paragrafos.length, `sem paragrafo em ${state}`).toBeGreaterThan(0);
      for (const p of copy.paragrafos) {
        expect(p.trim(), `paragrafo vazio em ${state}`).not.toBe("");
      }
    }
  });

  it("nenhum estado repete o texto de outro", () => {
    // Quatro estados com o mesmo texto e o mesmo defeito do A4 por outro
    // caminho: a tela deixaria de distinguir o que o veredito distinguiu.
    const titulos = copias.map(({ copy }) => copy.titulo);
    expect(new Set(titulos).size).toBe(ESTADOS.length);

    const corpos = copias.map(({ copy }) => copy.paragrafos.join("\n"));
    expect(new Set(corpos).size).toBe(ESTADOS.length);
  });

  it("`already` NAO soa como erro", () => {
    // Clicar duas vezes no mesmo link e o comportamento mais comum que existe.
    // Tratar isso como falha ensina a pessoa a duvidar de uma coisa que deu
    // certo.
    const { titulo, paragrafos } = verificationCopy({ state: "already" });
    const tudo = `${titulo}\n${paragrafos.join("\n")}`.toLowerCase();

    for (const palavra of ["erro", "falha", "inválido", "invalido", "não vale", "problema"]) {
      expect(tudo, `"already" usou "${palavra}", que soa como falha`).not.toContain(palavra);
    }
  });

  it("`unknown` diz que o link nao vale E aponta a saida", () => {
    // Sem a saida, "este link nao vale mais" e um beco: a pessoa nao tem como
    // saber que o comprovante mais recente traz link novo.
    const { titulo, paragrafos } = verificationCopy({ state: "unknown" });
    const tudo = `${titulo}\n${paragrafos.join("\n")}`.toLowerCase();

    expect(tudo).toContain("não vale mais");
    expect(tudo).toMatch(/comprovante mais recente|link novo|caixa de entrada/);
    // E nao pode culpar quem clicou nem se anunciar como defeito do sistema.
    expect(tudo).not.toContain("erro");
  });

  it("`error` nao culpa a pessoa", () => {
    const { titulo, paragrafos } = verificationCopy({ state: "error" });
    const tudo = `${titulo}\n${paragrafos.join("\n")}`.toLowerCase();

    for (const palavra of ["você errou", "voce errou", "inválido", "invalido", "incorreto"]) {
      expect(tudo, `"error" culpou a pessoa com "${palavra}"`).not.toContain(palavra);
    }
    // E precisa dizer o que fazer agora.
    expect(tudo).toMatch(/tente de novo|tentar de novo/);
  });

  it("nenhum estado ameaca a inscricao", () => {
    // A verificacao NAO bloqueia ninguem (decisao do usuario em 2026-08-23).
    // Um texto que desse a entender que a inscricao esta em risco seria falso, e
    // e justamente o tipo de frase que faz gente ligar para a organizacao.
    for (const { state, copy } of copias) {
      const tudo = `${copy.titulo}\n${copy.paragrafos.join("\n")}`.toLowerCase();
      for (const frase of ["inscrição cancelada", "perdeu a vaga", "inscrição inválida"]) {
        expect(tudo, `${state} ameacou a inscricao com "${frase}"`).not.toContain(frase);
      }
    }
  });

  it("os dois estados que nao confirmam nada dizem que a inscricao segue", () => {
    // `unknown` e `error` sao os que chegam a quem clicou e nao viu confirmacao
    // nenhuma -- e e ai que a pessoa supoe o pior. Os outros dois nao precisam
    // da frase: eles ja terminaram bem.
    for (const state of ["unknown", "error"] as const) {
      const { paragrafos } = verificationCopy({ state });
      expect(paragrafos.join(" ").toLowerCase(), `${state} nao tranquiliza`).toContain(
        "sua inscrição continua",
      );
    }
  });
});

describe("canIssueVerificationToken", () => {
  const pendente = { contact_email: "jogador@exemplo.test", email_verified_at: null };

  it("emite quando ha endereco e ele ainda nao foi provado", () => {
    expect(canIssueVerificationToken(pendente)).toBe(true);
  });

  it("nao emite para inscricao que nao existe", () => {
    expect(canIssueVerificationToken(null)).toBe(false);
  });

  it("nao emite sem endereco de contato", () => {
    // Inscricao criada pelo admin nasce assim nesta edicao: `contact_email` so e
    // preenchida pelo caminho publico.
    expect(canIssueVerificationToken({ ...pendente, contact_email: null })).toBe(false);
    expect(canIssueVerificationToken({ ...pendente, contact_email: "" })).toBe(false);
    expect(canIssueVerificationToken({ ...pendente, contact_email: "   " })).toBe(false);
  });

  it("nao emite quando o endereco JA foi provado", () => {
    // Nao ha o que pedir. O comprovante sai sem o bloco do link.
    expect(
      canIssueVerificationToken({ ...pendente, email_verified_at: "2026-08-24T12:00:00Z" }),
    ).toBe(false);
    // E o campo que manda e o do CARIMBO, nao o do endereco: com os dois
    // preenchidos, quem decide e `email_verified_at`.
    expect(
      canIssueVerificationToken({
        contact_email: "outro@exemplo.test",
        email_verified_at: "2020-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("verificationTokenColumns", () => {
  it("grava o hash, e SO o hash", () => {
    // O invariante: emitir token nao verifica nada. Um `email_verified_at` que
    // vazasse para este objeto marcaria como provada toda inscricao que
    // recebesse um comprovante -- sem clique nenhum, e sem nada acender.
    const colunas = verificationTokenColumns("h4sh");

    expect(colunas).toEqual({ email_verification_token_hash: "h4sh" });
    expect(Object.keys(colunas)).toEqual(["email_verification_token_hash"]);
    expect(colunas).not.toHaveProperty("email_verified_at");
    expect(colunas).not.toHaveProperty("contact_email");
  });
});

describe("verificationLinkFor", () => {
  const TOKEN = "a".repeat(64);

  it("monta o link sobre a base recebida, com o token no CAMINHO", () => {
    expect(verificationLinkFor("https://campeonato.exemplo", TOKEN)).toBe(
      `https://campeonato.exemplo/verify-email/${TOKEN}`,
    );
  });

  it("nao duplica a barra quando a base ja termina em uma", () => {
    // `siteUrlFrom` devolve `origin`, que nao tem barra final -- mas esta funcao
    // tambem e chamada com bases escritas a mao em teste, e `//` num caminho de
    // e-mail e link quebrado que ninguem revisa.
    expect(verificationLinkFor("https://campeonato.exemplo/", TOKEN)).toBe(
      `https://campeonato.exemplo/verify-email/${TOKEN}`,
    );
  });

  it("a rota que o link aponta EXISTE no app", () => {
    // ── A JUNTA QUE NENHUM TIPO COBRE ──
    //
    // `VERIFY_EMAIL_PATH` e uma string; o nome da pasta em `app/` e um nome de
    // pasta. Nada no TypeScript liga os dois: renomear a pasta deixa
    // `npx tsc --noEmit` em ZERO e faz todo comprovante ja enviado -- os que
    // estao na caixa das pessoas, fora do alcance de qualquer conserto --
    // apontar para um 404.
    //
    // A assertiva monta o caminho a partir da CONSTANTE, e nao o escreve de
    // novo: escrito de novo, ela concordaria com a constante mudada.
    const pasta = join(process.cwd(), "app", "(public)", VERIFY_EMAIL_PATH, "[token]");

    expect(
      existsSync(join(pasta, "page.tsx")),
      `Nao achei ${pasta}/page.tsx. O link do comprovante aponta para ` +
        `/${VERIFY_EMAIL_PATH}/<token>, e a rota que responde por ele sumiu ou ` +
        "foi renomeada -- os comprovantes ja enviados nao tem conserto.",
    ).toBe(true);
    expect(existsSync(join(pasta, "actions.ts"))).toBe(true);
  });

  it("o caminho e o combinado, em ingles", () => {
    // Rota em ingles, como toda rota deste repo (UI e comentario em PT-BR).
    expect(VERIFY_EMAIL_PATH).toBe("verify-email");
  });
});

describe("kindNeedsVerificationLink", () => {
  it("so o comprovante pede token", () => {
    // O aviso de inscricao nova vai para a ORGANIZACAO. Um link ali provaria a
    // posse da caixa errada, e ainda gastaria um token -- matando o link que o
    // jogador recebeu.
    const comLink = EMAIL_KINDS.filter(kindNeedsVerificationLink);
    expect(comLink).toEqual(["registration_committed"]);
  });
});
