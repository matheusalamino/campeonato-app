import { describe, expect, it } from "vitest";
import { calculateRadar } from "./calculateRadar";
import { KEEPER_SKILLS, LINE_SKILLS } from "@/features/registration/skills";
import { CANONICAL_POSITIONS } from "@/features/players/position";

/**
 * A rede que faltava embaixo de `calculateRadar`.
 *
 * O arquivo chegou ate a task 6 do A8 com um defeito VIVO: escolhia o radar por
 * `position?.toLowerCase().includes(...)` contra a palavra por extenso, e a
 * coluna ja guardava CODIGO — entao todo goleiro recebia as seis habilidades de
 * LINHA. Nada acusava: os dois lados sao `string`, o `tsc` ficava limpo, e
 * nenhum teste chamava esta funcao. O conserto veio em `51e465b`, e a task 6c
 * tirou os dois arrays daqui, passando a escolha para `skillsFor`.
 *
 * O que continuava sem rede era a EXECUCAO. A varredura de vocabulario
 * (`features/players/vocabulary-sweep.test.ts`) le este arquivo como TEXTO:
 * ela pega o literal por extenso de volta, e nada mais. Nem uma media somada no
 * lugar de dividida, nem o mesmo defeito de sempre reescrito so com codigo.
 *
 * MEDIDO, trocando a chamada a `skillsFor` la dentro por
 * `skillsFor(position === "GOL" ? "MEI" : position)` — o defeito original de
 * novo, dito com o helper novo: o `tsc` continua em zero, o lint continua no
 * mesmo numero, e o UNICO arquivo vermelho da suite inteira e este aqui.
 *
 * A variante `skillsFor("MEI")` NAO serve para medir esse silencio, e a
 * diferenca e o que justifica este arquivo: sem o `position` no meio, o
 * parametro fica orfao e o lint o pega sozinho
 * (`@typescript-eslint/no-unused-vars`, medido). A mutacao que engana os outros
 * portoes e a que continua LENDO o `position`.
 *
 * ── POR QUE ESTE ARQUIVO, E NAO OS IRMAOS ──
 *
 * O `include` do vitest alcanca `lib/**`, `features/**` e `scripts/**`, e
 * `app/**` esta fora. Os sitios irmaos do mesmo `if` moram todos la
 * (`EvaluateModal`, `PlayerForm` e `SubscribeForm`), entao so da para varre-los
 * como texto. Este, que mora em `lib/`, e o que da para EXECUTAR.
 *
 * ── POR QUE AS SEIS NAO ESTAO ESCRITAS AQUI ──
 *
 * A task 6c existiu para apagar a copia das listas. Reescreve-las nas
 * assertivas seria cria-la de novo, dentro do teste que existe para mata-la —
 * e uma copia dentro do teste e pior, porque fica VERDE enquanto diverge. Por
 * isso tudo aqui deriva de `LINE_SKILLS`, `KEEPER_SKILLS` e
 * `CANONICAL_POSITIONS`: o que este arquivo prende e a ESCOLHA (quem e goleiro
 * recebe habilidade de goleiro) e a ARITMETICA, e nao quais sao as seis.
 */

/** Atalho: mapa de skill -> value, para nao depender da ordem nas assertivas. */
function porSkill(pontos: { skill: string; value: number }[]) {
  return Object.fromEntries(pontos.map((p) => [p.skill, p.value]));
}

/** Varias notas de organizador para a MESMA habilidade, que e o caso real. */
function notas(skill: string, ...ratings: number[]) {
  return ratings.map((rating) => ({ skill, rating }));
}

// Uma habilidade qualquer de cada lado, tirada da propria lista: os testes de
// aritmetica sao sobre a conta, e nao sobre QUAIS sao as seis.
const [umaDeLinha, outraDeLinha] = LINE_SKILLS;
const [umaDeGoleiro] = KEEPER_SKILLS;

describe("calculateRadar", () => {
  it("monta o radar do goleiro com as habilidades de goleiro", () => {
    // O defeito de `51e465b^` morava exatamente aqui: "GOL" em minuscula nao
    // contem a palavra por extenso, e o goleiro caia no ramo de linha.
    expect(calculateRadar([], "GOL").map((p) => p.skill)).toEqual([
      ...KEEPER_SKILLS,
    ]);
  });

  it("monta o radar de linha para toda posicao que nao e a do goleiro", () => {
    // Percorre o vocabulario declarado, e nao uma lista a parte: posicao nova
    // entra nesta assertiva sozinha.
    for (const posicao of CANONICAL_POSITIONS.filter((p) => p !== "GOL")) {
      expect(calculateRadar([], posicao).map((p) => p.skill)).toEqual([
        ...LINE_SKILLS,
      ]);
    }
  });

  it("converte a nota de 1..5 para o dominio 0..100 do radar", () => {
    const v = porSkill(
      calculateRadar(
        [...notas(umaDeLinha, 1), ...notas(outraDeLinha, 5)],
        "MEI",
      ),
    );

    expect(v[umaDeLinha]).toBe(20);
    expect(v[outraDeLinha]).toBe(100);
  });

  it("tira a media das notas da mesma habilidade", () => {
    // 2 e 4 dao media 3, que vale 60. Somar daria 120, e ficar com a ultima
    // daria 80 — os dois enganos cabem no mesmo `reduce`.
    const v = porSkill(calculateRadar(notas(umaDeLinha, 2, 4), "MEI"));

    expect(v[umaDeLinha]).toBe(60);
  });

  it("arredonda a media que nao cai em valor redondo", () => {
    // 1, 1 e 2 dao media 4/3, que vale 26,66... no dominio do radar. Sem o
    // `Math.round` o radar receberia a dizima, e nao 27.
    const v = porSkill(calculateRadar(notas(umaDeLinha, 1, 1, 2), "MEI"));

    expect(v[umaDeLinha]).toBe(27);
  });

  it("trata habilidade sem nota nenhuma como zero", () => {
    const pontos = calculateRadar(notas(umaDeLinha, 5), "MEI");
    const zeradas = pontos.filter((p) => p.value === 0).map((p) => p.skill);

    expect(zeradas).toEqual(LINE_SKILLS.filter((s) => s !== umaDeLinha));
  });

  it("ignora nota de habilidade que nao pertence a posicao", () => {
    // Quem foi avaliado como goleiro e depois virou de linha nao leva a nota
    // antiga para o radar novo.
    const pontos = calculateRadar(notas(umaDeGoleiro, 5), "MEI");

    expect(pontos.map((p) => p.skill)).not.toContain(umaDeGoleiro);
    expect(pontos.map((p) => p.value)).toEqual(LINE_SKILLS.map(() => 0));
  });
});
