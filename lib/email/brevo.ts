import type { EmailMessage, EmailSender, SendResult } from "./port";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type BrevoConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

/**
 * 429 (cota/ritmo) e 5xx (falha do lado deles) passam com o tempo.
 * 4xx restantes nao: endereco invalido continua invalido, e chave errada
 * continua errada. Ver a nota de `retriable` em port.ts.
 */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createBrevoSender(
  config: BrevoConfig,
  fetchImpl: typeof fetch = fetch,
): EmailSender {
  return async function send(msg: EmailMessage): Promise<SendResult> {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: config.fromName, email: config.fromEmail },
          to: [{ email: msg.to, name: msg.toName ?? msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
        }),
      });
    } catch (err) {
      // Rede caida, DNS, timeout: nada disso e culpa do endereco.
      return { ok: false, retriable: true, error: `rede: ${String(err)}` };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        retriable: isRetriableStatus(response.status),
        error: `${response.status} ${body.slice(0, 300)}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, providerMessageId: data.messageId ?? "" };
  };
}
