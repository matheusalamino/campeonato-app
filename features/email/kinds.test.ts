import { describe, it, expect } from "vitest";
import { EMAIL_KINDS, isBulkKind, isEmailKind, isOrganizerKind } from "./kinds";

describe("isBulkKind", () => {
  it("trata os lembretes como envio em massa", () => {
    expect(isBulkKind("reminder_payment_pending")).toBe(true);
    expect(isBulkKind("reminder_waitlist")).toBe(true);
    expect(isBulkKind("reminder_not_registered")).toBe(true);
  });

  it("nunca trata o transacional como massa", () => {
    // Suprimir transacional por opt-out e pior que spam: a pessoa pediu o
    // comprovante ao se inscrever, e sem ele nao tem prova nenhuma.
    expect(isBulkKind("registration_committed")).toBe(false);
    expect(isBulkKind("payment_verified")).toBe(false);
    expect(isBulkKind("waitlist_promoted")).toBe(false);
    expect(isBulkKind("organizer_new_registration")).toBe(false);
  });

  it("classifica TODO kind declarado", () => {
    // Prende a lista: kind novo sem classificacao explicita reprova aqui, em
    // vez de virar massa ou transacional por acidente.
    //
    // MEDIDO, para quem duvidar de que isto discrimina: acrescentando um oitavo
    // nome a EMAIL_KINDS sem o `case` correspondente, o `default` devolve a
    // propria string (o `never` nao existe em tempo de execucao) e o `typeof`
    // aqui le "string". Vermelho. O `tsc` tambem reprova, mas o vitest nao
    // typecheca -- e por isso esta assertiva existe alem do compilador.
    for (const k of EMAIL_KINDS) expect(typeof isBulkKind(k)).toBe("boolean");
    expect(EMAIL_KINDS.length).toBe(7);
  });
});

describe("isEmailKind", () => {
  it("aceita o que esta declarado e recusa o resto", () => {
    // O `kind` chega do banco como texto solto: a coluna e `text`, sem CHECK de
    // valor. Quem drena a fila precisa de um portao antes de classificar, ou um
    // `kind` desconhecido cairia no `default` do switch e sairia de la como
    // string onde o tipo promete boolean.
    expect(isEmailKind("registration_committed")).toBe(true);
    expect(isEmailKind("reminder_waitlist")).toBe(true);
    expect(isEmailKind("test_outbox_alpha")).toBe(false);
    expect(isEmailKind("")).toBe(false);
    expect(isEmailKind("REGISTRATION_COMMITTED")).toBe(false);
  });
});

describe("isOrganizerKind", () => {
  it("so o aviso da organizacao vai para a organizacao", () => {
    // A troca que esta assertiva impede: o aviso interno de inscricao nova
    // chegando na caixa do proprio inscrito, ou o comprovante dele indo parar
    // no ORGANIZER_EMAIL. Nenhum dos dois quebra portao nenhum -- os dois sao
    // envio bem sucedido para o endereco errado.
    expect(isOrganizerKind("organizer_new_registration")).toBe(true);
    expect(isOrganizerKind("registration_committed")).toBe(false);
    expect(isOrganizerKind("payment_verified")).toBe(false);
    expect(isOrganizerKind("waitlist_promoted")).toBe(false);
    expect(isOrganizerKind("reminder_payment_pending")).toBe(false);
    expect(isOrganizerKind("reminder_waitlist")).toBe(false);
    expect(isOrganizerKind("reminder_not_registered")).toBe(false);
  });

  it("classifica TODO kind declarado", () => {
    for (const k of EMAIL_KINDS) expect(typeof isOrganizerKind(k)).toBe("boolean");
  });
});

describe("os dois kinds que a inscricao enfileira hoje", () => {
  it("estao declarados", () => {
    // Prende os dois nomes ao gatilho `enqueue_registration_emails`, na
    // migration 20260823030000. Sao os UNICOS `kind` que alguem escreve na fila
    // na data deste arquivo -- os outros cinco sao vocabulario declarado antes
    // de existir quem os produza, e nenhum codigo deste repo os enfileira.
    //
    // Renomear um dos dois de um lado so nao quebra nada visivel: o dreno
    // recusaria a linha por `kind` desconhecido e o e-mail simplesmente nao
    // sairia. Os dois nomes aparecem juntos em `EMAIL_KINDS` e nos `switch` de
    // kinds.ts, mas esta e a unica assertiva que os prende ao gatilho -- em
    // nenhum outro lugar fora do SQL eles sao lidos como "o par que a inscricao
    // enfileira".
    expect(EMAIL_KINDS).toContain("registration_committed");
    expect(EMAIL_KINDS).toContain("organizer_new_registration");
  });
});
