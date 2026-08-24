import { describe, it, expect } from "vitest";
import { EMAIL_KINDS, type EmailKind } from "./kinds";
import type { OutboxRow, Recipient, RegistrationSummary } from "./outbox";
import { renderEmail, type RenderInput } from "./render";

/**
 * A EXAUSTIVIDADE que morde em tempo de EXECUCAO.
 *
 * O `const exhaustive: never = kind` do fim do switch de render.ts e rede de
 * COMPILACAO, e o vitest nao typecheca -- roda o modulo transpilado, sem
 * checagem de tipo. Em tempo de execucao aquele `default` devolve a PROPRIA
 * STRING, e um `EmailMessage` que na verdade e `"payment_verified"` seguiria
 * adiante ate o Brevo.
 *
 * Mesmo padrao que `features/email/kinds.test.ts` ja usa para `isBulkKind`.
 */

const RESUMO: RegistrationSummary = {
  contactEmail: "jogador@exemplo.test",
  playerEmail: "velho@exemplo.test",
  playerName: "Fulano de Tal",
  championshipName: "Copa Teste",
  isWaitlist: false,
  preferredPosition: "ATA",
};

const DESTINO: Recipient = { email: "jogador@exemplo.test", name: "Fulano de Tal" };

function linha(kind: EmailKind): OutboxRow {
  return { id: "row-1", kind, dedupeKey: "reg-1", payload: { registration_id: "reg-1" }, attempts: 0 };
}

function entrada(kind: EmailKind, over: Partial<RenderInput> = {}): RenderInput {
  return {
    kind,
    row: linha(kind),
    recipient: DESTINO,
    siteUrl: "https://campeonato.exemplo",
    summary: RESUMO,
    ...over,
  };
}

describe("renderEmail", () => {
  it("devolve mensagem ou null para TODO kind declarado, e nunca string", () => {
    // `typeof null` e "object", entao esta assertiva aceita os dois resultados
    // legitimos e recusa exatamente um: a string que o `default` devolveria se
    // um `case` sumisse. E ela que separa "kind sem template" de "kind sem
    // case".
    for (const kind of EMAIL_KINDS) {
      const m = renderEmail(entrada(kind));
      expect(typeof m, `renderEmail("${kind}") devolveu ${typeof m}`).toBe("object");
      if (m !== null) {
        expect(typeof m.subject).toBe("string");
        expect(typeof m.html).toBe("string");
        expect(typeof m.text).toBe("string");
        expect(m.to).toBe(DESTINO.email);
      }
    }
  });

  it("monta corpo para EXATAMENTE estes dois kinds", () => {
    // POR EXTENSO, e nao derivado de nada. E a assertiva que se paga: quando a
    // T7 acrescentar `payment_verified`, ela fica VERMELHA e obriga quem
    // escrever a T7 a atualizar esta declaracao CONSCIENTEMENTE. Isso e o
    // desenho, e nao um incomodo -- template novo que ninguem declarou aqui e
    // template que passou sem revisao de texto.
    //
    // ── POR QUE `typeof === "object"`, E NAO `!== null` ──
    //
    // MEDIDO: com o filtro em `!== null`, remover o `case
    // "organizer_new_registration"` de render.ts deixava esta assertiva VERDE.
    // O `default` devolve a PROPRIA STRING (`"organizer_new_registration"`), que
    // nao e null, entao o kind continuava contado como "tem corpo" e a lista
    // saia identica. A assertiva so pegava template ACRESCENTADO, e nao `case`
    // REMOVIDO -- metade do trabalho que ela existe para fazer.
    const comCorpo = EMAIL_KINDS.filter((kind) => {
      const m = renderEmail(entrada(kind));
      return typeof m === "object" && m !== null;
    });

    expect(comCorpo).toEqual(["registration_committed", "organizer_new_registration"]);
  });

  it("adia o comprovante quando nao sabe de quem e a inscricao", () => {
    // Sem resumo, o corpo inteiro faltaria: nome, campeonato e situacao saem
    // todos dele. Null ADIA a linha (ver `no_body` em drainOutbox), e a fila
    // crescendo e visivel -- um comprovante generico nao seria.
    expect(renderEmail(entrada("registration_committed", { summary: null }))).toBeNull();
    expect(renderEmail(entrada("organizer_new_registration", { summary: null }))).toBeNull();
  });

  it("HOJE o comprovante sai SEM link de verificacao", () => {
    // O token nasce na T6. Ate la `render.ts` passa `verificationLink: null`, e
    // esta assertiva DECLARA isso em vez de deixar implicito.
    //
    // Ela fica vermelha no dia em que a T6 entrar -- de proposito. Quem
    // escrever a T6 troca esta assertiva pela inversa (o corpo PRECISA levar o
    // link), e ai o par de assertivas do template
    // (`registration-committed.test.ts`, casos com e sem link) ja garante os
    // dois lados.
    const m = renderEmail(entrada("registration_committed"));

    expect(m).not.toBeNull();
    expect(m?.html).not.toMatch(/verify-email/);
    expect(m?.text).not.toMatch(/verify-email/);
    expect(m?.html).not.toMatch(/href=/i);
  });

  it("leva o nome do destinatario adiante, e nao o inventa", () => {
    // `toName` chega ao Brevo como o nome da caixa. O aviso da organizacao vai
    // para um `Recipient` sem nome (`recipientFor` devolve `name: null` para os
    // organizer_*), e `undefined` e o que faz `createBrevoSender` cair no
    // proprio endereco -- `to: [{ email, name: msg.toName ?? msg.to }]`.
    const comNome = renderEmail(entrada("registration_committed"));
    expect(comNome?.toName).toBe("Fulano de Tal");

    const semNome = renderEmail(
      entrada("organizer_new_registration", {
        recipient: { email: "org@exemplo.test", name: null },
      }),
    );
    expect(semNome?.toName).toBeUndefined();
    expect(semNome?.to).toBe("org@exemplo.test");
  });

  it("o aviso da organizacao leva a posicao pelo rotulo", () => {
    // A costura entre o resumo e o template: `preferredPosition` sai da coluna
    // como codigo e tem de chegar ao corpo como palavra. Assertiva aqui, e nao
    // so no template, porque o que ela prende e o REPASSE do campo -- passar
    // `null` no lugar dele deixaria o teste do template verde.
    const m = renderEmail(
      entrada("organizer_new_registration", {
        summary: { ...RESUMO, preferredPosition: "GOL" },
      }),
    );

    expect(m?.text).toContain("Goleiro");
    expect(m?.text).not.toMatch(/\bGOL\b/);
  });

  it("poe cada campo do resumo no campo certo dos DOIS templates", () => {
    // ── A JUNTA QUE ESTA ASSERTIVA EXISTE PARA PRENDER ──
    //
    // `renderEmail` copia o resumo para os dados do template campo a campo, e
    // `playerName` e `championshipName` sao os dois `string | null`. Trocar um
    // pelo outro NAO tem sintoma de tipo: MEDIDO, os quatro portoes ficavam
    // verdes nos DOIS templates, e o comprovante passava a cumprimentar a
    // pessoa pelo nome do campeonato -- "Olá, Copa Alamino 2026!" -- e a por o
    // nome dela no assunto como se fosse o campeonato.
    //
    // As assertivas dos templates nao alcancam isto: elas recebem os dados ja
    // montados e nao tem como saber de onde cada um veio. A prova precisa de
    // valores DISTINTOS e reconheciveis, e de olhar o lugar onde cada um
    // aparece.
    const resumo = {
      ...RESUMO,
      playerName: "NomeDoJogador",
      championshipName: "NomeDoCampeonato",
      preferredPosition: "ZAG",
    };

    const comprovante = renderEmail(entrada("registration_committed", { summary: resumo }));
    // A saudacao leva a PESSOA; o assunto leva o CAMPEONATO depois do travessao.
    expect(comprovante?.text).toContain("Olá, NomeDoJogador!");
    expect(comprovante?.subject).toContain("— NomeDoCampeonato");
    expect(comprovante?.text).not.toContain("Olá, NomeDoCampeonato");

    const aviso = renderEmail(entrada("organizer_new_registration", { summary: resumo }));
    // Quem "acabou de se inscrever" e a PESSOA, nunca o campeonato.
    expect(aviso?.text).toContain("NomeDoJogador acabou de se inscrever.");
    expect(aviso?.subject).toContain("Nova inscrição: NomeDoJogador");
    expect(aviso?.subject).toContain("— NomeDoCampeonato");
    expect(aviso?.text).not.toContain("NomeDoCampeonato acabou de se inscrever");
    // E a posicao vem do campo da posicao, e nao de outro `string | null`.
    expect(aviso?.text).toContain("Zagueiro");
  });

  it("o comprovante repassa a lista de espera do resumo", () => {
    // Mesmo motivo do de cima: o template ja tem as duas variantes provadas, e
    // o que falta e a garantia de que o dreno passa o campo CERTO.
    const espera = renderEmail(
      entrada("registration_committed", { summary: { ...RESUMO, isWaitlist: true } }),
    );
    const principal = renderEmail(entrada("registration_committed"));

    expect(espera?.subject).toMatch(/lista de espera/i);
    expect(principal?.subject).not.toMatch(/lista de espera/i);
  });
});
