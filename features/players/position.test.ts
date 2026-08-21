import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_POSITIONS,
  normalizePreferredPosition,
  type CanonicalPosition,
} from "./position";

/** Atalho: so o valor canonico, para as tabelas de caso abaixo. */
const pos = (raw: string | null | undefined) =>
  normalizePreferredPosition(raw).position;

describe("normalizePreferredPosition", () => {
  it("passa os quatro canonicos por identidade", () => {
    for (const canonical of CANONICAL_POSITIONS) {
      expect(pos(canonical)).toBe(canonical);
      expect(normalizePreferredPosition(canonical).kind).toBe("mapped");
    }
  });

  // O vocabulario dos 64 jogadores que ja estao no banco. MEDIDO em
  // 2026-08-20: Fixo 16, Ala Esquerda 16, Ala Direita 16, Pivo 8, Goleiro 8.
  it("converte o futsal dos 64 atuais para canonico", () => {
    expect(pos("Fixo")).toBe("Zagueiro");
    expect(pos("Ala Esquerda")).toBe("Meia");
    expect(pos("Ala Direita")).toBe("Meia");
    expect(pos("Pivo")).toBe("Atacante");
    expect(pos("Goleiro")).toBe("Goleiro");
  });

  it("converte os seis codigos de lib/public/types.ts", () => {
    expect(pos("GOL")).toBe("Goleiro");
    expect(pos("ZAG")).toBe("Zagueiro");
    expect(pos("MEI")).toBe("Meia");
    expect(pos("ATA")).toBe("Atacante");
    expect(pos("VOL")).toBe("Meia");
    expect(pos("LAT")).toBe("Zagueiro");
  });

  it("converte as palavras largas que a CHECK nao aceita", () => {
    expect(pos("Volante")).toBe("Meia");
    expect(pos("Lateral")).toBe("Zagueiro");
  });

  // O caso que a CHECK rejeitaria e que a cota contaria errado: um goleiro
  // com espaco sobrando na celula nao e goleiro para `=== "Goleiro"`.
  it("tolera espaco sobrando e caixa trocada", () => {
    expect(pos("  goleiro  ")).toBe("Goleiro");
    expect(pos("GOLEIRO")).toBe("Goleiro");
    expect(pos("gOlEiRo")).toBe("Goleiro");
    expect(pos(" Ala  Esquerda ")).toBe("Meia");
  });

  it("tolera acento e separador que a planilha manda", () => {
    expect(pos("Pivô")).toBe("Atacante");
    expect(pos("pivô")).toBe("Atacante");
    expect(pos("Ala-Esquerda")).toBe("Meia");
    expect(pos("ala_direita")).toBe("Meia");
  });

  // `-` entra aqui, e nao no grupo do desconhecido: em planilha o traco e o
  // marcador de "nada aqui", entao ele significa "nao informado" — que e
  // exatamente o que null modela. Reprovar a linha por causa de um traco
  // reprovaria planilha bem preenchida.
  it("celula vazia, traco e ausencia viram null, com kind empty", () => {
    for (const blank of ["", "   ", "-", "--", " - ", null, undefined]) {
      const r = normalizePreferredPosition(blank);
      expect(r.kind).toBe("empty");
      expect(r.position).toBeNull();
    }
  });

  it("desconhecido nao virou valor inventado: null + kind unrecognized", () => {
    for (const junk of ["Arqueiro", "Goleir0", "ZAGUEIR", "n/a", "7"]) {
      const r = normalizePreferredPosition(junk);
      expect(r.kind).toBe("unrecognized");
      expect(r.position).toBeNull();
      if (r.kind === "unrecognized") expect(r.raw).toBe(junk);
    }
  });

  // O teste que amarra a funcao a constraint. Sem ele, alguem acrescenta um
  // mapeamento novo com valor fora do enum e descobre em producao.
  it("NENHUMA saida escapa dos quatro valores ou de null", () => {
    const corpus = [
      ...CANONICAL_POSITIONS,
      "Fixo", "Ala Esquerda", "Ala Direita", "Pivo", "Pivô", "Ala",
      "GOL", "ZAG", "MEI", "ATA", "VOL", "LAT",
      "Volante", "Lateral", "  goleiro  ", "GOLEIRO", "ala_direita",
      "Ala-Esquerda", "", "   ", "-", "Arqueiro", "lixo", "42",
      null, undefined,
    ];
    const permitido: (CanonicalPosition | null)[] = [...CANONICAL_POSITIONS, null];
    for (const raw of corpus) {
      expect(permitido).toContain(normalizePreferredPosition(raw).position);
    }
  });

  it("a lista canonica do codigo e exatamente a da CHECK no banco", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260820010000_capacity_formula_columns.sql"),
      "utf8",
    );
    const m = sql.match(/preferred_position IN \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const doSql = m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...doSql].sort()).toEqual([...CANONICAL_POSITIONS].sort());
  });
});
