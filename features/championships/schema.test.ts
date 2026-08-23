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

  it("aceita max_players 0, que passou a significar fechado", () => {
    // Era `rejects max_players <= 0`, e o `.positive()` que o sustentava tinha
    // que cair: zero e o valor que `derivedCapacity` devolve para formato nao
    // configurado, e recusa-lo aqui so deixaria de pe o NULL, que vale
    // ilimitado.
    const r = championshipFormSchema.safeParse({ ...validDraft, max_players: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative max_players", () => {
    const r = championshipFormSchema.safeParse({ ...validDraft, max_players: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects negative waitlist", () => {
    const r = championshipFormSchema.safeParse({
      ...validDraft,
      max_waitlist_players: -1,
    });
    expect(r.success).toBe(false);
  });

  it("requires all dates and the format when status leaves draft", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      max_waitlist_players: 0,
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    // O titulo promete seis campos, entao a assertiva mede os seis. So o
    // `success` nao mede nada disso: qualquer UM dos seis sozinho ja o derruba,
    // e a lista de obrigatorios podia ser cortada pela metade sem este teste
    // piscar.
    const caminhos = r.error.issues.map((i) => i.path.join("."));
    expect(caminhos.sort()).toEqual([
      "gala_night_date",
      "players_per_team",
      "registration_end_date",
      "registration_start_date",
      "teams_count",
      "tournament_start_date",
    ]);
  });

  it("accepts a complete non-draft championship", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "active",
      registration_start_date: "2026-02-01",
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-03-10",
      tournament_start_date: "2026-04-01",
      // O que o publicado exige agora: o formato. O total saiu da lista junto
      // com o campo que o preenchia.
      teams_count: 4,
      players_per_team: 5,
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

describe("id from the database (does not follow RFC 4122 version/variant)", () => {
  // O id da coluna uuid do Postgres pode ter sido fabricado a mao, migrado
  // de outro sistema ou vir de seed — nada disso garante versao 1-8 no
  // terceiro grupo. A validacao so precisa pegar chamada malformada da
  // propria aplicacao, nao atestar conformidade com a RFC.
  const idOutsideRfc = "10000000-0000-0000-0000-000000000001";
  const idV4 = "550e8400-e29b-41d4-a716-446655440000";

  it("updateChampionshipSchema accepts an id outside the RFC (version zero)", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: idOutsideRfc });
    expect(r.success).toBe(true);
  });

  it("statusChangeSchema accepts an id outside the RFC (version zero)", () => {
    const r = statusChangeSchema.safeParse({
      id: idOutsideRfc,
      from: "subscribing",
      to: "rest",
    });
    expect(r.success).toBe(true);
  });

  it("still accepts a normal v4 uuid", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: idV4 });
    expect(r.success).toBe(true);
  });

  it("still accepts uppercase hex", () => {
    // Mata o mutante que remove a flag `i`.
    const r = updateChampionshipSchema.safeParse({
      ...validDraft,
      id: "550E8400-E29B-41D4-A716-446655440000",
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["abc"],
    ["nao-e-uuid"],
    ["10000000-0000-0000-0000-00000000000"], // ultimo grupo com 11 digitos
  ])("still rejects text that is not a uuid: %s", (invalid) => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: invalid });
    expect(r.success).toBe(false);
  });

  it.each([
    [" 550e8400-e29b-41d4-a716-446655440000"], // espaco antes, mata o `^`
    ["550e8400-e29b-41d4-a716-446655440000 "], // espaco depois, mata o `$`
    ["550e8400e29b41d4a716446655440000"], // 32 hex sem hifens
    ["550e84000-e29b-41d4-a716-446655440000"], // grupo 1 com um digito a mais, mata os `{n,}`
    ["550e840g-e29b-41d4-a716-446655440000"], // `g` fora do hexadecimal, mata a classe ampliada
    [""], // string vazia
  ])("rejects shapes a loosened regex could let through: %s", (invalid) => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: invalid });
    expect(r.success).toBe(false);
  });

  it("points the error at the id field, not at the form root", () => {
    const r = updateChampionshipSchema.safeParse({ ...validDraft, id: "nao-e-uuid" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const idIssue = r.error.issues.find((issue) => issue.path[0] === "id");
      expect(idIssue).toBeDefined();
      expect(idIssue?.message).toBe("Id inválido");
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

describe("championshipFormSchema: a capacidade vem do formato", () => {
  it("campeonato fora de draft exige o formato, e nao mais o total digitado", () => {
    const r = championshipFormSchema.safeParse({
      name: "Copa",
      status: "subscribing",
      registration_start_date: "2026-02-01",
      registration_end_date: "2026-03-01",
      gala_night_date: "2026-03-10",
      tournament_start_date: "2026-04-01",
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    const caminhos = r.error.issues.map((i) => i.path.join("."));
    expect(caminhos).toContain("teams_count");
    expect(caminhos).toContain("players_per_team");
    // A outra metade da frase, e a que morde: `max_players` virou SAIDA, e nao
    // entrada — `toRow` descarta o que vier nele. O input continua na tela, mas
    // exigi-lo aqui recusaria quem o deixasse em branco por um numero que nao e
    // mais lido.
    expect(caminhos).not.toContain("max_players");
  });
});

describe("championshipFormSchema: formato preenchido tem de render vaga", () => {
  const datas = {
    registration_start_date: "2026-02-01",
    registration_end_date: "2026-03-01",
    gala_night_date: "2026-03-10",
    tournament_start_date: "2026-04-01",
  };

  it("recusa `subscribing` com formato ZERADO — o segundo caminho para o mesmo defeito", () => {
    // MEDIDO antes desta regra existir: este payload PASSAVA, `toRow` gravava
    // `max_players: 0`, e a RPC devolvia `full` para toda inscricao. A guarda de
    // `changeChampionshipStatus` podia ser contornada sem sair da tela — bastava
    // criar ou salvar o campeonato ja em `subscribing`.
    const r = createChampionshipSchema.safeParse({
      name: "Copa",
      status: "subscribing",
      ...datas,
      teams_count: 0,
      players_per_team: 10,
    });
    expect(r.success).toBe(false);
    if (r.success) return;

    const caminhos = r.error.issues.map((i) => i.path.join("."));
    // Nos DOIS campos: o produto e de ambos.
    expect(caminhos).toContain("teams_count");
    expect(caminhos).toContain("players_per_team");
  });

  it("recusa o produto que ESTOURA int4, com os dois campos positivos", () => {
    // 3000 x 800000 da 2,4 bilhoes: finito, inteiro e positivo, e maior que
    // int4 — `boundedInt` o devolve como 0. Checar campo a campo em vez do total
    // derivado deixaria exatamente este passar.
    const r = createChampionshipSchema.safeParse({
      name: "Copa",
      status: "subscribing",
      ...datas,
      teams_count: 3000,
      players_per_team: 800000,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.path.join("."))).toContain("teams_count");
  });

  it("aceita `subscribing` com uma vaga — a guarda mede vaga, nao vaga bastante", () => {
    const r = createChampionshipSchema.safeParse({
      name: "Copa",
      status: "subscribing",
      ...datas,
      teams_count: 1,
      players_per_team: 1,
    });
    expect(r.success).toBe(true);
  });

  it("NAO alcanca os outros status: `completed` legado com formato zerado ainda salva", () => {
    // A fronteira e a mesma da guarda — so `subscribing`. Estende-la travaria a
    // edicao de campeonato antigo, que nao tem inscricao a proteger e cujo
    // formato ninguem nunca preencheu.
    for (const status of ["active", "subscribed", "in_progress", "completed", "rest"]) {
      const r = createChampionshipSchema.safeParse({
        name: "Copa",
        status,
        ...datas,
        teams_count: 0,
        players_per_team: 0,
      });
      expect(r.success, `status ${status} deveria salvar`).toBe(true);
    }
  });

  it("NAO alcanca rascunho meio preenchido", () => {
    const r = createChampionshipSchema.safeParse({
      name: "Copa",
      status: "draft",
      teams_count: 0,
      players_per_team: 0,
    });
    expect(r.success).toBe(true);
  });
});
