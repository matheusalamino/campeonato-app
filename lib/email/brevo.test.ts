import { describe, it, expect, vi } from "vitest";
import { createBrevoSender, isRetriableStatus } from "./brevo";

const CONFIG = {
  apiKey: "xkeysib-teste",
  fromEmail: "remetente@exemplo.com",
  fromName: "CLS 2026",
};

const MSG = {
  to: "jogador@exemplo.com",
  toName: "Jogador",
  subject: "Assunto",
  html: "<p>corpo</p>",
  text: "corpo",
};

describe("isRetriableStatus", () => {
  it("trata 429 e 5xx como transitorios", () => {
    expect(isRetriableStatus(429)).toBe(true);
    expect(isRetriableStatus(500)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
  });

  it("trata 400, 401 e 403 como definitivos", () => {
    // Endereco invalido e chave errada nao melhoram com espera, e retentar
    // queima a cota de 300/dia, que e o recurso escasso deste bloco.
    expect(isRetriableStatus(400)).toBe(false);
    expect(isRetriableStatus(401)).toBe(false);
    expect(isRetriableStatus(403)).toBe(false);
  });
});

describe("createBrevoSender", () => {
  it("devolve o messageId quando o Brevo aceita", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: "<abc@smtp-relay.mailin.fr>" }),
    });
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    const r = await send(MSG);

    expect(r).toEqual({ ok: true, providerMessageId: "<abc@smtp-relay.mailin.fr>" });
  });

  it("manda o remetente e o destinatario no formato que a API espera", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ messageId: "x" }),
    });
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    await send(MSG);

    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-teste");
    const payload = JSON.parse(init.body as string);
    expect(payload.sender).toEqual({ name: "CLS 2026", email: "remetente@exemplo.com" });
    expect(payload.to).toEqual([{ email: "jogador@exemplo.com", name: "Jogador" }]);
    expect(payload.textContent).toBe("corpo");
  });

  it("marca 429 como retentavel", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => "too many requests",
    });
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    const r = await send(MSG);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retriable).toBe(true);
  });

  it("marca 400 como definitivo", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => "invalid email",
    });
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    const r = await send(MSG);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retriable).toBe(false);
    expect(r.ok === false && r.error).toContain("400");
  });

  it("trata queda de rede como retentavel", async () => {
    // Sem isto, uma oscilacao de rede viraria failed_permanent e a pessoa
    // nunca receberia o comprovante.
    const fakeFetch = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    const r = await send(MSG);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retriable).toBe(true);
  });

  it("trata estouro de timeout como retentavel", async () => {
    // O `AbortSignal.timeout` rejeita com TimeoutError. Sem teto de espera, uma
    // requisicao pendurada seguraria a fila inteira ate o proximo cron; e sem
    // esta assertiva, o teto poderia sumir sem ninguem notar.
    const fakeFetch = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    const r = await send(MSG);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retriable).toBe(true);
  });

  it("passa um signal com teto de espera ao fetch", async () => {
    // Prende o teto ao comportamento: sem `signal`, o fetch espera para sempre.
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => ({ messageId: "x" }),
    });
    const send = createBrevoSender(CONFIG, fakeFetch as unknown as typeof fetch);

    await send(MSG);

    const [, init] = fakeFetch.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
