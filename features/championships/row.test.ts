import { describe, it, expect } from "vitest";
import { baseChampionshipObject } from "./schema";
import { toRow } from "./row";

// Amostra completa: um valor por campo do schema do formulario, usada para
// verificar que toRow() liga cada chave ao valor correto (nao so a presenca
// da chave).
//
// `max_players` e `max_waitlist_players` nao estao aqui porque nao sao mais
// entrada: toRow() os deriva do formato. Eles aparecem so no row esperado.
const sampleValues = {
  name: "Copa Interna",
  season: "2026",
  description: "Regulamento",
  registration_start_date: new Date("2026-02-01"),
  registration_end_date: new Date("2026-03-01"),
  gala_night_date: new Date("2026-03-10"),
  tournament_start_date: new Date("2026-04-01"),
  max_extra_tickets: 4,
  teams_count: 4,
  players_per_team: 5,
  goalkeepers_per_team: 1,
  waitlist_goalkeepers: 2,
  waitlist_outfield: 3,
  status: "active",
  registration_image_url: "https://example.com/img.png",
  base_price: 50,
  extra_ticket_price: 10,
  pix_key: "chave@pix.com",
  pix_merchant_name: "Fulano",
  pix_merchant_city: "Sorocaba",
  registration_group_options: [{ label: "Grupo A", requires_invite_code: false }],
};

// O row esperado: igual ao fixture, exceto pelas datas, que toRow() converte
// para ISO string antes de gravar. Como todo campo do fixture esta
// preenchido (nada undefined), essa comparacao nao exercita os fallbacks
// `?? null` / `?? []` de toRow() para campos ausentes — so a ligacao
// chave->valor de cada campo presente.
const expectedRow = {
  ...sampleValues,
  registration_start_date: sampleValues.registration_start_date.toISOString(),
  registration_end_date: sampleValues.registration_end_date.toISOString(),
  gala_night_date: sampleValues.gala_night_date.toISOString(),
  tournament_start_date: sampleValues.tournament_start_date.toISOString(),
  // As duas colunas que o fixture nao tem porque nao se digita: 4 times de 5
  // dao 20 vagas, e a fila de 2 + 3 da 5.
  max_players: 20,
  max_waitlist_players: 5,
};

describe("toRow", () => {
  it("grava no banco toda coluna que existe no schema do formulario", () => {
    // Deriva as chaves esperadas do proprio schema, em vez de uma lista
    // escrita a mao — uma lista a mao teria o mesmo problema de manutencao
    // que fez max_extra_tickets ficar de fora do toRow original.
    const formKeys = Object.keys(baseChampionshipObject.shape);

    // Sentinela: se baseChampionshipObject.shape algum dia vier vazio (bump
    // major do Zod, refactor do schema), formKeys e missing ficariam ambos
    // [] e o teste passaria sem checar nada. Garante que a lista tem o
    // tamanho esperado antes de confiar nela.
    expect(formKeys.length).toBeGreaterThan(10);

    const row = toRow(sampleValues);
    const rowKeys = new Set(Object.keys(row));

    const missing = formKeys.filter((key) => !rowKeys.has(key));

    expect(
      missing,
      `Colunas do schema do formulario ausentes no row gravado no banco: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("liga cada chave ao valor correto, nao so verifica presenca", () => {
    const row = toRow(sampleValues);
    expect(row).toEqual(expectedRow);
  });
});

// O formato de 2026, ja depois do Zod: 8 times de 10, 1 goleiro por time, e uma
// fila de 1 goleiro + 4 de linha.
//
// `max_players` e `max_waitlist_players` entram aqui com valor absurdo DE
// PROPOSITO. Eles deixaram de ser campo do admin, e os testes abaixo provam que
// o que chega na coluna sai da formula, e nao do que alguem digitou.
const formatoDeOitoTimes = {
  name: "Copa de 2026",
  status: "subscribing",
  max_extra_tickets: 4,
  max_players: 999,
  max_waitlist_players: 999,
  teams_count: 8,
  players_per_team: 10,
  goalkeepers_per_team: 1,
  waitlist_goalkeepers: 1,
  waitlist_outfield: 4,
};

describe("toRow: o formato do campeonato", () => {
  it("as cinco colunas do formato atravessam o toRow", () => {
    // Coluna nova so grava se entrar na allowlist do objeto devolvido, e o tsc
    // nao pega a que falta: o tipo de entrada de toRow e escrito a mao, e nao
    // derivado do schema.
    expect(toRow(formatoDeOitoTimes)).toMatchObject({
      teams_count: 8,
      players_per_team: 10,
      goalkeepers_per_team: 1,
      waitlist_goalkeepers: 1,
      waitlist_outfield: 4,
    });
  });

  it("o total e a espera sao DERIVADOS na gravacao, nao digitados", () => {
    const row = toRow(formatoDeOitoTimes);
    expect(row.max_players).toBe(80);
    expect(row.max_waitlist_players).toBe(5);
  });

  it("formato nao configurado grava zero, e nao o NULL que vale ilimitado", () => {
    // Este e o caso mais comum de todos: campeonato que ainda nao tem formato.
    // Dobrar o zero em `null` (um `|| null` no lugar do valor cru) devolveria
    // justamente o ilimitado que a formula veio matar — as duas RPCs tratam
    // `max_players IS NULL` como "entrega vaga sem olhar limite".
    const row = toRow({
      ...formatoDeOitoTimes,
      teams_count: undefined,
      players_per_team: undefined,
    });
    expect(row.max_players).toBe(0);
    expect(row.max_waitlist_players).toBe(0);
  });
});
