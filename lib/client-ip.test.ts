import { describe, it, expect } from "vitest";
import { clientIpFrom } from "./client-ip";

/** Simula `headers()` do Next a partir de um mapa simples. */
function headers(map: Record<string, string>) {
  return (name: string) => map[name] ?? null;
}

describe("clientIpFrom", () => {
  it("ignora o elemento mais a esquerda, que o cliente controla", () => {
    // O atacante manda X-Forwarded-For: 1.1.1.1; o proxy anexa o IP real.
    const ip = clientIpFrom(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));

    expect(ip).toBe("203.0.113.7");
  });

  it("nao muda o resultado quando o proxy entrega um unico IP", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("pega o ultimo IP real mesmo com varios forjados na frente", () => {
    const ip = clientIpFrom(
      headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7" }),
    );

    expect(ip).toBe("203.0.113.7");
  });

  it("tolera espacos e entradas vazias na lista", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": " 1.1.1.1 , , 203.0.113.7 " }))).toBe(
      "203.0.113.7",
    );
  });

  it("cai para x-real-ip quando nao ha x-forwarded-for", () => {
    expect(clientIpFrom(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("prefere x-forwarded-for a x-real-ip", () => {
    const ip = clientIpFrom(
      headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7", "x-real-ip": "9.9.9.9" }),
    );

    expect(ip).toBe("203.0.113.7");
  });

  it("devolve null quando nenhum header identifica a origem", () => {
    expect(clientIpFrom(headers({}))).toBeNull();
    expect(clientIpFrom(headers({ "x-forwarded-for": "  ,  " }))).toBeNull();
  });
});
