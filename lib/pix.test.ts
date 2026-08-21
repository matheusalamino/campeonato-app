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

/**
 * Percorre o BR Code como o leitor de um app faria: sobre BYTES, nao sobre
 * caracteres de JS.
 *
 * Usa `Buffer` de proposito, e nao o `TextEncoder` que o `field()` usa: se o
 * teste medisse pelo mesmo mecanismo da implementacao, os dois errariam juntos.
 */
function campos(payload: string): { id: string; declara: number; valor: string }[] {
  const buf = Buffer.from(payload, "utf8");
  const out: { id: string; declara: number; valor: string }[] = [];
  let i = 0;
  while (i < buf.length) {
    const id = buf.subarray(i, i + 2).toString("ascii");
    const declara = Number(buf.subarray(i + 2, i + 4).toString("ascii"));
    const valor = buf.subarray(i + 4, i + 4 + declara).toString("utf8");
    out.push({ id, declara, valor });
    i += 4 + declara;
  }
  // Se algum tamanho declarado estiver errado, a leitura sai de sincronia e o
  // ultimo passo nao termina exatamente no fim do buffer.
  if (i !== buf.length) throw new Error(`leitura dessincronizada: parou em ${i} de ${buf.length}`);
  return out;
}

describe("o tamanho declarado em cada campo", () => {
  // O acento e o caso que separa os dois jeitos de contar: "ç" e "ã" ocupam um
  // caractere de JS e dois bytes em UTF-8. Contando caracteres, o cabecalho de
  // tamanho mente, o leitor le a menos, e o resto do payload desanda.
  const COM_ACENTO = {
    key: "a@b.com",
    merchantName: "Joao Anção",
    merchantCity: "São Paulo",
    description: "Inscrição",
    txid: "T1",
  };

  it("conta bytes UTF-8, e nao caracteres de JS", () => {
    const lidos = campos(buildPixPayload(COM_ACENTO));
    // Sentinela: uma lista vazia passaria o forEach sem conferir nada.
    expect(lidos.length).toBeGreaterThan(0);
    for (const c of lidos) {
      expect({ campo: c.id, declara: c.declara }).toEqual({
        campo: c.id,
        declara: Buffer.byteLength(c.valor, "utf8"),
      });
    }
  });

  it("o payload acentuado ainda termina no CRC, sem sobra nem falta", () => {
    const lidos = campos(buildPixPayload(COM_ACENTO));
    expect(lidos[lidos.length - 1].id).toBe("63");
  });

  it("o nome acentuado chega inteiro ao campo 59", () => {
    const lidos = campos(buildPixPayload(COM_ACENTO));
    expect(lidos.find((c) => c.id === "59")?.valor).toBe("Joao Anção");
    expect(lidos.find((c) => c.id === "60")?.valor).toBe("São Paulo");
  });

  it("os payloads de referencia, que sao ASCII, continuam intactos", () => {
    // Rede de seguranca: em ASCII byte e caractere sao a mesma coisa, entao a
    // mudanca nao pode mexer em nada do que ja funcionava.
    for (const p of [COM_VALOR, SEM_VALOR]) {
      const lidos = campos(p);
      expect(lidos[lidos.length - 1].id).toBe("63");
    }
  });
});

describe("makePixTxid", () => {
  it("gera identificador dentro do limite do padrao", async () => {
    const { makePixTxid } = await import("./pix");
    const txid = makePixTxid();
    expect(txid.length).toBeGreaterThan(0);
    expect(txid.length).toBeLessThanOrEqual(25);
  });

  it("usa apenas caracteres aceitos no campo txid", async () => {
    const { makePixTxid } = await import("./pix");
    for (let i = 0; i < 50; i++) expect(makePixTxid()).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("nao repete entre inscricoes", async () => {
    const { makePixTxid } = await import("./pix");
    const gerados = new Set(Array.from({ length: 200 }, () => makePixTxid()));
    expect(gerados.size).toBe(200);
  });
});
