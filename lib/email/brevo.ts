import type { EmailMessage, EmailSender, SendResult } from "./port";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/**
 * Teto de espera por resposta do Brevo. O dreno vai rodar por cron, e uma
 * requisicao pendurada seguraria a fila inteira ate o proximo disparo.
 */
const TIMEOUT_MS = 15_000;

/**
 * Quanto do corpo do erro entra em `error`. NAO tem relacao com a cota de
 * 300/dia do plano do Brevo, citada em port.ts e no teste deste arquivo -- os
 * numeros coincidem por acaso, e e por isso que este aqui tem nome.
 */
const ERROR_SNIPPET_CHARS = 300;

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
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          sender: { name: config.fromName, email: config.fromEmail },
          to: [{ email: msg.to, name: msg.toName ?? msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
        }),
      });
    } catch (err) {
      // Rede caida, DNS, e o estouro de TIMEOUT_MS acima: nada disso e culpa
      // do endereco, entao tudo vai voltar para a fila.
      return { ok: false, retriable: true, error: `rede: ${String(err)}` };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        retriable: isRetriableStatus(response.status),
        error: `${response.status} ${body.slice(0, ERROR_SNIPPET_CHARS)}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, providerMessageId: data.messageId ?? "" };
  };
}
