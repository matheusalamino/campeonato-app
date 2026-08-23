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
  // A mesma escolha "seis de goleiro ou seis de linha" mora em outros lugares,
  // e cada um batiza o par de arrays do seu jeito — por isso grepar
  // `skillsGol` acha so uma parte deles. Sao EvaluateModal e SubscribeForm
  // (`skillsGol`/`skillsLinha`, o mesmo par daqui), PlayerForm
  // (`goleiro`/`linha`), o `skillsFor()` de features/registration/skills.ts
  // (`KEEPER_SKILLS`/`LINE_SKILLS`) e o import de CSV
  // (app/api/import-players/route.ts, com os dois pares escritos inline no
  // ternario). Todos ja comparavam com `=== "GOL"`; este escapou da virada por
  // escrever a comparacao de outro jeito.
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
