/**
 * Mensagem curta para o toast que acompanha o bloqueio de um passo.
 *
 * Com um erro so, repetir a mensagem do campo e mais util que um texto
 * generico. Com varios, escolher um deles esconderia os outros — melhor dizer
 * quantos sao e deixar o destaque nos campos guiar.
 */
export function summarizeErrors(fieldErrors: Record<string, string>): string {
  const messages = Object.values(fieldErrors);
  if (messages.length === 0) return "";
  if (messages.length === 1) return messages[0];
  return `Confira os ${messages.length} campos destacados`;
}
