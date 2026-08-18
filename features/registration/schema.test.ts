import { describe, it, expect } from "vitest";
import { makeRegistrationSchema } from "./schema";

const groups = [
  { label: "IASD Campolim", requires_invite_code: false },
  { label: "Convidado Autorizado", requires_invite_code: true },
];

function base(overrides: Record<string, unknown> = {}) {
  return {
    championship_slug: "copa-2026",
    cpf: "529.982.247-25",
    name: "Fulano de Tal",
    shirt_name: "Fulano",
    shirt_size: "M",
    email: "a@b.com",
    whatsapp: "15999999999",
    birth_date: "1990-05-30",
    birth_state: "São Paulo (SP)",
    instagram: "",
    preferred_position: "Atacante",
    height: 1.8,
    weight: 80,
    group_affiliation: "IASD Campolim",
    invite_code: "",
    skills: { visao: 3, controle: 4, finalizacao: 2, velocidade: 5, desarme: 3, drible: 3 },
    extra_tickets_count: 0,
    profile_photo_link: "https://x/y.jpg",
    payment_receipt_link: "",
    legal_authorization_link: "",
    ...overrides,
  };
}

describe("makeRegistrationSchema", () => {
  const schema = makeRegistrationSchema(groups, 4);

  it("accepts a valid adult line-player payload", () => {
    expect(schema.safeParse(base()).success).toBe(true);
  });

  it("rejects an invalid CPF", () => {
    expect(schema.safeParse(base({ cpf: "111.111.111-11" })).success).toBe(false);
  });

  it("requires the profile photo", () => {
    expect(schema.safeParse(base({ profile_photo_link: "" })).success).toBe(false);
  });

  it("requires an invite code for a group that demands one", () => {
    const r = schema.safeParse(base({ group_affiliation: "Convidado Autorizado", invite_code: "" }));
    expect(r.success).toBe(false);
  });

  it("accepts the invite code when provided", () => {
    const r = schema.safeParse(base({ group_affiliation: "Convidado Autorizado", invite_code: "ABC123" }));
    expect(r.success).toBe(true);
  });

  it("requires legal authorization for a minor", () => {
    const r = schema.safeParse(base({ birth_date: "2012-01-01", legal_authorization_link: "" }));
    expect(r.success).toBe(false);
  });

  it("rejects skill ratings out of 1..5", () => {
    const r = schema.safeParse(base({ skills: { visao: 9, controle: 4, finalizacao: 2, velocidade: 5, desarme: 3, drible: 3 } }));
    expect(r.success).toBe(false);
  });

  it("rejects a line player missing a required skill", () => {
    const bad = base();
    delete (bad.skills as Record<string, number>).drible;
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("requires keeper skills for a goalkeeper", () => {
    const r = schema.safeParse(base({ preferred_position: "Goleiro" }));
    // base() supplies line skills, not keeper skills, so a goalkeeper payload must fail
    expect(r.success).toBe(false);
  });

  it("aceita altura e peso com virgula, como vem do teclado brasileiro", () => {
    const r = schema.safeParse(base({ height: "1,80", weight: "70,5" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.height).toBe(1.8);
      expect(r.data.weight).toBe(70.5);
    }
  });

  it("aceita altura e peso com ponto", () => {
    const r = schema.safeParse(base({ height: "1.80", weight: "70.5" }));
    expect(r.success).toBe(true);
  });

  it("reprova peso que nao e numero, apontando o campo", () => {
    const r = schema.safeParse(base({ weight: "abc" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "weight")).toBe(true);
  });

  it("exige o tamanho da camiseta", () => {
    const semTamanho = base();
    delete (semTamanho as Record<string, unknown>).shirt_size;
    expect(schema.safeParse(semTamanho).success).toBe(false);
  });

  it("reprova um tamanho fora da grade, apontando o campo", () => {
    const r = schema.safeParse(base({ shirt_size: "XG" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "shirt_size")).toBe(true);
  });

  it("aceita cada um dos tamanhos oferecidos", () => {
    for (const tamanho of ["P", "M", "G", "GG", "Personalizado"]) {
      expect(schema.safeParse(base({ shirt_size: tamanho })).success).toBe(true);
    }
  });

  it("aceita ingressos extras ate o teto", () => {
    expect(schema.safeParse(base({ extra_tickets_count: 4 })).success).toBe(true);
  });

  it("reprova acima do teto, apontando o campo", () => {
    const r = schema.safeParse(base({ extra_tickets_count: 5 }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "extra_tickets_count")).toBe(true);
  });

  it("aceita zero ingressos extras", () => {
    expect(schema.safeParse(base({ extra_tickets_count: 0 })).success).toBe(true);
  });
});
