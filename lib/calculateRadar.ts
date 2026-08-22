type Evaluation = {
  skill: string;
  rating: number;
};

const skillsLinha = [
  "visao",
  "controle",
  "finalizacao",
  "velocidade",
  "desarme",
  "drible",
];

const skillsGol = [
  "reposicao",
  "comunicacao",
  "posicionamento",
  "reflexo",
  "jogoAereo",
  "agilidade",
];

export function calculateRadar(evaluations: Evaluation[], position: string) {
  // CODIGO, e nao palavra. `position` chega cru de `players.preferred_position`
  // (PlayersSection -> PlayerRadarModal), e essa coluna guarda `GOL` desde a
  // 20260821010000. A comparacao antiga era
  // `position?.toLowerCase().includes("goleiro")`, que nao lancava erro nenhum:
  // `"GOL".toLowerCase()` simplesmente nao contem `"goleiro"`, entao TODO
  // goleiro caia no ramo de linha e via o radar das seis habilidades erradas.
  //
  // Os outros tres lugares que escolhem a mesma dupla skillsGol/skillsLinha
  // (EvaluateModal, PlayerForm, SubscribeForm) ja comparavam assim; este
  // escapou da virada por escrever a comparacao de outro jeito.
  const isGoalkeeper = position === "GOL";

  const skills = isGoalkeeper ? skillsGol : skillsLinha;

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
