import { describe, it, expect } from "vitest";
import { baseChampionshipObject } from "./schema";
import { toRow } from "./row";

// Amostra completa: um valor para cada campo do schema do formulario, para
// garantir que toRow() de fato usa (e nao ignora) cada um deles.
const sampleValues = {
  name: "Copa Interna",
  season: "2026",
  description: "Regulamento",
  registration_start_date: new Date("2026-02-01"),
  registration_end_date: new Date("2026-03-01"),
  gala_night_date: new Date("2026-03-10"),
  tournament_start_date: new Date("2026-04-01"),
  max_players: 20,
  max_waitlist_players: 5,
  max_extra_tickets: 4,
  status: "active",
  registration_image_url: "https://example.com/img.png",
  base_price: 50,
  extra_ticket_price: 10,
  pix_key: "chave@pix.com",
  pix_merchant_name: "Fulano",
  pix_merchant_city: "Sorocaba",
  registration_group_options: [{ label: "Grupo A", requires_invite_code: false }],
};

describe("toRow", () => {
  it("grava no banco toda coluna que existe no schema do formulario", () => {
    // Deriva as chaves esperadas do proprio schema, em vez de uma lista
    // escrita a mao — uma lista a mao teria o mesmo problema de manutencao
    // que fez max_extra_tickets ficar de fora do toRow original.
    const formKeys = Object.keys(baseChampionshipObject.shape);

    const row = toRow(sampleValues);
    const rowKeys = new Set(Object.keys(row));

    const missing = formKeys.filter((key) => !rowKeys.has(key));

    expect(
      missing,
      `Colunas do schema do formulario ausentes no row gravado no banco: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
