import { skillsFor, SKILL_LABELS } from "./skills";

export type RadarPoint = { skill: string; label: string; value: number };

/**
 * Pontos do radar para as habilidades da posicao escolhida.
 *
 * O formato nao e livre: `PlayerRadar` le `label` no eixo angular e `value` no
 * poligono, num dominio de 0 a 100 — dai a conversao da nota de 1 a 5.
 *
 * Habilidade ainda nao avaliada vale 0, e nao e omitida: o poligono cresce a
 * cada estrela em vez de mudar de forma enquanto faltam notas.
 */
export function radarDataFrom(
  skills: Record<string, number>,
  position: string,
): RadarPoint[] {
  return skillsFor(position).map((skill) => ({
    skill,
    label: SKILL_LABELS[skill] ?? skill,
    value: (skills[skill] ?? 0) * 20,
  }));
}

/**
 * Ha ao menos uma habilidade da posicao avaliada?
 *
 * Com zero notas o poligono colapsa num ponto no centro e parece defeito, entao
 * o grafico so e montado a partir da primeira estrela.
 */
export function hasAnyRating(
  skills: Record<string, number>,
  position: string,
): boolean {
  return skillsFor(position).some((skill) => (skills[skill] ?? 0) > 0);
}
