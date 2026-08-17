import type { ChampionshipStatus } from "@/types/championship";

/**
 * Decide whether a championship should auto-close to `subscribed`.
 * Only applies while `subscribing` and when a max_players cap exists.
 */
export function shouldCloseForCapacity(params: {
  status: ChampionshipStatus;
  registrationCount: number;
  maxPlayers: number | null | undefined;
  maxWaitlist: number | null | undefined;
}): boolean {
  if (params.status !== "subscribing") return false;
  if (params.maxPlayers == null) return false;
  const capacity = params.maxPlayers + (params.maxWaitlist ?? 0);
  return params.registrationCount >= capacity;
}
