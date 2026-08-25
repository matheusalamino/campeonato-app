import { describe, it, expect } from "vitest";
import { paymentVerifiedEmail, type PaymentVerifiedData } from "./payment-verified";

/**
 * O AVISO de pagamento conferido.
 *
 * ── POR QUE AS ASSERTIVAS OLHAM OS TRES CORPOS ──
 *
 * Um e-mail tem tres textos -- assunto, HTML e texto puro -- e nenhum portao
 * deste repo compara os tres entre si. Mesmo motivo, e mesma forma, das
 * assertivas de `registration-committed.test.ts`.
 *
 * ── AS NEGATIVAS SAO A METADE QUE SE PAGA ──
 *
 * Este template tem UM ramo so, entao as assertivas de conteudo positivo sao
 * quase tautologicas: elas conferem que a string escrita no arquivo saiu no
 * corpo. O que de fato prende alguma coisa sao as PROIBICOES de texto -- prazo,
 * ordem de fila, promessa de vaga --, porque elas continuam valendo quando
 * alguem reescrever as frases, que e o momento em que o defeito entra.
 *
 * A proibicao de promessa de vaga nao e preciosismo: `paymentVerifiedEmail` NAO
 * recebe `isWaitlist`, entao este mesmo texto vai para quem esta na lista de
 * espera com o pagamento conferido. "Sua vaga esta garantida" seria mentira
 * para essa pessoa, e nenhum tipo deste repo acusaria.
 */

const DADOS: PaymentVerifiedData = {
  playerName: "Fulano de Tal",
  championshipName: "Copa Teste",
};

function corpos(m: { subject: string; html: string; text: string }): string[] {
  return [m.subject, m.html, m.text];
}

/** O corpo sem tags e com os espacos colapsados -- o que uma pessoa LE. */
function semMarcacao(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("paymentVerifiedEmail", () => {
  it("trata o jogador pelo nome, no HTML e no texto", () => {
    const m = paymentVerifiedEmail(DADOS);

    expect(m.html).toContain("Fulano de Tal");
    expect(m.text).toContain("Fulano de Tal");
  });

  it("sem nome, nao imprime buraco", () => {
    // O jeito preguicoso de calar o TypeScript e `playerName ?? ""`, e ele
    // produz `Olá, !` -- saudacao a ninguem, com a virgula pendurada.
    const m = paymentVerifiedEmail({ ...DADOS, playerName: null });

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toContain("Olá!");
      expect(corpo).not.toMatch(/Olá,\s*!/);
      expect(corpo).not.toMatch(/Olá\s+,/);
    }
  });

  it("sem campeonato, o assunto nao fica com travessao pendurado", () => {
    // `championship_id` e NULLABLE, e o assunto e o unico lugar onde o nome do
    // campeonato entra sozinho: com `?? ""` viraria `Pagamento conferido — `.
    const m = paymentVerifiedEmail({ ...DADOS, championshipName: null });

    expect(m.subject).toBe("Pagamento conferido");
    expect(m.subject).not.toMatch(/—\s*$/);
  });

  it("o assunto leva o campeonato depois do travessao", () => {
    expect(paymentVerifiedEmail(DADOS).subject).toBe("Pagamento conferido — Copa Teste");
  });

  it("diz que o pagamento foi conferido, nos dois corpos", () => {
    const m = paymentVerifiedEmail(DADOS);

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toMatch(/conferiu o seu pagamento/i);
    }
  });

  it("diz o que isso significa: a inscricao esta completa", () => {
    // O e-mail que so avisa "conferimos" deixa a pessoa sem saber se ainda
    // falta alguma coisa. O par -- o fato e a consequencia -- e o conteudo.
    const m = paymentVerifiedEmail(DADOS);

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toMatch(/inscrição está completa/i);
    }
  });

  it("conta a mesma historia nos dois corpos", () => {
    // Html e text montados separadamente divergem no primeiro conserto que
    // entre so num dos lados. Quem os monta juntos e `corpoDe`; esta assertiva
    // prende o resultado.
    const m = paymentVerifiedEmail(DADOS);

    expect(semMarcacao(m.html)).toBe(m.text.replace(/\s+/g, " ").trim());
  });

  it("nao promete PRAZO nenhum", () => {
    // "Em breve", "nos proximos dias", "ate sexta" -- nenhuma delas tem quem
    // as cumpra neste repo.
    const m = paymentVerifiedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/em breve|nos próximos dias|dentro de \d|até \w+-feira|prazo/i);
    }
  });

  it("nao promete ORDEM DE FILA nem POSICAO", () => {
    // A regra do goleiro do A6b inverte a ordem da lista de espera, e o A6b nem
    // existe. Qualquer frase sobre "sua vez" nasceria falsa.
    const m = paymentVerifiedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/ordem da (lista|fila)|sua vez|posição na (lista|fila)|próximo da fila/i);
    }
  });

  it("nao promete VAGA, porque este mesmo texto vai para a lista de espera", () => {
    // ── A ASSERTIVA QUE ESTE ARQUIVO EXISTE PARA TER ──
    //
    // `paymentVerifiedEmail` nao recebe `isWaitlist` -- e o dreno nao tem como
    // lhe contar. Entao a inscricao de lista de espera com pagamento conferido
    // recebe EXATAMENTE este texto. "Vaga garantida", "voce esta confirmado no
    // campeonato", "nos vemos em campo" sao todas falsas para ela, e nenhum
    // tipo deste repo acusaria a troca.
    // ── POR QUE A PROIBICAO E DA PALAVRA "VAGA", E NAO DE UMA FRASE ──
    //
    // MEDIDO: a primeira versao desta assertiva proibia
    // `/vaga (garantida|confirmada|assegurada)/i`, com as duas palavras
    // GRUDADAS. A mutacao "sua vaga está garantida" -- exatamente a promessa
    // falsa que a assertiva existe para barrar -- passou VERDE, porque um
    // "está" no meio ja despregava o padrao. Assertiva que so pega uma redacao
    // da promessa nao pega a promessa.
    //
    // Entao o que se proibe e a PALAVRA. Este e-mail nao tem como falar de vaga
    // com verdade: ele nao recebe `isWaitlist` e vai para os dois publicos.
    // Quem precisar mesmo escrever "vaga" aqui tem de passar por esta linha, e
    // e essa parada obrigatoria que a assertiva compra -- ler o docblock de
    // payment-verified.ts antes de afrouxa-la.
    const m = paymentVerifiedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/\bvagas?\b/i);
      expect(corpo).not.toMatch(/\bgarantid[oa]\b|\bassegurad[oa]\b/i);
      expect(corpo).not.toMatch(/confirmad[oa]\s+(n[oe]ste?|no)\s+campeonato/i);
      expect(corpo).not.toMatch(/nos vemos|te esperamos em campo|bom jogo/i);
    }
  });

  it("nao vaza null nem undefined em corpo nenhum", () => {
    // No corpo CRU, e nao no `semMarcacao`: a marcacao pode esconder o furo
    // dentro de um atributo, e tirar as tags apagaria justamente a prova.
    const m = paymentVerifiedEmail({ playerName: null, championshipName: null });

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/null|undefined|NaN|\[object/i);
    }
  });

  it("nao leva link nenhum: nao ha o que clicar aqui", () => {
    // Este aviso nao tem convite de verificacao -- `kindNeedsVerificationLink`
    // so devolve true para `registration_committed`, e `renderEmail` nem passa
    // o campo. Um `href` aqui seria convite a clicar em nada.
    const m = paymentVerifiedEmail(DADOS);

    expect(m.html).not.toMatch(/href=/i);
    expect(m.text).not.toMatch(/https?:\/\//i);
  });

  it("escapa o que veio de texto digitado", () => {
    // `players.name` e `championships.name` sao digitados por alguem. Um nome
    // com `<` interpolado cru vira marcacao no e-mail. Quem escapa e `corpoDe`;
    // esta assertiva prende que este template passe por ele.
    const m = paymentVerifiedEmail({
      playerName: '<script>alert("x")</script>',
      championshipName: "Copa <b>",
    });

    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});
