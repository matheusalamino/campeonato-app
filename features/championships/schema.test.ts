import { describe, it, expect } from "vitest";
import {
  championshipFormSchema,
  createChampionshipSchema,
  updateChampionshipSchema,
  statusChangeSchema,
} from "./schema";

const validDraft = {
  name: "Copa Interna",
  status: "draft" as const,
  max_waitlist_players: 0,
};

describe("championshipFormSchema", () => {
  it("accepts a minimal draft with only a name", () => {
    const r = championshipFormSchema.safeParse(validDraft);
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, name: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects registration_start on/after registration_end", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_start_date: "2026-03-10",
      registration_end_date: "2026-03-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects registration_end on/after tournament_start", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_end_date: "2026-04-01",
      tournament_start_date: "2026-03-20",
    });
    expect(r.success).toBe(false);
  });

  it("rejects gala_night outside the registration_end..tournament_start window", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-02-20",
      tournament_start_date: "2026-04-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects max_players <= 0", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, max_players: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects negative waitlist", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      max_waitlist_players: -1,
    });
    expect(r.success).toBe(false);
  });

  it("requires all dates and max_players when status leaves draft", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      max_waitlist_players: 0,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a complete non-draft championship", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      registration_start_date: "2026-02-01",
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-03-10",
      tournament_start_date: "2026-04-01",
      max_players: 20,
      max_waitlist_players: 5,
    });
    expect(r.success).toBe(true);
  });
});

describe("championshipFormSchema: pix_key", () => {
  // O teto vem do BR Code, nao de gosto: o campo 26 cabe 99 bytes, dos quais 18
  // sao o GUI e 4 o cabecalho da propria chave. Uma chave maior faz o campo 26
  // declarar o tamanho em tres digitos e o QR sai malformado, em silencio.
  const NO_TETO = "u".repeat(62) + "@dominio.com.br"; // 77 bytes

  it("accepts a pix_key at the limit the QR Code allows", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, pix_key: NO_TETO });
    expect(r.success).toBe(true);
  });

  it("rejects a pix_key one byte over the limit", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, pix_key: `u${NO_TETO}` });
    expect(r.success).toBe(false);
  });

  it("says why, instead of failing without a message", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, pix_key: `u${NO_TETO}` });
    expect(r.success).toBe(false);
    if (r.success) return;
    // Sem isto, uma mensagem engolida pela uniao do `.or(z.literal(""))`
    // passaria no teste acima e deixaria o admin sem saber o que corrigir.
    const naChave = r.error.issues.filter((i) => i.path[0] === "pix_key");
    expect(naChave.length).toBeGreaterThan(0);
    expect(JSON.stringify(naChave)).toContain("77");
  });

  it("measures the limit in bytes, not characters", () => {
    // 70 cedilhas sao 70 caracteres e 140 bytes: cabe contando caractere,
    // estoura contando byte — que e como o leitor do QR conta.
    const r = championshipFormSchema.safeParse({ ...validDraft, pix_key: "ç".repeat(70) });
    expect(r.success).toBe(false);
  });

  it("holds on the server path too, not only in the form", () => {
    // O formulario e contornavel: quem posta direto na server action passa
    // pelo create/update, e nao pelo championshipFormSchema da tela.
    const longa = `u${NO_TETO}`;
    expect(createChampionshipSchema.safeParse({ ...validDraft, pix_key: longa }).success).toBe(false);
    expect(
      updateChampionshipSchema.safeParse({
        ...validDraft,
        id: "550e8400-e29b-41d4-a716-446655440000",
        pix_key: longa,
      }).success,
    ).toBe(false);
  });

  it("still accepts an empty pix_key", () => {
    // O campo e opcional: um campeonato sem cobranca nao configura PIX.
    for (const pix_key of ["", "   "]) {
      expect(championshipFormSchema.safeParse({ ...validDraft, pix_key }).success).toBe(true);
    }
  });
});

describe("id vindo do banco (nao segue a RFC 4122 de versao/variante)", () => {
  // O id da coluna uuid do Postgres pode ter sido fabricado a mao, migrado
  // de outro sistema ou vir de seed — nada disso garante versao 1-8 no
  // terceiro grupo. A validacao so precisa pegar chamada malformada da
  // propria aplicacao, nao atestar conformidade com a RFC.
  const idForaDaRfc = "10000000-0000-0000-0000-000000000001";
  const idV4 = "550e8400-e29b-41d4-a716-446655440000";

  it("updateChampionshipSchema aceita id fora da RFC (versao zero)", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: idForaDaRfc });
    expect(r.success).toBe(true);
  });

  it("statusChangeSchema aceita id fora da RFC (versao zero)", () => {
    const r = statusChangeSchema.safeParse({
      id: idForaDaRfc,
      from: "subscribing",
      to: "rest",
    });
    expect(r.success).toBe(true);
  });

  it("continua aceitando um uuid v4 normal", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: idV4 });
    expect(r.success).toBe(true);
  });

  it.each([
    ["abc"],
    ["nao-e-uuid"],
    ["10000000-0000-0000-0000-00000000000"], // ultimo grupo com 11 digitos
  ])("continua rejeitando texto que nao e uuid: %s", (invalid) => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: invalid });
    expect(r.success).toBe(false);
  });

  it("aponta o erro no campo id, nao na raiz do formulario", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: "nao-e-uuid" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((issue) => issue.path[0] === "id")).toBe(true);
    }
  });
});

describe("statusChangeSchema", () => {
  it("rejects changing to the same status", () => {
    const r = statusChangeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      from: "subscribing",
      to: "subscribing",
    });
    expect(r.success).toBe(false);
  });
  it("accepts any distinct status change (including a jump)", () => {
    const r = statusChangeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      from: "completed",
      to: "draft",
    });
    expect(r.success).toBe(true);
  });
});
