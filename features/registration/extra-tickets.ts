/**
 * Teto de ingressos extras por inscricao.
 *
 * O que limita de verdade e a capacidade do salao da Noite de Gala, que muda
 * por edicao — dai o teto ser configuravel por campeonato. Sem teto nenhum,
 * como era antes, dava para pedir 999 ingressos e o total era cobrado.
 */
export const DEFAULT_MAX_EXTRA_TICKETS = 4;

/** Zero e um teto valido: campeonato que nao vende ingresso extra. */
export function extraTicketsCap(configured: number | null | undefined): number {
  if (configured == null) return DEFAULT_MAX_EXTRA_TICKETS;
  return Math.max(0, Math.floor(configured));
}
