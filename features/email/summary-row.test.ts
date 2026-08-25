import { describe, it, expect } from "vitest";
import { summariesById, summaryFromRow, type RegistrationSummaryRow } from "./summary-row";

/**
 * A traducao coluna -> campo, que ate a revisao da T5 nao tinha rede NENHUMA.
 *
 * As tres mutacoes que motivaram esta suite, e o que cada uma quebrava, estao
 * escritas UMA VEZ, no docblock de `summary-row.ts` -- que e onde elas se
 * aplicam. Nao as repita aqui: esta narrativa ja viveu em quatro arquivos, e
 * foi copiando-a que a conta errada dos "seis metodos do store" se espalhou por
 * cinco sitios.
 *
 * O que vale registrar aqui, porque e sobre o ALCANCE destas assertivas e nao
 * sobre a funcao: as duas redes que a T5 ja tinha nao chegavam ate ela. Elas
 * provam a STRING do `select` -- que as sete colunas sao pedidas (`id`, a
 * chave, mais as seis do resumo) e que voltam preenchidas do banco. Coluna
 * PEDIDA e coluna LIDA sao coisas diferentes, e entre uma e outra ha esta
 * funcao.
 */

/** Uma linha COMPLETA e com todo campo DISTINTO dos vizinhos. A distincao e o
 *  ponto: com dois campos iguais, troca-los um pelo outro e invisivel. */
const LINHA: RegistrationSummaryRow = {
  id: "reg-1",
  is_waitlist: false,
  contact_email: "digitado-agora@exemplo.test",
  championships: { name: "Copa Teste" },
  players: {
    email: "cadastro-velho@exemplo.test",
    name: "Fulano de Tal",
    preferred_position: "ATA",
  },
};

describe("summaryFromRow", () => {
  it("poe cada coluna no seu campo", () => {
    // Assertiva de objeto INTEIRO, e nao campo a campo: assim um campo novo no
    // resumo sem traducao aqui tambem acende, em vez de passar despercebido.
    expect(summaryFromRow(LINHA)).toEqual({
      contactEmail: "digitado-agora@exemplo.test",
      playerEmail: "cadastro-velho@exemplo.test",
      playerName: "Fulano de Tal",
      championshipName: "Copa Teste",
      isWaitlist: false,
      preferredPosition: "ATA",
    });
  });

  it("nao troca o endereco digitado pelo do cadastro", () => {
    // A troca que esta assertiva impede e silenciosa e cara: `contact_email`
    // existe porque `players.email` pode estar VELHO -- a submissao publica so
    // grava identidade para CPF novo. Quem trocou de e-mail e justamente quem
    // digita o novo no formulario, e e essa pessoa que pararia de receber.
    //
    // `recipientFor` prefere `contactEmail`, e trocar os dois AQUI inverte
    // aquela preferencia sem tocar nele -- os dois campos sao `string | null` e
    // o `tsc` fica limpo.
    const resumo = summaryFromRow(LINHA);

    expect(resumo.contactEmail).toBe(LINHA.contact_email);
    expect(resumo.playerEmail).toBe(LINHA.players?.email);
    expect(resumo.contactEmail).not.toBe(resumo.playerEmail);
  });

  it("repassa a lista de espera como ela veio, nos DOIS valores", () => {
    // Um valor so nao distingue copia de negacao: `!linha.is_waitlist` acerta
    // metade dos casos por acaso. Os dois lados, e nenhum dos dois e opcional.
    expect(summaryFromRow({ ...LINHA, is_waitlist: true }).isWaitlist).toBe(true);
    expect(summaryFromRow({ ...LINHA, is_waitlist: false }).isWaitlist).toBe(false);
  });

  it("repassa a posicao CRUA, sem traduzir", () => {
    // Quem traduz e o template, com `positionLabel`. Traduzir aqui poria a
    // palavra dentro do resumo e o organizador receberia o rotulo duas vezes
    // convertido -- ou, pior, o comprovante passaria a carregar palavra de
    // posicao que ninguem pediu.
    expect(summaryFromRow({ ...LINHA, players: { ...LINHA.players!, preferred_position: "GOL" } })
      .preferredPosition).toBe("GOL");
  });

  it("sobrevive ao join vazio, sem inventar texto", () => {
    // `championship_id` e `player_id` sao NULLABLE, entao os dois aninhados
    // podem voltar nulos. `?? ""` aqui e o que produz "Olá , sua inscrição em
    // está confirmada" -- quem decide o que dizer sem o dado e o template.
    const resumo = summaryFromRow({
      id: "reg-1",
      is_waitlist: true,
      contact_email: null,
      championships: null,
      players: null,
    });

    expect(resumo).toEqual({
      contactEmail: null,
      playerEmail: null,
      playerName: null,
      championshipName: null,
      isWaitlist: true,
      preferredPosition: null,
    });
  });

  it("trata coluna AUSENTE como nula, e nao como undefined", () => {
    // O `as unknown as` do servico impoe o tipo sem conferir: se uma coluna
    // sumir do `select`, ela chega `undefined` aqui, e `undefined` vazando para
    // o resumo vira a string "undefined" dentro de um corpo de e-mail. Os
    // templates tem assertiva contra isso, mas a defesa mais barata e nao
    // deixar sair daqui.
    const capenga = { id: "reg-1", players: {}, championships: {} } as unknown as RegistrationSummaryRow;
    const resumo = summaryFromRow(capenga);

    for (const [campo, valor] of Object.entries(resumo)) {
      expect(valor, `${campo} veio undefined`).not.toBeUndefined();
    }
    expect(resumo.isWaitlist).toBe(false);
  });
});

describe("summariesById", () => {
  const outra: RegistrationSummaryRow = {
    id: "reg-b",
    is_waitlist: true,
    contact_email: "bruno@exemplo.test",
    championships: { name: "Copa B" },
    players: { email: "b@cadastro.test", name: "Bruno", preferred_position: "GOL" },
  };

  it("indexa cada resumo pelo id da SUA inscricao", () => {
    // DUAS linhas, e com conteudo distinto: com uma so, `mapa.set(ids[0], ...)`
    // e indistinguivel de `mapa.set(linha.id, ...)`. MEDIDO -- essa troca
    // passava todos os portoes de entao, e mandava a todo mundo o resumo da primeira
    // inscricao do lote.
    const mapa = summariesById([LINHA, outra]);

    expect([...mapa.keys()]).toEqual(["reg-1", "reg-b"]);
    expect(mapa.get("reg-1")?.playerName).toBe("Fulano de Tal");
    expect(mapa.get("reg-b")?.playerName).toBe("Bruno");
    expect(mapa.get("reg-1")?.isWaitlist).toBe(false);
    expect(mapa.get("reg-b")?.isWaitlist).toBe(true);
  });

  it("devolve mapa vazio para lote vazio", () => {
    expect(summariesById([]).size).toBe(0);
  });
});
