/**
 * Resultado de reservar a vaga do jogador.
 *
 * Vive aqui, e nao no servico, porque o componente que mostra o estado da vaga
 * roda no cliente e o servico e marcado com `server-only`.
 */
export type SlotReservation =
  | { ok: true; isWaitlist: boolean; expiresAt: string }
  | { ok: false; reason: "not_found" | "not_open" | "already_registered" | "full" }
  | { ok: false; reason: "all_reserved"; retryAt: string | null };
