// ─────────────────────────────────────────────────────────────────────────────
// matchGenerators.ts
//
// generateGroupSlots  → posições globais de grupo (group_slots table)
//                       ex: A1, A2, A3, A4, B1, B2, B3, B4
//
// generateGroupMatches → confrontos round-robin por grupo (knockout_matches)
//
// generateMatchSlots  → slots home/away de uma partida (match_slots)
//                       substitui generateSlots: não usa índice de partida como letra
//
// generateKnockoutMatches → confrontos de mata-mata (sem alteração)
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ── Group slots (fonte da verdade para posições de grupo) ─────────────────────
export type GroupSlotInsert = {
  phase_id: string;
  group_letter: string;
  position: number;
  label: string;
};

export function generateGroupSlots(
  phaseId: string,
  numberOfGroups: number,
  teamsPerGroup: number,
): GroupSlotInsert[] {
  const slots: GroupSlotInsert[] = [];
  for (let g = 0; g < numberOfGroups; g++) {
    const letter = ALPHABET[g] ?? String.fromCharCode(65 + g);
    for (let p = 1; p <= teamsPerGroup; p++) {
      slots.push({
        phase_id: phaseId,
        group_letter: letter,
        position: p,
        label: `${letter}${p}`,
      });
    }
  }
  return slots;
}

// ── Group matches (round-robin all_vs_all) ────────────────────────────────────
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

  for (let g = 0; g < numberOfGroups; g++) {
    const group = ALPHABET[g] ?? String.fromCharCode(65 + g);

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

// ── Match slots (home / away) — para qualquer partida ────────────────────────
// Substitui o antigo generateSlots(matchId, index).
// slot_order 1 = mandante, 2 = visitante.
// label é descritivo apenas; não é usado para lookup de posição de grupo.
export function generateMatchSlots(matchId: string) {
  return [
    { match_id: matchId, slot_order: 1 as const, label: "home" },
    { match_id: matchId, slot_order: 2 as const, label: "away" },
  ];
}

// ── Knockout matches ─────────────────────────────────────────────────────────
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

// ── Legacy alias (mantido para não quebrar imports existentes) ────────────────
// @deprecated Use generateMatchSlots(matchId) instead.
export function generateSlots(matchId: string, _index: number) {
  return generateMatchSlots(matchId);
}
