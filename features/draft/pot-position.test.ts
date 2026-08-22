import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { semComentarioSql } from "@/features/testing/sem-comentario";
import { CANONICAL_POSITIONS } from "@/features/players/position";
import { POT_POSITIONS, EXTRA_POT_POSITION } from "./pot-position";

/**
 * O vocabulario do POTE, e a migration que o impoe no banco.
 *
 * ── POR QUE UM VOCABULARIO SO PARA O POTE ──
 *
 * `players.preferred_position` guarda POSICAO: quatro valores, e nada alem.
 * A coluna do pote guarda CATEGORIA DE POTE, que quase sempre e uma posicao e
 * as vezes e o pote `EXT` — para onde `finalize-pot` empurra quem nao foi
 * vendido. `EXT` nao e posicao de ninguem, entao os dois dominios sao
 * DIFERENTES DE PROPOSITO: quatro valores contra cinco.
 *
 * E dai o formato desta suite. O que se prende nao e "sao cinco valores" (uma
 * lista escrita a mao aqui envelheceria junto com o erro), e sim a RELACAO:
 * o vocabulario do pote e o do jogador MAIS exatamente um valor, o `EXT`. No
 * dia em que uma quinta posicao entrar em `CANONICAL_POSITIONS`, esta suite
 * reprova ate a CHECK do pote acompanhar — que e o pedido de olhada humana que
 * um comentario sozinho nao consegue fazer.
 */

const MIGRATION =
  "supabase/migrations/20260821020000_pot_position_codes.sql";

/**
 * As sete colunas, com o nome da CHECK de cada uma.
 *
 * A lista veio de `information_schema.columns` no banco local, e nao de
 * memoria: sao TODAS as colunas de `public` que guardam categoria de pote.
 *
 * As DUAS de `championships` (`draft_auction_pot_position` e
 * `draft_qualification_pot_position`) ficam de fora desta tabela porque nao sao
 * dado do draft, e sim espelho transitorio do pote com a janela aberta agora —
 * NULL quase sempre. Levam conversao e CHECK do mesmo jeito, e o `it` do fim
 * prende as duas coisas.
 */
const COLUNAS = [
  ["draft_pots", "position", "draft_pots_position_known"],
  [
    "draft_balance_transactions",
    "pot_position",
    "draft_balance_transactions_pot_position_known",
  ],
  ["draft_fines", "pot_position", "draft_fines_pot_position_known"],
  [
    "draft_player_purchases",
    "pot_position",
    "draft_player_purchases_pot_position_known",
  ],
  [
    "draft_pot_budgets",
    "pot_position",
    "draft_pot_budgets_pot_position_known",
  ],
  [
    "draft_qualification_bids",
    "pot_position",
    "draft_qualification_bids_pot_position_known",
  ],
  [
    "draft_special_card_uses",
    "pot_position",
    "draft_special_card_uses_pot_position_known",
  ],
] as const;

/** As cinco conversoes que cada UPDATE precisa fazer. */
const CONVERSOES = [
  ["Goleiro", "GOL"],
  ["Zagueiro", "ZAG"],
  ["Meia", "MEI"],
  ["Atacante", "ATA"],
  ["Extra", "EXT"],
] as const;

// Sem comentario ANTES de qualquer assertiva, e isto ja custou caro neste repo:
// uma mutacao de verdade atravessa verde quando a versao boa continua escrita
// logo acima, em `--`. O docblock de `sem-comentario.ts` conta as quatro que
// passaram assim.
const sql = semComentarioSql(
  readFileSync(resolve(process.cwd(), MIGRATION), "utf8"),
);

/** O corpo de um `UPDATE public.<tabela> ...` ate o `;` que o fecha. */
function blocoUpdate(tabela: string): string {
  const m = sql.match(new RegExp(`UPDATE\\s+public\\.${tabela}\\s[^;]*;`));
  if (!m) throw new Error(`UPDATE de ${tabela} nao encontrado`);
  return m[0];
}

describe("o vocabulario do pote", () => {
  it("e o do jogador MAIS exatamente um valor, o pote extra", () => {
    // Calculado, e nao repetido a mao: uma lista literal aqui daria verde no dia
    // em que os dois dominios divergissem por engano.
    expect([...POT_POSITIONS].sort()).toEqual(
      [...CANONICAL_POSITIONS, EXTRA_POT_POSITION].sort(),
    );
  });

  it("o valor a mais e o EXT, e ele NAO e posicao de jogador", () => {
    expect(EXTRA_POT_POSITION).toBe("EXT");
    expect(POT_POSITIONS).toContain(EXTRA_POT_POSITION);
    // O outro lado da mesma moeda: quem "uniformizar" as duas CHECK reprova
    // aqui. As duas sao diferentes de proposito.
    expect(CANONICAL_POSITIONS).not.toContain(
      EXTRA_POT_POSITION as unknown as (typeof CANONICAL_POSITIONS)[number],
    );
  });

  it("cobre as sete colunas, e sete e o que o information_schema mediu", () => {
    // Sentinela do denominador. Sem ela, apagar uma linha da tabela `COLUNAS`
    // deixaria os `it` abaixo verdes medindo seis colunas — e a setima sem
    // CHECK nenhuma no banco.
    expect(COLUNAS.length).toBe(7);
  });
});

describe("a migration do vocabulario do pote", () => {
  for (const [tabela, coluna, constraint] of COLUNAS) {
    it(`converte o dado vivo de ${tabela}.${coluna} antes de constranger`, () => {
      const bloco = blocoUpdate(tabela);
      // As CINCO conversoes, uma a uma. Um `toContain('GOL')` solto passaria
      // com o mapa pela metade, e e justamente meio mapa que faz a CHECK
      // abortar o deploy — em staging sao 539 linhas, entao "quase todas" nao
      // serve.
      for (const [palavra, codigo] of CONVERSOES) {
        expect(bloco).toMatch(
          new RegExp(`WHEN\\s+'${palavra}'\\s+THEN\\s+'${codigo}'`),
        );
      }
      expect(bloco).toContain(coluna);
    });

    it(`constrange ${tabela}.${coluna} ao vocabulario do pote`, () => {
      // Ancorada no NOME da constraint, e nao na primeira ocorrencia do texto:
      // sao sete CHECK quase identicas no mesmo arquivo, e sem a ancora a
      // assertiva da setima leria a expressao da primeira e daria verde sobre
      // uma coluna sem regra.
      const m = sql.match(
        new RegExp(
          `ADD CONSTRAINT\\s+${constraint}[\\s\\S]*?${coluna} IN \\(([^)]*)\\)`,
        ),
      );
      expect(m).not.toBeNull();
      const doSql = m![1]
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, ""))
        .sort();
      expect(doSql).toEqual([...POT_POSITIONS].sort());
    });

    it(`valida ${tabela}.${coluna} na hora, sem NOT VALID`, () => {
      // A propria migration normaliza o dado logo acima, entao validar e de
      // graca. E abortar no deploy e o desfecho BOM: valor que ninguem mapeou
      // precisa aparecer AGORA, e nao meses depois num UPDATE que nem toca em
      // posicao.
      const m = sql.match(
        new RegExp(`ADD CONSTRAINT\\s+${constraint}[\\s\\S]*?;`),
      );
      expect(m).not.toBeNull();
      expect(m![0]).not.toMatch(/NOT\s+VALID/i);
    });
  }

  it("converte E constrange o espelho transitorio do pote em championships", () => {
    // Duas colunas que a lista das sete NAO cobre, e que quebrariam calado: os
    // routes procuram o pote com `.eq("position", potPosition)` usando o valor
    // guardado ai. Convertido `draft_pots` e nao o espelho, uma janela aberta
    // durante o deploy passa a apontar para pote nenhum.
    //
    // Levam CHECK porque o PRODUTOR NAO VALIDA. Quem confere o valor contra
    // `draft_pots` e o route; `set_draft_auction_state` tem
    // `GRANT EXECUTE ... TO authenticated` e so faz `trim` no argumento, entao
    // qualquer admin ou fiscal grava por cima do route. Promessa nao e
    // garantia.
    const bloco = blocoUpdate("championships");
    for (const [palavra, codigo] of CONVERSOES) {
      expect(bloco).toMatch(
        new RegExp(`WHEN\\s+'${palavra}'\\s+THEN\\s+'${codigo}'`),
      );
    }

    for (const coluna of [
      "draft_auction_pot_position",
      "draft_qualification_pot_position",
    ]) {
      expect(bloco).toContain(coluna);

      const m = sql.match(
        new RegExp(
          `ADD CONSTRAINT\\s+championships_${coluna}_known[\\s\\S]*?${coluna} IN \\(([^)]*)\\)`,
        ),
      );
      expect(m).not.toBeNull();
      const doSql = m![1]
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, ""))
        .sort();
      expect(doSql).toEqual([...POT_POSITIONS].sort());
    }
  });
});
