import { skillsFor } from "@/features/registration/skills";

type Evaluation = {
  skill: string;
  rating: number;
};

/**
 * Media das notas dos organizadores, no dominio 0..100 do radar.
 *
 * A escolha "seis de goleiro ou seis de linha" vem de `skillsFor`, e nao de um
 * par de arrays daqui. Ela ja morou aqui, e foi por isso que este arquivo ficou
 * para tras: quando a coluna virou CODIGO, os irmaos que comparavam a posicao
 * de um jeito parecido foram convertidos, e este, que comparava de outro jeito
 * (`position?.toLowerCase().includes(...)`), nao. Todo goleiro passou a ver as
 * seis habilidades de LINHA — sem erro, sem `tsc` reclamando (os dois lados sao
 * `string`) e sem teste vermelho, porque nao havia teste sobre esta funcao.
 * Delegando, este arquivo deixa de ter comparacao PROPRIA para divergir — nao
 * ha mais aqui onde escrever a comparacao errada —, e a escolha passa a ser
 * coberta pelos testes que ja existem em cima de `skillsFor`. Outros sitios
 * ainda comparam por conta propria; esta frase fala deste arquivo.
 *
 * `radarDataFrom` NAO serve aqui, apesar do parentesco: ele le UMA nota por
 * habilidade (`Record<string, number>`), converte com `* 20` sem arredondar e
 * ja rotula pelo `SKILL_LABELS` da inscricao. Aqui chegam VARIAS notas por
 * habilidade, para tirar media e arredondar, e quem chama (`PlayerRadarModal`)
 * rotula pelo `skill_labels` de `lib/skills.ts`, que escreve TRES dos doze
 * nomes de outro jeito (`visao`, `controle` e `jogoAereo`; os outros nove sao
 * identicos). So a escolha das habilidades e a mesma — e e so ela que se
 * compartilha.
 */
export function calculateRadar(evaluations: Evaluation[], position: string) {
  const skills = skillsFor(position);

  return skills.map((skill) => {
    const skillRatings = evaluations
      .filter((e) => e.skill === skill)
      .map((e) => e.rating);

    if (skillRatings.length === 0) {
      return { skill, value: 0 };
    }

    const avg =
      skillRatings.reduce((sum, v) => sum + v, 0) / skillRatings.length;

    return {
      skill,
      value: Math.round((avg / 5) * 100),
    };
  });
}
