import { describe, it, expect } from "vitest";
import { EMAIL_KINDS } from "./kinds";
import { registrationIdFrom, type OutboxRow } from "./outbox";
import { OUTBOX_DEDUPE_TARGET, waitlistPromotedRow } from "./promotion";

const REG = "11111111-2222-4333-8444-555555555555";

describe("waitlistPromotedRow", () => {
  it("usa o id da inscricao como dedupe_key", () => {
    // O par (kind, dedupe_key) e UNIQUE, e e a `dedupe_key` que amarra o aviso
    // a UMA inscricao. Trocar o campo por qualquer outra string continua
    // typechecando -- todos sao `string`.
    expect(waitlistPromotedRow(REG).dedupe_key).toBe(REG);
  });

  it("pede o kind da promocao, e nao o de outro e-mail", () => {
    const linha = waitlistPromotedRow(REG);

    expect(linha.kind).toBe("waitlist_promoted");
    // Rede contra o kind escrito com typo: a coluna e `text` sem CHECK de
    // valor (migration 20260823010000), entao o banco aceita qualquer palavra,
    // e um `waitlist_promotd` entraria calado e nunca seria drenado -- o dreno
    // recusa o que `isEmailKind` nao reconhece.
    expect(EMAIL_KINDS).toContain(linha.kind);
  });

  it("leva o IDENTIFICADOR no payload, e o dreno consegue le-lo de volta", () => {
    // A ponta a ponta barata: o payload que esta funcao monta tem de ser
    // exatamente o que `registrationIdFrom` sabe ler. Com a chave escrita
    // `registrationId` (camelCase) em vez de `registration_id`, o INSERT
    // funciona, a linha entra, e o dreno nao acha inscricao nenhuma -- adia a
    // linha para sempre, sem erro em lugar nenhum.
    const linha = waitlistPromotedRow(REG);
    const doDreno: OutboxRow = {
      id: "qualquer",
      kind: linha.kind,
      dedupeKey: linha.dedupe_key,
      payload: linha.payload,
      attempts: 0,
    };

    expect(registrationIdFrom(doDreno)).toBe(REG);
  });

  it("nao carrega texto pronto: o payload so tem o identificador", () => {
    // Mesmo contrato do gatilho irmao. Nome ou campeonato congelados aqui
    // sairiam errados num reenvio depois de a organizacao corrigir o cadastro.
    expect(Object.keys(waitlistPromotedRow(REG).payload)).toEqual(["registration_id"]);
  });

  it("nao inventa status, tentativa nem instante", () => {
    // Os DEFAULTs da tabela sao quem decide `status`, `attempts` e
    // `next_attempt_at`. Uma linha nascendo com `status: "sent"` daqui entraria
    // na fila ja marcada como enviada, e o aviso nunca sairia.
    expect(Object.keys(waitlistPromotedRow(REG)).sort()).toEqual([
      "dedupe_key",
      "kind",
      "payload",
    ]);
  });

  it("recusa id vazio ou so espaco, em vez de gravar dedupe_key em branco", () => {
    // `dedupe_key` e NOT NULL, e NOT NULL nao recusa "". Duas promocoes com id
    // em branco casariam uma na outra: UM aviso para duas pessoas.
    for (const vazio of ["", "   ", "\n", "\t"]) {
      expect(() => waitlistPromotedRow(vazio)).toThrow(/registrationId vazio/);
    }
  });

  it("apara o id antes de usa-lo como chave", () => {
    // `" x "` e `"x"` sao chaves DIFERENTES para o indice unico -- duas linhas,
    // dois e-mails para a mesma pessoa.
    expect(waitlistPromotedRow(` ${REG} `).dedupe_key).toBe(REG);
    expect(waitlistPromotedRow(` ${REG} `).payload).toEqual({ registration_id: REG });
  });
});

describe("OUTBOX_DEDUPE_TARGET", () => {
  it("nomeia as DUAS colunas do indice unico", () => {
    // ── A ASSERTIVA QUE ESTA CONSTANTE EXISTE PARA TER ──
    //
    // O indice e `email_outbox_kind_dedupe ON (kind, dedupe_key)`. Com o alvo
    // do `ON CONFLICT` em `dedupe_key` sozinho, o aviso de promocao passaria a
    // conflitar com o COMPROVANTE da mesma inscricao -- que ja usa aquela
    // chave -- e o `DO NOTHING` engoliria o INSERT sem erro nenhum: a pessoa
    // seria promovida e nunca receberia o aviso, com a chamada devolvendo
    // sucesso.
    //
    // Nao ha typecheck sobre esta string; ela e opcao de cliente do Supabase.
    const colunas = OUTBOX_DEDUPE_TARGET.split(",").map((c) => c.trim());

    expect(colunas).toEqual(["kind", "dedupe_key"]);
  });

  it("nao leva espaco, que o PostgREST mandaria cru na query string", () => {
    expect(OUTBOX_DEDUPE_TARGET).not.toMatch(/\s/);
  });
});
