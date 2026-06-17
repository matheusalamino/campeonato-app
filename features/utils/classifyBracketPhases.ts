import type { ChampionshipMatchPhaseGroup } from "@/features/hooks/useChampionshipMatches";

export type CopaClassification = {
  repescagemLeft: ChampionshipMatchPhaseGroup | null;
  repescagemRight: ChampionshipMatchPhaseGroup | null;
  semiLeft: ChampionshipMatchPhaseGroup | null;
  semiRight: ChampionshipMatchPhaseGroup | null;
  final: ChampionshipMatchPhaseGroup | null;
  disputa: ChampionshipMatchPhaseGroup | null;
  isValid: boolean;
};

function has(name: string, ...keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

export function classifyBracketPhases(
  phases: ChampionshipMatchPhaseGroup[],
): CopaClassification {
  const sorted = [...phases].sort((a, b) => a.orderNumber - b.orderNumber);

  const repescagens = sorted.filter((p) => has(p.name, "repescagem"));
  const semis = sorted.filter((p) => has(p.name, "semi"));

  const final =
    sorted.find((p) => {
      const hasFinalMatch = p.matches.some((m) => m.isFinal) && !has(p.name, "semi");
      const nameIsFinal = has(p.name, "final") && !has(p.name, "semi");
      return hasFinalMatch || nameIsFinal;
    }) ?? null;

  const disputa =
    sorted.find((p) => has(p.name, "disputa", "3º", "terceiro", "3o")) ?? null;

  return {
    repescagemLeft: repescagens[0] ?? null,
    repescagemRight: repescagens[1] ?? null,
    semiLeft: semis[0] ?? null,
    semiRight: semis[1] ?? null,
    final,
    disputa,
    isValid: final !== null,
  };
}
