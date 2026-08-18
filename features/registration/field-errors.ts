import type { z } from "zod";

/**
 * Converte o erro do Zod num mapa caminho -> mensagem.
 *
 * Mora aqui, e nao dentro do servico, porque o wizard roda o mesmo schema para
 * validar cada passo antes de avancar. Uma unica traducao evita que cliente e
 * servidor discordem sobre qual campo falhou.
 */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
