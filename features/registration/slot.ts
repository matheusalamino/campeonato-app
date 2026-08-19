/**
 * Resultado de reservar a vaga do jogador.
 *
 * Vive aqui, e nao no servico, porque o componente que mostra o estado da vaga
 * roda no cliente e o servico e marcado com `server-only`.
 *
 * `error` e o ramo da chamada que nao completou — PostgREST fora do ar, falta
 * de permissao, timeout, rede. Ele existe separado porque nao e um veredito
 * sobre vaga: nao sabemos se ha lugar ou nao. Dobra-lo em `not_found`, como era
 * antes, fazia uma falha passageira dizer ao jogador que o campeonato tinha
 * esgotado — e o bloqueava com uma informacao inventada.
 */
export type SlotReservation =
  | { ok: true; isWaitlist: boolean; expiresAt: string }
  | { ok: false; reason: "not_found" | "not_open" | "already_registered" | "full" }
  | { ok: false; reason: "all_reserved"; retryAt: string | null }
  | { ok: false; reason: "error" };
