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
    verificationLink: null,
    ...over,
  };
}

/**
 * Um link RECONHECIVEL, e nao um derivado de `siteUrl`.
 *
 * Se ele fosse `https://campeonato.exemplo/verify-email/...`, a assertiva do
 * repasse ficaria verde com o campo errado: `renderEmail` recebe `siteUrl` no
 * mesmo input, e os dois sao `string`. O host diferente e o que separa "passou o
 * link" de "passou qualquer coisa que comeca com https".
 */
const LINK = "https://outro-host.exemplo/verify-email/" + "f".repeat(64);

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

  it("monta corpo para EXATAMENTE estes quatro kinds", () => {
    // POR EXTENSO, e nao derivado de nada. E a assertiva que se paga, e ela JA
    // SE PAGOU DUAS VEZES: escrita na T5 declarando DOIS, ficou vermelha na T7
    // quando `payment_verified` ganhou template, e vermelha de novo na T8
    // quando `waitlist_promoted` ganhou o seu. Nas duas ela obrigou quem
    // acrescentou o template a vir aqui atualizar a lista CONSCIENTEMENTE. Isso
    // e o desenho, e nao um incomodo -- template novo que ninguem declarou aqui
    // e template que passou sem revisao de texto.
    //
    // Quem chegar com o quinto: acrescente o nome ABAIXO e conte a mesma
    // historia neste comentario. Nao troque a lista literal por algo derivado
    // de `EMAIL_KINDS` nem por uma contagem -- derivar e o que faz a assertiva
    // parar de perguntar alguma coisa.
    //
    // A ORDEM tambem e prova: `EMAIL_KINDS.filter` preserva a ordem da
    // declaracao, entao esta lista afirma QUAIS e em que posicao. Os tres que
    // sobram (os lembretes) sao os tres ultimos de `EMAIL_KINDS`.
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

    expect(comCorpo).toEqual([
      "registration_committed",
      "organizer_new_registration",
      "payment_verified",
      "waitlist_promoted",
    ]);
  });

  it("adia o comprovante quando nao sabe de quem e a inscricao", () => {
    // Sem resumo, o corpo inteiro faltaria: nome, campeonato e situacao saem
    // todos dele. Null ADIA a linha (ver `no_body` em drainOutbox), e a fila
    // crescendo e visivel -- um comprovante generico nao seria.
    expect(renderEmail(entrada("registration_committed", { summary: null }))).toBeNull();
    expect(renderEmail(entrada("organizer_new_registration", { summary: null }))).toBeNull();
    expect(renderEmail(entrada("payment_verified", { summary: null }))).toBeNull();
    expect(renderEmail(entrada("waitlist_promoted", { summary: null }))).toBeNull();
  });

  it("o comprovante leva o link de verificacao que RECEBEU", () => {
    // ── ESTA ASSERTIVA SUBSTITUI A DA T5, E O PORQUE IMPORTA ──
    //
    // Ate a T5b nao havia token, e aqui morava a declaracao inversa: "HOJE o
    // comprovante sai SEM link", com o aviso de que ficaria vermelha quando a T6
    // entrasse. Entrou, e ficou. Ela nao foi apagada -- foi TROCADA pelo par de
    // hoje: este caso e o de baixo.
    //
    // O que ela prende e o REPASSE, e nao o texto: `renderEmail` copia
    // `verificationLink` do input para os dados do template, e trocar o campo
    // por `null` -- ou por `siteUrl`, que esta no mesmo input e tambem e string
    // -- nao tem sintoma de tipo nenhum. As assertivas de
    // `registration-committed.test.ts` nao alcancam isso: elas recebem os dados
    // ja montados e nao sabem de onde vieram.
    const m = renderEmail(entrada("registration_committed", { verificationLink: LINK }));

    expect(m).not.toBeNull();
    // Nos DOIS corpos: quem le em cliente sem HTML tambem precisa do link, e por
    // isso ele sai por extenso (ver `Paragrafo` em templates/body.ts).
    expect(m?.html).toContain(`href="${LINK}"`);
    expect(m?.text).toContain(LINK);
    // E o link tem de ser O QUE VEIO, e nao a base do site: `siteUrl` chega no
    // mesmo input, com o mesmo tipo.
    expect(m?.html).not.toContain('href="https://campeonato.exemplo"');
  });

  it("sem link, o comprovante sai inteiro e sem convite orfao", () => {
    // Os tres casos em que o link e nulo -- ja verificada, sem `contact_email`,
    // linha sem `registration_id` -- chegam aqui iguais. O comprovante continua
    // valendo; o que nao pode e sobrar um convite a clicar em nada.
    const m = renderEmail(entrada("registration_committed", { verificationLink: null }));

    expect(m).not.toBeNull();
    expect(m?.html).not.toMatch(/verify-email/);
    expect(m?.text).not.toMatch(/verify-email/);
    expect(m?.html).not.toMatch(/href=/i);
  });

  it("o aviso da organizacao NAO leva link, nem quando recebe um", () => {
    // O aviso vai para a caixa da ORGANIZACAO. Um link de verificacao ali
    // provaria a posse da caixa errada -- e o token gasto seria o do jogador.
    // A guarda de verdade e `kindNeedsVerificationLink`, no dreno; esta e a
    // rede do outro lado, para o template nunca aprender a usar o campo.
    const m = renderEmail(entrada("organizer_new_registration", { verificationLink: LINK }));

    expect(m).not.toBeNull();
    expect(m?.html).not.toContain(LINK);
    expect(m?.text).not.toContain(LINK);
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

  it("o aviso de promocao NAO leva link, nem quando recebe um", () => {
    // ── A DECISAO ESCRITA, DO LADO DO DRENO ──
    //
    // `kindNeedsVerificationLink` devolve true SO para
    // `registration_committed`, entao na pratica este `kind` nunca chega com
    // link. Esta assertiva e a rede do OUTRO lado: se um dia alguem
    // acrescentar `waitlist_promoted` la sem pensar, o template continua nao
    // usando o campo -- e o vermelho aparece aqui, e nao na caixa de entrada
    // de alguem.
    //
    // O motivo de nao levar: a emissao de token SORTEIA e REGRAVA o hash (ver
    // `issueVerificationToken` em services/email-outbox.ts), entao emitir um
    // aqui invalidaria o link que a pessoa recebeu no comprovante e talvez
    // ainda nao tenha usado. O comprovante e o convite natural.
    const m = renderEmail(entrada("waitlist_promoted", { verificationLink: LINK }));

    expect(m).not.toBeNull();
    expect(m?.html).not.toContain(LINK);
    expect(m?.text).not.toContain(LINK);
    expect(m?.html).not.toMatch(/href=/i);
  });

  it("poe cada campo do resumo no campo certo dos QUATRO templates", () => {
    // ── A JUNTA QUE ESTA ASSERTIVA EXISTE PARA PRENDER ──
    //
    // `renderEmail` copia o resumo para os dados do template campo a campo, e
    // `playerName` e `championshipName` sao os dois `string | null`. Trocar um
    // pelo outro NAO tem sintoma de tipo: MEDIDO, todos os portoes ficavam
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

    // O terceiro template corre EXATAMENTE o mesmo risco, e por isso entrou
    // nesta assertiva em vez de ganhar uma propria: `paymentVerifiedEmail`
    // recebe os mesmos dois `string | null`, e troca-los tambem nao tem sintoma
    // de tipo -- o aviso passaria a cumprimentar a pessoa pelo nome do
    // campeonato.
    const conferido = renderEmail(entrada("payment_verified", { summary: resumo }));
    expect(conferido?.text).toContain("Olá, NomeDoJogador!");
    expect(conferido?.subject).toContain("— NomeDoCampeonato");
    expect(conferido?.text).not.toContain("Olá, NomeDoCampeonato");
    expect(conferido?.subject).not.toContain("— NomeDoJogador");

    // E o quarto, pelo mesmo motivo: `waitlistPromotedEmail` recebe os mesmos
    // dois `string | null`, e troca-los nao tem sintoma de tipo nenhum -- o
    // aviso passaria a cumprimentar a pessoa pelo nome do campeonato.
    const promovido = renderEmail(entrada("waitlist_promoted", { summary: resumo }));
    expect(promovido?.text).toContain("Olá, NomeDoJogador!");
    expect(promovido?.subject).toContain("— NomeDoCampeonato");
    expect(promovido?.text).not.toContain("Olá, NomeDoCampeonato");
    expect(promovido?.subject).not.toContain("— NomeDoJogador");
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
