export const LINE_SKILLS = [
  "visao", "controle", "finalizacao", "velocidade", "desarme", "drible",
] as const;

export const KEEPER_SKILLS = [
  "reposicao", "comunicacao", "posicionamento", "reflexo", "jogoAereo", "agilidade",
] as const;

export const SKILL_LABELS: Record<string, string> = {
  visao: "Visão de jogo",
  controle: "Controle de bola",
  finalizacao: "Finalização",
  velocidade: "Velocidade",
  desarme: "Desarme",
  drible: "Drible",
  reposicao: "Reposição",
  comunicacao: "Comunicação",
  posicionamento: "Posicionamento",
  reflexo: "Reflexo",
  jogoAereo: "Jogo aéreo",
  agilidade: "Agilidade",
};

export function skillsFor(position: string): readonly string[] {
  return position === "Goleiro" ? KEEPER_SKILLS : LINE_SKILLS;
}
