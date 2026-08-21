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

/**
 * As habilidades da posicao. CODIGO, e nao palavra.
 *
 * `GOL` e nao `Goleiro` porque desde a 20260821010000 e o codigo que circula em
 * todo caminho que chega aqui: o `form.preferred_position` do wizard, o valor ja
 * validado pelo Zod em `schema.ts`, e o mesmo valor no insert de
 * `services/public-registration.ts`.
 *
 * Errar esta comparacao nao quebra nada visivelmente — devolve as habilidades de
 * LINHA para o goleiro. O wizard mostra as seis estrelas erradas, o schema exige
 * as seis erradas, e o servico GRAVA as seis erradas. Tudo calado.
 *
 * Comparacao exata de proposito, sem passar por `normalizePreferredPosition`:
 * aceitar as duas grafias aqui manteria vivo justamente o segundo vocabulario
 * que o bloco A8 existe para matar.
 */
export function skillsFor(position: string): readonly string[] {
  return position === "GOL" ? KEEPER_SKILLS : LINE_SKILLS;
}
