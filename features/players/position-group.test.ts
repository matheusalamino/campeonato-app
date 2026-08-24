import { describe, it, expect } from "vitest";
import { CANONICAL_POSITIONS } from "./position";
import { normalizePositionGroup } from "./position-group";

/**
 * Teste de COMPORTAMENTO, e nao de texto-fonte.
 *
 * `features/**` esta no `include` do vitest.config.ts, e o modulo e funcao pura
 * sem Supabase no caminho — entao aqui da para chamar a funcao de verdade, em
 * vez de ler o arquivo e casar regex como os testes de fiacao vizinhos fazem
 * com o que mora em `app/**`.
 */

/**
 * Um codigo de linha qualquer, tirado do enum em vez de citado a mao.
 *
 * A politica do loop logo abaixo vale para os insumos tambem: `ZAG` escrito na
 * unha envelhece junto com o catalogo, e um dia vira o nome de nada.
 */
const UM_CODIGO_DE_LINHA = CANONICAL_POSITIONS.filter((c) => c !== "GOL")[0];

describe("normalizePositionGroup", () => {
  it("GOL e o goleiro", () => {
    expect(normalizePositionGroup("GOL")).toBe("goalkeeper");
  });

  it("todo canonico que nao e GOL e jogador de linha", () => {
    // Varre a lista do enum em vez de citar ZAG/MEI/ATA a mao: codigo canonico
    // novo que nao seja goleiro entra nesta assertiva sozinho.
    for (const codigo of CANONICAL_POSITIONS) {
      if (codigo === "GOL") continue;
      expect(normalizePositionGroup(codigo)).toBe("line");
    }
  });

  it("ausencia de posicao e um terceiro desfecho, e nao linha", () => {
    // O `unknown` NAO pode colapsar em `line`: a regra da troca do leilao compara
    // os grupos de DOIS jogadores, e jogador sem posicao viraria par valido de um
    // jogador de linha.
    for (const vazio of [null, undefined, "", "   ", "\t\n"]) {
      expect(normalizePositionGroup(vazio)).toBe("unknown");
    }
  });

  it("jogador sem posicao nao forma par com jogador de linha", () => {
    // A conta que o chamador faz, escrita como o chamador a escreve.
    expect(normalizePositionGroup(null)).not.toBe(
      normalizePositionGroup(UM_CODIGO_DE_LINHA),
    );
  });

  it("a palavra Goleiro NAO e mais reconhecida como goleiro", () => {
    // Esta e a assertiva que prende a remocao da metade morta. Desde a
    // 20260821010000 a CHECK de `players.preferred_position` so aceita
    // GOL/ZAG/MEI/ATA ou NULL, e os dois chamadores leem essa coluna — a palavra
    // nao chega mais aqui. Devolver o `includes("goleiro")` reprova este teste.
    expect(normalizePositionGroup("Goleiro")).not.toBe("goalkeeper");
    expect(normalizePositionGroup("goleiro")).not.toBe("goalkeeper");
    expect(normalizePositionGroup(" goleiro ")).not.toBe("goalkeeper");
  });

  it("o que esta fora do enum e desconhecido, e nao jogador de linha", () => {
    // Decisao do usuario em 2026-08-22: falha FECHADA. Valor que o sistema nao
    // entende nao vira afirmacao positiva sobre o jogador.
    const foraDoEnum = ["Goleiro", "Zagueiro", "Meia", "Atacante", "Fixo", "???"];
    for (const fora of foraDoEnum) {
      expect(normalizePositionGroup(fora)).toBe("unknown");
    }
  });

  it("goleiro escrito por extenso nao forma par com jogador de linha", () => {
    // A CONSEQUENCIA DE DOMINIO, e a razao de a mudanca existir. Os dois
    // chamadores liberam a troca por igualdade de grupo
    // (`auction-fiscal/page.tsx:191-197` e `apply-transfer/route.ts:181`). Com a
    // palavra caindo em `line`, um goleiro nao convertido casava com um jogador
    // de linha em codigo e a troca passava. Agora ela e barrada.
    expect(normalizePositionGroup("Goleiro")).not.toBe(
      normalizePositionGroup(UM_CODIGO_DE_LINHA),
    );
  });

  it("espaco e caixa nao mudam o desfecho", () => {
    // Esta tolerancia NAO e a metade morta: o original ja fazia trim e comparava
    // em minuscula. Some junto com ela se ninguem prender.
    for (const bruto of [" GOL ", "gol", "Gol", "\tGOL\n"]) {
      expect(normalizePositionGroup(bruto)).toBe("goalkeeper");
    }
    expect(normalizePositionGroup(` ${UM_CODIGO_DE_LINHA.toLowerCase()} `)).toBe(
      "line",
    );
  });
});
