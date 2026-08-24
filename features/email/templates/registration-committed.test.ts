import { describe, it, expect } from "vitest";
import {
  registrationCommittedEmail,
  type RegistrationCommittedData,
} from "./registration-committed";

/**
 * O COMPROVANTE: o e-mail que a pessoa recebe depois de se inscrever.
 *
 * ── POR QUE AS ASSERTIVAS OLHAM OS TRES CORPOS ──
 *
 * Um e-mail tem tres textos -- assunto, HTML e texto puro -- e nenhum portao
 * deste repo compara os tres entre si. Escrever o ramo da lista de espera so no
 * HTML e deixar o texto puro dizendo "vaga confirmada" nao quebra `tsc`, nao
 * quebra a suite do dreno, e chega ao leitor que usa cliente sem HTML como uma
 * mentira. Por isso ha uma assertiva SO para a coerencia entre html e text
 * (`a mesma historia nos dois corpos`), separada das que checam conteudo.
 *
 * ── POR QUE `semMarcacao`, E NAO O HTML CRU, NOS BURACOS ──
 *
 * A assertiva de "sem nome, nao imprime buraco" procura pontuacao orfa --
 * `Ola , ` e `Ola, !`. Rodando sobre o HTML cru ela ficaria presa a FORMATACAO:
 * indentar a marcacao introduz espacos que nao sao buraco nenhum, e a assertiva
 * ficaria vermelha por reindentacao. MEDIDO: com o teste procurando `/\s\s/` no
 * HTML cru, uma reindentacao (mutacao que NAO muda comportamento) reprovava.
 * Assertiva que reprova formatacao e falso vermelho, e falso vermelho e o que
 * mata uma rede -- a proxima pessoa a desliga.
 *
 * A troca de "null"/"undefined", essa sim, roda no corpo CRU: a marcacao pode
 * esconder o furo dentro de um atributo (`href="null"`), e tirar as tags
 * apagaria justamente a prova.
 */

const COM_NOME: RegistrationCommittedData = {
  playerName: "Fulano de Tal",
  championshipName: "Copa Teste",
  isWaitlist: false,
  verificationLink: null,
};

/** O link que a T6 vai passar. Um parametro so, sem `&`: a montagem escapa o
 *  HTML, e um `&` viraria `&amp;` no href -- correto, mas nao literal. */
const LINK = "https://campeonato.exemplo/verify-email?token=abc123";

/** A frase que so existe quando ha link. Sem link ela nao pode sobrar. */
const CONVITE = /confirme seu e-mail/i;

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

describe("registrationCommittedEmail", () => {
  it("trata o jogador pelo nome, no HTML e no texto", () => {
    const m = registrationCommittedEmail(COM_NOME);

    expect(m.html).toContain("Fulano de Tal");
    expect(m.text).toContain("Fulano de Tal");
  });

  it("sem nome, nao imprime buraco", () => {
    // O jeito preguicoso de calar o TypeScript aqui e `playerName ?? ""`, e ele
    // produz `Ola, !` -- saudacao a ninguem, com a virgula pendurada. O tipo
    // permite nulo porque `championship_registrations.player_id` e NULLABLE
    // (medido em `\d championship_registrations`), entao o join pode voltar
    // vazio de verdade.
    const m = registrationCommittedEmail({ ...COM_NOME, playerName: null });

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/null|undefined/);
    }
    for (const corpo of corpos(m)) {
      const lido = semMarcacao(corpo);
      // Buraco a esquerda: `Ola {nome},` com o nome vazio vira `Ola ,`.
      expect(lido).not.toMatch(/\s[,;:!?.]/);
      // Buraco a direita: `Ola, {nome}!` com o nome vazio vira `Ola, !`.
      expect(lido).not.toMatch(/[,;:]\s*[!?.]/);
    }

    // ── A LARGURA, que a leitura sem marcacao sozinha nao da ──
    //
    // `semMarcacao` colapsa `\s+` ANTES de olhar, entao um `?? ""` no MEIO de
    // uma frase -- "a organizacao de ⎵⎵e ela confere" -- nao encosta em
    // pontuacao nenhuma e escapa dos dois padroes acima. MEDIDO: passava os 806
    // testes.
    //
    // Estes dois olham o corpo CRU, e por isso ficam fora do `html`: la a
    // indentacao da marcacao produz espaco duplo legitimo, e uma reindentacao
    // (que nao muda comportamento) reprovaria. `subject` e `text` nao tem
    // marcacao nenhuma, entao neles espaco duplo so pode ser buraco.
    expect(m.subject).not.toMatch(/ {2}/);
    expect(m.text).not.toMatch(/ {2}/);
  });

  it("leva o link de verificacao no HTML e no texto, quando ha link", () => {
    const m = registrationCommittedEmail({ ...COM_NOME, verificationLink: LINK });

    expect(m.html).toContain(LINK);
    expect(m.text).toContain(LINK);
    expect(m.html).toMatch(CONVITE);
    expect(m.text).toMatch(CONVITE);
  });

  it("sem link, nao sobra bloco orfao", () => {
    // Na data deste arquivo e SEMPRE este o caso: o token nasce na T6, e
    // `render.ts` passa `null`. Um bloco que saia assim mesmo manda a pessoa
    // clicar em `href="null"`.
    const m = registrationCommittedEmail({ ...COM_NOME, verificationLink: null });

    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/verify-email/);
      expect(corpo).not.toMatch(CONVITE);
      // Nao ha OUTRO link no comprovante hoje. Procurar `href=` inteiro, e nao
      // `href="null"`, e o que sobrevive a troca de aspas simples por duplas.
      expect(corpo).not.toMatch(/href=/i);
    }
  });

  it("diz que a vaga esta garantida quando nao e lista de espera", () => {
    // Assunto e texto puro, e nao o HTML: a coerencia entre os dois corpos e
    // trabalho da assertiva DE BAIXO, e misturar as duas faria uma mutacao so
    // no HTML acender tres vermelhos em vez de um.
    const m = registrationCommittedEmail({ ...COM_NOME, isWaitlist: false });

    expect(m.subject).toMatch(/Inscrição confirmada/);
    expect(m.text).toMatch(/inscrição está confirmada/i);
    expect(m.subject).not.toMatch(/lista de espera/i);
    expect(m.text).not.toMatch(/lista de espera/i);
  });

  it("diz lista de espera quando e lista de espera", () => {
    const m = registrationCommittedEmail({ ...COM_NOME, isWaitlist: true });

    expect(m.subject).toMatch(/lista de espera/i);
    expect(m.text).toMatch(/lista de espera/i);
    expect(m.subject).not.toMatch(/confirmada/i);
    expect(m.text).not.toMatch(/inscrição está confirmada/i);
  });

  it("conta a mesma historia nos dois corpos", () => {
    // A assertiva que se paga: html e text sao montados a partir da MESMA
    // lista de paragrafos, e nada no `tsc` obriga isso. O dia em que alguem
    // acrescentar uma frase so no HTML, esta linha acende -- e nenhuma outra.
    for (const isWaitlist of [false, true]) {
      const m = registrationCommittedEmail({ ...COM_NOME, isWaitlist });
      expect(/lista de espera/i.test(m.html)).toBe(/lista de espera/i.test(m.text));
      expect(/inscrição está confirmada/i.test(m.html)).toBe(
        /inscrição está confirmada/i.test(m.text),
      );
    }
  });

  it("nao deixa placeholder por preencher", () => {
    const casos: RegistrationCommittedData[] = [
      COM_NOME,
      { ...COM_NOME, isWaitlist: true },
      { ...COM_NOME, playerName: null, championshipName: null },
      { ...COM_NOME, verificationLink: LINK },
    ];

    for (const caso of casos) {
      for (const corpo of corpos(registrationCommittedEmail(caso))) {
        expect(corpo).not.toContain("{{");
        expect(corpo).not.toContain("}}");
        expect(corpo).not.toContain("undefined");
        expect(corpo).not.toContain("[nome]");
      }
    }
  });

  // ── Alem dos oito da tarefa ────────────────────────────────────────────────

  it("sem nome do campeonato, o assunto nao fica com o travessao pendurado", () => {
    // `championship_registrations.championship_id` tambem e NULLABLE, e o
    // assunto e o unico corpo onde o nome do campeonato entra sozinho: com
    // `?? ""` ele viraria `Inscrição confirmada — `.
    const m = registrationCommittedEmail({ ...COM_NOME, championshipName: null });

    expect(m.subject).toBe("Inscrição confirmada");
    for (const corpo of corpos(m)) {
      expect(corpo).not.toMatch(/—\s*$/);
      expect(corpo).not.toMatch(/null|undefined/);
    }
  });

  it("escapa o que veio do formulario antes de por no HTML", () => {
    // `playerName` vem de `players.name` e `championships.name` -- os dois sao
    // texto digitado por alguem. Interpolar cru num corpo HTML e injecao de
    // marcacao no e-mail de outra pessoa.
    const m = registrationCommittedEmail({
      ...COM_NOME,
      playerName: "<b>Fulano</b> & cia",
    });

    expect(m.html).not.toContain("<b>Fulano</b>");
    expect(m.html).toContain("&lt;b&gt;Fulano&lt;/b&gt; &amp; cia");
    // O texto puro nao e marcacao: la o nome sai como a pessoa escreveu.
    expect(m.text).toContain("<b>Fulano</b> & cia");
  });
});
