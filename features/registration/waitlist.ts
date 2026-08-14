/** A new registration lands on the waiting list once main capacity is reached. */
export function deriveIsWaitlist(p: {
  registrationCount: number;
  maxPlayers: number | null;
}): boolean {
  if (p.maxPlayers == null) return false;
  return p.registrationCount >= p.maxPlayers;
}
