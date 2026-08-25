import { describe, it, expect } from "vitest";
import { waitlistPromotedEmail, type WaitlistPromotedData } from "./waitlist-promoted";

/**
 * O AVISO de promocao da lista de espera.
 *
 * ── AS NEGATIVAS SAO A METADE QUE SE PAGA ──
 *
 * Este template tem UM ramo so, entao as assertivas de conteudo positivo sao
 * quase tautologicas: elas conferem que a string escrita no arquivo saiu no
 * corpo. O que de fato prende alguma coisa sao as PROIBICOES -- ordem de fila,
 * prazo, motivo da vaga, etapa inventada --, porque elas continuam valendo
 * quando alguem reescrever as frases, que e o momento em que o defeito entra.
 *
 * ── E A PROIBICAO DE "VAGA" NAO VALE AQUI ──
 *
 * `payment-verified.test.ts` proibe a palavra, porque aquele texto vai igual
 * para quem ainda espera. Aqui a vaga e a NOTICIA. Nao ha rede alheia sendo
 * afrouxada: aquela denylist so exercita `paymentVerifiedEmail`, e nenhuma
 * assertiva deste repo le os templates como texto.
 */

const DADOS: WaitlistPromotedData = {
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

describe("waitlistPromotedEmail", () => {
  it("trata o jogador pelo nome, no HTML e no texto", () => {
    const m = waitlistPromotedEmail(DADOS);

    expect(m.html).toContain("Fulano de Tal");
    expect(m.text).toContain("Fulano de Tal");
  });

  it("sem nome, nao imprime buraco", () => {
    // O jeito preguicoso de calar o TypeScript e `playerName ?? ""`, e ele
    // produz `Olá, !` -- saudacao a ninguem, com a virgula pendurada.
    const m = waitlistPromotedEmail({ ...DADOS, playerName: null });

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toContain("Olá!");
      expect(corpo).not.toMatch(/Olá,\s*!/);
      expect(corpo).not.toMatch(/Olá\s+,/);
    }
  });

  it("sem campeonato, o assunto nao fica com travessao pendurado", () => {
    // `championship_id` e NULLABLE, e o assunto e o unico lugar onde o nome do
    // campeonato entra sozinho: com `?? ""` viraria `Você tem vaga no
    // campeonato — `.
    const m = waitlistPromotedEmail({ ...DADOS, championshipName: null });

    expect(m.subject).toBe("Você tem vaga no campeonato");
    expect(m.subject).not.toMatch(/—\s*$/);
  });

  it("o assunto leva o campeonato depois do travessao", () => {
    expect(waitlistPromotedEmail(DADOS).subject).toBe(
      "Você tem vaga no campeonato — Copa Teste",
    );
  });

  it("diz O QUE MUDOU: saiu da espera e tem vaga", () => {
    // As duas metades, e nao so uma. "Você tem vaga" sem dizer que ela saiu da
    // espera deixa a pessoa sem saber se este e-mail e novidade ou repeticao do
    // comprovante que ela ja tem.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toMatch(/saiu da lista de espera/i);
      expect(corpo).toMatch(/\bvaga\b/i);
    }
  });

  it("diz que a inscricao de antes continua valendo", () => {
    // O medo obvio de quem estava na espera e ter de comecar de novo. Sem esta
    // frase, o e-mail avisa da vaga e deixa a duvida no lugar.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of [semMarcacao(m.html), m.text]) {
      expect(corpo).toMatch(/inscrição continua/i);
      expect(corpo).toMatch(/não precisa se inscrever de novo/i);
    }
  });

  it("conta a mesma historia nos dois corpos", () => {
    // Html e text montados separadamente divergem no primeiro conserto que
    // entre so num dos lados. Quem os monta juntos e `corpoDe`; esta assertiva
    // prende o resultado.
    const m = waitlistPromotedEmail(DADOS);

    expect(semMarcacao(m.html)).toBe(m.text.replace(/\s+/g, " ").trim());
  });

  it("nao promete PRAZO nenhum", () => {
    // "Em breve", "nos proximos dias", "ate sexta" -- nenhuma delas tem quem as
    // cumpra neste repo. Mesma lista do aviso de pagamento conferido.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/em breve|nos próximos dias|dentro de \d|até \w+-feira|prazo/i);
    }
  });

  it("nao promete ORDEM DE FILA nem POSICAO", () => {
    // ── A PROIBICAO MAIS CARA DESTE ARQUIVO ──
    //
    // A regra do A6b: jogador de linha sobe pela ordem da espera, MAS se quem
    // desiste e goleiro, o goleiro da espera assume INDEPENDENTEMENTE da ordem
    // dele. A posicao ganha da ordem, e so nesse caso.
    //
    // Entao "chegou a sua vez na fila" nasce falsa para o goleiro que subiu na
    // frente de gente que esperava ha mais tempo -- e este template nem recebe
    // a posicao para poder distinguir os dois. A frase certa e a que nao fala
    // de ordem nenhuma.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/ordem da (lista|fila)|sua vez|posição na (lista|fila)/i);
      expect(corpo).not.toMatch(/próxim[oa] da (lista|fila)|primeir[oa] da (lista|fila)/i);
      expect(corpo).not.toMatch(/por ordem de|na sua vez|era a sua vez/i);
    }
  });

  it("nao diz POR QUE abriu a vaga", () => {
    // "Alguem desistiu" e informacao de OUTRA pessoa, e esta caixa de entrada
    // nao e o lugar dela. E o repo nem sabe: nao ha conceito de desistencia
    // aqui -- `championship_registrations` tem `is_waitlist` e mais nada que
    // registre saida.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/desist|cancel|abriu mão|liberou a vaga|deixou o campeonato/i);
      expect(corpo).not.toMatch(/outr[oa] (jogador|pessoa|inscrit)/i);
    }
  });

  it("nao inventa etapa que nao existe", () => {
    // Nao ha confirmacao a dar, nem formulario a refazer, nem prazo para
    // aceitar a vaga. Nada disso existe no repo, e um e-mail que peca isso
    // manda a pessoa procurar uma tela que nao ha.
    const m = waitlistPromotedEmail(DADOS);

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/confirme sua (vaga|presença|participação)/i);
      expect(corpo).not.toMatch(/responda (este|esse) e-?mail|clique (aqui|no link)/i);
      expect(corpo).not.toMatch(/preencha|refaça|acesse o (link|site|formulário)/i);
    }
  });

  it("nao leva link nenhum: nao ha o que clicar aqui", () => {
    // ── A DECISAO, ESCRITA ──
    //
    // `kindNeedsVerificationLink` devolve true SO para
    // `registration_committed`, e `waitlist_promoted` NAO entrou la. Emitir
    // token aqui invalidaria o link que a pessoa ja recebeu no comprovante e
    // talvez ainda nao tenha usado -- a emissao sorteia e REGRAVA o hash. O
    // comprovante e o convite natural; este e-mail nao tem o que provar.
    //
    // Ha a assertiva espelho em render.test.ts, sobre o dreno nao passar o
    // campo nem quando tem um.
    const m = waitlistPromotedEmail(DADOS);

    expect(m.html).not.toMatch(/href=/i);
    expect(m.text).not.toMatch(/https?:\/\//i);
  });

  it("nao vaza null nem undefined em corpo nenhum", () => {
    // No corpo CRU, e nao no `semMarcacao`: a marcacao pode esconder o furo
    // dentro de um atributo, e tirar as tags apagaria justamente a prova.
    const m = waitlistPromotedEmail({ playerName: null, championshipName: null });

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/null|undefined|NaN|\[object/i);
    }
  });

  it("escapa o que veio de texto digitado", () => {
    // `players.name` e `championships.name` sao digitados por alguem. Um nome
    // com `<` interpolado cru vira marcacao no e-mail. Quem escapa e `corpoDe`;
    // esta assertiva prende que este template passe por ele.
    const m = waitlistPromotedEmail({
      playerName: '<script>alert("x")</script>',
      championshipName: "Copa <b>",
    });

    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });
});
