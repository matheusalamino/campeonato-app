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

/**
 * O formato do campeonato.
 *
 * Nenhum destes campos existe no admin ainda: a T2 cria as colunas, e o
 * formulario que os preenche vem depois. Hoje quem chama isto monta o objeto na
 * mao.
 */
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

/** Teto do que a coluna guarda: `max_players` e `int` no Postgres, ou seja int4. */
const MAX_INT4 = 2_147_483_647;

/**
 * Um numero de configuracao virando inteiro finito, nao-negativo e que cabe em
 * int4. Fora dessa faixa devolve 0 — que aqui significa FECHADO, nao "sem
 * valor".
 *
 * Nao se chama `seats` porque em 3 dos 6 sitios nao ha vaga nenhuma: um time
 * nao e uma vaga, e cota-por-time nem e um total.
 *
 * O `Number.isFinite` esta aqui pelo NaN, e o motivo e o mesmo do modulo:
 * `JSON.stringify(NaN)` e `null`, e `max_players` NULL faz
 * `shouldCloseForCapacity` devolver `false` e a RPC entregar vaga sem olhar
 * limite. NaN nao vem de campo vazio no formulario de hoje — `emptyToUndef` em
 * `ChampionshipForm` manda vazio para `undefined`, e `Number("")` e 0 — vem de
 * `parseInt("")` e de aritmetica com `undefined`. `Infinity` nao precisa deste
 * ramo: cai no teto abaixo, que ele tambem estoura.
 *
 * O teto e o par do NaN, e nao hipotese: 3000 times de 800000 dao 2,4 bilhoes,
 * que e finito, inteiro e positivo, e maior que int4. Sem ele o admin leva erro
 * cru do Postgres em vez de recusa explicada.
 */
function boundedInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.max(0, Math.floor(value));
  return floored > MAX_INT4 ? 0 : floored;
}

/**
 * A capacidade, derivada do formato: ninguem digita o total.
 *
 * Existe porque `max_players` e digitado a mao e esta `NULL` no campeonato de
 * hoje — e com ele nulo `shouldCloseForCapacity` devolve `false` sempre e a RPC
 * `reserve_registration_slot` entrega vaga principal sem olhar limite nenhum
 * (`IF v_max_players IS NULL OR ...`). A capacidade nunca fechava sozinha.
 *
 * `total: 0` significa FECHADO, e nao "sem configuracao": com zero a RPC
 * pergunta `(confirmados + reservados) < 0`, falso para qualquer contagem, e
 * recusa todo mundo. A T2 relaxa o CHECK `max_players > 0` para `>= 0` e o Zod
 * para `.min(0)` justamente para o zero ser gravavel — antes dela o que sobrava
 * era `NULL`, que significa ilimitado.
 *
 * O `Math.min` do goleiro serve HOJE a um consumidor so: manter `outfield` em
 * zero em vez de negativo, ja que `total - goalkeepers` e a unica coisa que le
 * `goalkeepers` por enquanto. Cota por posicao nao existe na trava, que le
 * `v_max_players` e `COALESCE(v_max_waitlist, 0)` e nada por posicao; quando ela
 * chegar (T2+), o mesmo `Math.min` passa a evitar sobrevenda. Ele nao vem com
 * `boundedInt` por fora de proposito: `Math.min` ja prende o resultado a `total`,
 * que cabe em int4, e um teto extra ali criaria degrau — cota 11 num time de 10
 * daria "todos goleiros" e cota 800000 daria "nenhum goleiro".
 *
 * Cada fator passa por `boundedInt` antes de multiplicar, e o produto passa de
 * novo. O que exige por-fator e o PISO, nao o zero: como o produto tambem passa,
 * tirar o zero de um fator sozinho e invisivel (`-8 * 0` da 0 de todo jeito) e
 * so input fracionario mata essa mutacao — 3 times de 10,5 sao 30 vagas, e nao
 * 31. O zero por-fator ainda importa para DOIS campos negativos, que se
 * multiplicariam para positivo: `-8 * -10` da 80.
 */
export function derivedCapacity(config: CapacityConfig): DerivedCapacity {
  const teams = boundedInt(config.teamsCount);
  const total = boundedInt(teams * boundedInt(config.playersPerTeam));
  const goalkeepers = Math.min(total, teams * boundedInt(config.goalkeepersPerTeam));

  // Sem formato nao ha fila: ninguem espera vaga num campeonato de zero vagas.
  //
  // `=== 0` basta porque `total` sai de `boundedInt` e portanto e sempre inteiro
  // finito — nao ha NaN aqui para escapar da comparacao. A prova e da EXPRESSAO,
  // nao do valor: se este trecho virar uma funcao que RECEBA `total` (a T3
  // cogita `derivedWaitlist`), ela morre junto com a assinatura e sem nenhum
  // teste falhar. Nesse commit, troque por `!(total > 0)` ou sanee o parametro.
  const queuedGoalkeepers = total === 0 ? 0 : boundedInt(config.waitlistGoalkeepers);
  const queuedOutfield = total === 0 ? 0 : boundedInt(config.waitlistOutfield);
  // Cada balde cabe em int4, mas a soma dos dois pode nao caber. A fila fecha
  // inteira nesse caso: um `waitlistTotal` cortado no teto mentiria sobre os
  // dois numeros que ele soma.
  const queueFits = queuedGoalkeepers + queuedOutfield <= MAX_INT4;

  return {
    total,
    goalkeepers,
    outfield: total - goalkeepers,
    waitlistGoalkeepers: queueFits ? queuedGoalkeepers : 0,
    waitlistOutfield: queueFits ? queuedOutfield : 0,
    waitlistTotal: queueFits ? queuedGoalkeepers + queuedOutfield : 0,
  };
}
