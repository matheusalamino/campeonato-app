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
    expect(normalizePositionGroup(null)).not.toBe(normalizePositionGroup("ZAG"));
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

  it("nenhuma palavra por extenso vira goleiro", () => {
    // Contraprova do teste acima pelo outro lado: o que sobra de vocabulario
    // antigo e de planilha cai em `line`, e nao em `goalkeeper`.
    for (const palavra of ["Goleiro", "Zagueiro", "Meia", "Atacante", "Fixo", "Pivo"]) {
      expect(normalizePositionGroup(palavra)).toBe("line");
    }
  });

  it("espaco e caixa nao mudam o desfecho", () => {
    // Esta tolerancia NAO e a metade morta: o original ja fazia trim e comparava
    // em minuscula. Some junto com ela se ninguem prender.
    for (const bruto of [" GOL ", "gol", "Gol", "\tGOL\n"]) {
      expect(normalizePositionGroup(bruto)).toBe("goalkeeper");
    }
    expect(normalizePositionGroup(" zag ")).toBe("line");
  });
});
