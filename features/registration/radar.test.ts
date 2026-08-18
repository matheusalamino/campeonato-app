import { describe, it, expect } from "vitest";
import { radarDataFrom, hasAnyRating } from "./radar";
import { LINE_SKILLS, KEEPER_SKILLS } from "./skills";

/** Atalho: mapa de skill -> value, para nao depender da ordem nas asserções. */
function porSkill(pontos: { skill: string; value: number }[]) {
  return Object.fromEntries(pontos.map((p) => [p.skill, p.value]));
}

describe("radarDataFrom", () => {
  it("usa as habilidades de linha para jogador de linha", () => {
    expect(radarDataFrom({}, "Meia").map((p) => p.skill)).toEqual([...LINE_SKILLS]);
  });

  it("usa as habilidades de goleiro para goleiro", () => {
    expect(radarDataFrom({}, "Goleiro").map((p) => p.skill)).toEqual([...KEEPER_SKILLS]);
  });

  it("converte a nota de 1..5 para o dominio 0..100 do radar", () => {
    const v = porSkill(radarDataFrom({ visao: 1, controle: 3, finalizacao: 5 }, "Meia"));
    expect(v.visao).toBe(20);
    expect(v.controle).toBe(60);
    expect(v.finalizacao).toBe(100);
  });

  it("trata habilidade ainda nao avaliada como zero", () => {
    const v = porSkill(radarDataFrom({ visao: 4 }, "Meia"));
    expect(v.visao).toBe(80);
    expect(v.drible).toBe(0);
  });

  it("rotula cada ponto com o nome exibido da habilidade", () => {
    const pontos = radarDataFrom({}, "Meia");
    expect(pontos.find((p) => p.skill === "visao")?.label).toBe("Visão de jogo");
  });

  it("ignora nota que nao pertence a posicao escolhida", () => {
    const pontos = radarDataFrom({ reflexo: 5 }, "Meia");
    expect(pontos.map((p) => p.skill)).not.toContain("reflexo");
  });
});

describe("hasAnyRating", () => {
  it("e falso quando nada foi avaliado", () => {
    expect(hasAnyRating({}, "Meia")).toBe(false);
  });

  it("e verdadeiro na primeira estrela", () => {
    expect(hasAnyRating({ visao: 1 }, "Meia")).toBe(true);
  });

  it("ignora nota sobrada de outra posicao", () => {
    // Quem avaliou como Goleiro e depois virou Meia nao tem nada a mostrar
    // no radar de linha, mesmo com as notas antigas ainda no formulario.
    expect(hasAnyRating({ reflexo: 5 }, "Meia")).toBe(false);
  });
});
