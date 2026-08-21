import type { ChampionshipStatus } from "@/types/championship";

/**
 * Decide whether a championship should auto-close to `subscribed`.
 * Only applies while `subscribing` and when a max_players cap exists.
 */
export function shouldCloseForCapacity(params: {
  status: ChampionshipStatus;
  registrationCount: number;
  maxPlayers: number | null | undefined;
  maxWaitlist: number | null | undefined;
}): boolean {
  if (params.status !== "subscribing") return false;
  if (params.maxPlayers == null) return false;
  const capacity = params.maxPlayers + (params.maxWaitlist ?? 0);
  return params.registrationCount >= capacity;
}

/** A configuracao de formato que o admin preenche. */
export type CapacityConfig = {
  teamsCount: number;
  playersPerTeam: number;
  goalkeepersPerTeam: number;
  waitlistGoalkeepers: number;
  waitlistOutfield: number;
};

/** As grandezas derivadas. Ninguem digita nenhuma delas. */
export type DerivedCapacity = {
  total: number;
  goalkeepers: number;
  outfield: number;
  waitlistGoalkeepers: number;
  waitlistOutfield: number;
  waitlistTotal: number;
};

/**
 * Um numero digitado no admin virando quantidade de gente.
 *
 * O nao-finito vem primeiro, e nao por preciosismo: `JSON.stringify(NaN)` e
 * `null`, entao um campo vazio no formulario gravaria `max_players` como `NULL`
 * — o estado exato que este modulo veio matar, porque com ele nulo
 * `shouldCloseForCapacity` devolve `false` e a RPC entrega vaga sem olhar
 * limite. Campo vazio no admin nao pode virar campeonato sem trava.
 *
 * O piso e o zero valem por FATOR, nunca no produto: `Math.max(0, -8 * -10)` da
 * 80, e dois campos negativos inventariam um campeonato inteiro. Por isso
 * `derivedCapacity` chama isto em cada numero antes de multiplicar, e de novo no
 * produto, que ainda pode estourar para `Infinity`.
 */
function seats(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * A capacidade, derivada do formato: ninguem digita o total.
 *
 * Existe porque `max_players` era digitado a mao e esta `NULL` no campeonato de
 * hoje — e com ele nulo `shouldCloseForCapacity` devolve `false` sempre e a RPC
 * `reserve_registration_slot` entrega vaga principal sem olhar limite nenhum
 * (`IF v_max_players IS NULL OR ...`). A capacidade nunca fechava sozinha.
 *
 * O `Math.min` do goleiro nao e defensividade a toa, mas o alvo dele ainda nao
 * existe: a trava de hoje le so `v_max_players`, e cota por posicao chega na
 * T2+. Quando chegar, ela vai perguntar `(confirmados + reservados) < limite`,
 * como a principal ja pergunta hoje — e ai um limite de goleiro maior que o
 * total ADMITIRIA mais gente do que o campeonato tem vaga: `goalkeepersPerTeam:
 * 11` num time de 10 pediria 88 vagas de goleiro num campeonato de 80. Amarrar
 * o goleiro ao total tambem e o que mantem `outfield` em zero em vez de
 * negativo.
 */
export function derivedCapacity(config: CapacityConfig): DerivedCapacity {
  const teams = seats(config.teamsCount);
  const total = seats(teams * seats(config.playersPerTeam));
  const goalkeepers = Math.min(total, seats(teams * seats(config.goalkeepersPerTeam)));
  // Sem formato nao ha fila: ninguem espera vaga num campeonato de zero vagas.
  const waitlistGoalkeepers = total === 0 ? 0 : seats(config.waitlistGoalkeepers);
  const waitlistOutfield = total === 0 ? 0 : seats(config.waitlistOutfield);
  return {
    total,
    goalkeepers,
    outfield: total - goalkeepers,
    waitlistGoalkeepers,
    waitlistOutfield,
    waitlistTotal: waitlistGoalkeepers + waitlistOutfield,
  };
}
