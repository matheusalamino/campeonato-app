import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_POSITIONS,
  POSITION_ALIASES,
  normalizePreferredPosition,
  type CanonicalPosition,
} from "./position";
import { semComentarioSql } from "@/features/testing/sem-comentario";

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

  // Vocabulario de futsal. NAO existe em dado real: producao (80) e staging (82)
  // estao 100% canonicos, medido em 2026-08-21. Vinha do seed local, ja alinhado.
  // Fica coberto porque o CSV de import aceita celula arbitraria.
  it("converte o vocabulario de futsal para canonico", () => {
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
    expect(pos("LAT")).toBe("Meia");
  });

  it("converte as palavras largas que a CHECK nao aceita", () => {
    expect(pos("Volante")).toBe("Meia");
    expect(pos("Lateral")).toBe("Meia");
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

  // O teste que amarra a funcao a constraint. Itera a TABELA de aliases, e nao um
  // corpus escrito a mao: com corpus, um alias novo cuja chave ninguem listou
  // aqui passava batido, e quem pegava de fato era o `tsc` pelo
  // `Record<string, CanonicalPosition>`. Agora a afirmacao e verdadeira no teste.
  it("NENHUM alias da tabela produz valor fora do enum", () => {
    const permitido: (CanonicalPosition | null)[] = [...CANONICAL_POSITIONS, null];
    const chaves = Object.keys(POSITION_ALIASES);
    expect(chaves.length).toBeGreaterThan(10);
    for (const chave of chaves) {
      expect(permitido).toContain(normalizePreferredPosition(chave).position);
      // E o alias nao pode virar null: chave da tabela tem de mapear.
      expect(normalizePreferredPosition(chave).position).not.toBeNull();
    }
    for (const valor of Object.values(POSITION_ALIASES)) {
      expect(CANONICAL_POSITIONS).toContain(valor);
    }
  });

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

  // O seed local mentiu para o coordenador em TRES medicoes: ele reportou
  // vocabulario de futsal como se fosse producao, e o plano inteiro nasceu com o
  // alcance errado por causa disso. Producao e staging sempre tiveram so os
  // quatro canonicos (medido em 2026-08-21). Esta assertiva existe para o seed
  // nao voltar a divergir do mundo em silencio.
  it("o seed local usa SO vocabulario canonico", () => {
    const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

    // A coluna de posicao do CTE `player_seed`, e nao qualquer string do arquivo.
    const posicoes = [
      ...seed.matchAll(/'60000000-[0-9a-f-]+'[^\n]*?'([A-Za-zÀ-ÿ ]+)',\s*\d+\)/g),
    ].map((m) => m[1]);

    expect(posicoes.length).toBeGreaterThan(0);
    const distintas = [...new Set(posicoes)].sort();
    expect(distintas).toEqual([...CANONICAL_POSITIONS].sort());

    // E toda uma delas normaliza para si mesma: o seed nao depende da traducao.
    for (const p of distintas) {
      expect(normalizePreferredPosition(p).position).toBe(p);
    }
  });

  // Esta e a UNICA rede de vitest sobre esta DDL, e o valor que ela protege e
  // `'Goleiro'` -- o unico que a cota do A6 precisa exato, porque ela conta
  // `Goleiro` contra todo o resto.
  //
  // A versao anterior lia o SQL CRU e casava a PRIMEIRA ocorrencia do texto no
  // arquivo. Mutacao medida que atravessou os 495 testes: apagar `'Goleiro'` da
  // DDL na linha ~124 E deixar um comentario `--` sete linhas acima com a lista
  // velha inteira. O `match` achava a PROSA, comparava a prosa com o codigo, e
  // dava verde sobre uma CHECK que passou a recusar goleiro.
  //
  // Sao duas defesas, e cada uma sozinha nao basta:
  //  - `semComentarioSql` mata o chamariz em comentario;
  //  - a ancora no `ADD CONSTRAINT players_preferred_position_known` mata o
  //    chamariz que NAO e comentario (outra CHECK, um COMMENT ON, uma linha de
  //    exemplo em string), porque prende o casamento ao constraint que importa.
  it("a lista canonica do codigo e exatamente a da CHECK no banco", () => {
    const bruto = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260820010000_capacity_formula_columns.sql"),
      "utf8",
    );
    const sql = semComentarioSql(bruto);
    const m = sql.match(
      /ADD CONSTRAINT\s+players_preferred_position_known[\s\S]*?preferred_position IN \(([^)]*)\)/,
    );
    expect(m).not.toBeNull();
    const doSql = m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...doSql].sort()).toEqual([...CANONICAL_POSITIONS].sort());
  });
});
