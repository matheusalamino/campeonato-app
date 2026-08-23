import { derivedCapacity } from "./capacity";

/**
 * Serialize parsed form values (Date -> ISO string, undefined -> null) for Supabase.
 *
 * Este tipo de entrada e escrito a mao, e NAO derivado do schema do formulario.
 * A consequencia e que uma coluna que fique de fora do objeto devolvido some sem
 * o `tsc` reclamar — foi assim que `max_extra_tickets` nasceu no-op. Quem cobre
 * essa lacuna e `row.test.ts`, comparando as chaves com `baseChampionshipObject`.
 */
export function toRow(values: {
  name: string;
  season?: string;
  description?: string;
  registration_start_date?: Date;
  registration_end_date?: Date;
  gala_night_date?: Date;
  tournament_start_date?: Date;
  max_extra_tickets: number;
  // O formato. `max_players` e `max_waitlist_players` NAO estao nesta lista de
  // proposito: sao saida, e nao entrada. Quem os passar mesmo assim — o
  // formulario ainda passa, enquanto o campo de total nao sai da tela — nao
  // muda o que e gravado.
  teams_count?: number;
  players_per_team?: number;
  goalkeepers_per_team: number;
  waitlist_goalkeepers: number;
  waitlist_outfield: number;
  status: string;
  registration_image_url?: string;
  base_price?: number;
  extra_ticket_price?: number;
  pix_key?: string;
  pix_merchant_name?: string;
  pix_merchant_city?: string;
  registration_group_options?: { label: string; requires_invite_code: boolean }[];
}) {
  const iso = (d?: Date) => (d ? d.toISOString() : null);

  // `?? 0` porque `CapacityConfig` pede `number` nos cinco campos e estas duas
  // colunas sao nulaveis no banco: formato nao configurado vira zero vaga, que e
  // o desfecho fechado. As outras tres chegam sempre preenchidas, pelo
  // `.default()` do Zod.
  const derived = derivedCapacity({
    teamsCount: values.teams_count ?? 0,
    playersPerTeam: values.players_per_team ?? 0,
    goalkeepersPerTeam: values.goalkeepers_per_team,
    waitlistGoalkeepers: values.waitlist_goalkeepers,
    waitlistOutfield: values.waitlist_outfield,
  });

  return {
    name: values.name,
    season: values.season ?? null,
    description: values.description ?? null,
    registration_start_date: iso(values.registration_start_date),
    registration_end_date: iso(values.registration_end_date),
    gala_night_date: iso(values.gala_night_date),
    tournament_start_date: iso(values.tournament_start_date),
    max_extra_tickets: values.max_extra_tickets,
    // O formato vai cru: e configuracao, e precisa voltar para a tela do jeito
    // que o admin a deixou. Quem o interpreta e `derivedCapacity`.
    teams_count: values.teams_count ?? null,
    players_per_team: values.players_per_team ?? null,
    goalkeepers_per_team: values.goalkeepers_per_team,
    waitlist_goalkeepers: values.waitlist_goalkeepers,
    waitlist_outfield: values.waitlist_outfield,
    // As duas grandezas que ninguem digita. Valor CRU, e nao `|| null`: zero
    // aqui significa fechado, e dobra-lo em `null` devolveria o ilimitado que a
    // formula veio eliminar, no caso mais comum de todos — o campeonato que
    // ainda nao tem formato.
    max_players: derived.total,
    max_waitlist_players: derived.waitlistTotal,
    status: values.status,
    registration_image_url: values.registration_image_url ?? null,
    base_price: values.base_price ?? null,
    extra_ticket_price: values.extra_ticket_price ?? null,
    pix_key: values.pix_key ?? null,
    pix_merchant_name: values.pix_merchant_name ?? null,
    pix_merchant_city: values.pix_merchant_city ?? null,
    registration_group_options: values.registration_group_options ?? [],
  };
}
