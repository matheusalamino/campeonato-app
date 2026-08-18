import { describe, it, expect } from "vitest";
import { crc16, buildPixPayload } from "./pix";

// Payloads reais gerados pelo Mercado Pago, usados como referencia: se o CRC
// bate com o deles, a montagem inteira esta correta.
const RECEBEDOR = {
  key: "wellmmer@outlook.com",
  merchantName: "Wellmmer Lucas de Olivei",
  merchantCity: "Sao Paulo",
};

const COM_VALOR =
  "00020126660014br.gov.bcb.pix0120wellmmer@outlook.com0220Inscricao - CMS 20265204000053039865406100.005802BR5924Wellmmer Lucas de Olivei6009Sao Paulo62230519daqr1387376352330806304FB9D";

const SEM_VALOR =
  "00020126710014br.gov.bcb.pix0120wellmmer@outlook.com0225Inscricao - CMS 2026 + AD5204000053039865802BR5924Wellmmer Lucas de Olivei6009Sao Paulo62230519daqr1387376354585586304BAE8";

describe("crc16", () => {
  it("reproduz o CRC dos payloads de referencia", () => {
    expect(crc16(COM_VALOR.slice(0, -4))).toBe("FB9D");
    expect(crc16(SEM_VALOR.slice(0, -4))).toBe("BAE8");
  });
});

describe("buildPixPayload", () => {
  it("reproduz byte a byte o payload com valor definido", () => {
    expect(
      buildPixPayload({
        ...RECEBEDOR,
        description: "Inscricao - CMS 2026",
        amount: 100,
        txid: "daqr138737635233080",
      }),
    ).toBe(COM_VALOR);
  });

  it("reproduz byte a byte o payload sem valor", () => {
    expect(
      buildPixPayload({
        ...RECEBEDOR,
        description: "Inscricao - CMS 2026 + AD",
        txid: "daqr138737635458558",
      }),
    ).toBe(SEM_VALOR);
  });

  it("formata o valor com duas casas, como o padrao exige", () => {
    const p = buildPixPayload({ ...RECEBEDOR, description: "X", amount: 137.5, txid: "T1" });
    expect(p).toContain("5406137.50");
  });

  it("omite o campo de valor quando nao ha valor a cobrar", () => {
    const p = buildPixPayload({ ...RECEBEDOR, description: "X", txid: "T1" });
    expect(p).not.toContain("5406");
    expect(p).toContain("53039865802BR");
  });

  it("respeita os limites de tamanho de nome e cidade", () => {
    const p = buildPixPayload({
      key: "a@b.com",
      merchantName: "Nome Muito Longo Que Ultrapassa O Limite",
      merchantCity: "Cidade Com Nome Enorme Demais",
      description: "X",
      txid: "T1",
    });
    expect(p).toContain("5925Nome Muito Longo Que Ultr");
    expect(p).toContain("6015Cidade Com Nome");
  });

  it("usa *** como txid quando nao ha identificador", () => {
    expect(buildPixPayload({ ...RECEBEDOR, description: "X" })).toContain("62070503***");
  });
});
