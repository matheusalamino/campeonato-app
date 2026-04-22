import { DraftPlayer } from "@/types/draft";

// quantidade de potes
export function calculatePotCount(playersCount: number): number {
  if (playersCount <= 12) return 2;

  const pots = Math.ceil(playersCount / 10);

  return Math.min(Math.max(pots, 2), 3);
}

// distribuição equilibrada (snake)
export function distributePlayers(
  players: DraftPlayer[],
  potCount: number,
): DraftPlayer[][] {
  const pots: DraftPlayer[][] = Array.from({ length: potCount }, () => []);

  const sorted = [...players].sort((a, b) => b.overall - a.overall);

  let direction = 1;
  let index = 0;

  for (const player of sorted) {
    pots[index].push(player);

    if (direction === 1) {
      if (index === potCount - 1) {
        direction = -1;
      } else {
        index++;
      }
    } else {
      if (index === 0) {
        direction = 1;
      } else {
        index--;
      }
    }
  }

  return pots;
}

// limite de cartolas
export function calculateManagersLimit(size: number): number {
  if (size >= 9) return 7;
  if (size >= 7) return 5;
  if (size >= 5) return 4;
  return 3;
}
