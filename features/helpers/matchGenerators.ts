export function generateGroupMatches(
  phaseId: string,
  numberOfGroups: number,
  teamsPerGroup: number,
  abbreviation: string,
) {
  const matches: {
    phase_id: string;
    name: string;
    code: string;
    round_number: number;
    group_label: string;
  }[] = [];

  let matchIndex = 1;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  for (let g = 0; g < numberOfGroups; g++) {
    const group = alphabet[g];

    for (let i = 1; i <= teamsPerGroup; i++) {
      for (let j = i + 1; j <= teamsPerGroup; j++) {
        matches.push({
          phase_id: phaseId,
          name: `${group}${i} x ${group}${j}`,
          code: `${abbreviation}${matchIndex++}`,
          round_number: 1,
          group_label: group,
        });
      }
    }
  }

  return matches;
}

export function generateKnockoutMatches(
  phaseId: string,
  numberOfMatches: number,
  abbreviation: string,
) {
  return Array.from({ length: numberOfMatches }).map((_, i) => ({
    phase_id: phaseId,
    name: `Confronto ${i + 1}`,
    code: `${abbreviation}${i + 1}`,
    round_number: 1,
  }));
}

export function generateSlots(matchId: string, index: number) {
  const letter = String.fromCharCode(65 + index);

  return [
    {
      match_id: matchId,
      slot_order: 1 as const,
      label: `${letter}1`,
    },
    {
      match_id: matchId,
      slot_order: 2 as const,
      label: `${letter}2`,
    },
  ];
}
