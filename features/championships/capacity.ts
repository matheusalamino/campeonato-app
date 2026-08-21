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
  waitlistTotal: number;
};

/**
 * A capacidade, derivada do formato: ninguem digita o total.
 *
 * Existe porque `max_players` era digitado a mao e esta `NULL` no campeonato de
 * hoje — e com ele nulo `shouldCloseForCapacity` devolve `false` sempre e a RPC
 * `reserve_registration_slot` entrega vaga principal sem olhar limite nenhum
 * (`IF v_max_players IS NULL OR ...`). A capacidade nunca fechava sozinha.
 *
 * O `Math.min` do goleiro nao e defensividade a toa. A trava do banco pergunta
 * `(confirmados + reservados) < limite`, entao um limite de goleiro maior que o
 * total ADMITE mais gente do que o campeonato tem vaga: `goalkeepersPerTeam: 11`
 * num time de 10 abriria 88 vagas de goleiro num campeonato de 80. Amarrar o
 * goleiro ao total tambem e o que mantem `outfield` em zero em vez de negativo —
 * numero que nao quer dizer nada nem na trava nem na tela.
 */
export function derivedCapacity(config: CapacityConfig): DerivedCapacity {
  const total = Math.max(0, config.teamsCount * config.playersPerTeam);
  const goalkeepers = Math.min(total, Math.max(0, config.teamsCount * config.goalkeepersPerTeam));
  return {
    total,
    goalkeepers,
    outfield: total - goalkeepers,
    // Sem formato nao ha fila: ninguem espera vaga num campeonato de zero vagas.
    waitlistTotal:
      total === 0 ? 0 : Math.max(0, config.waitlistGoalkeepers) + Math.max(0, config.waitlistOutfield),
  };
}
