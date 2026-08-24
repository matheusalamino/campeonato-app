import { describe, expect, it } from "vitest";
import { POSITION_LABELS } from "@/lib/public/types";
import { CANONICAL_POSITIONS } from "@/features/players/position";

describe("o rotulo cobre o enum, e nada alem", () => {
  it("todo codigo do enum tem rotulo", () => {
    // Sem esta amarra, acrescentar um codigo sem rotulo COMPILA e some na tela.
    for (const codigo of CANONICAL_POSITIONS) {
      expect(POSITION_LABELS[codigo]).toBeTruthy();
    }
  });

  it("nenhum rotulo sobra fora do enum", () => {
    // LAT e VOL sairam: nunca tiveram uma linha de dado nos tres ambientes, e
    // alimentavam duas opcoes permanentemente vazias no filtro publico.
    expect(Object.keys(POSITION_LABELS).sort()).toEqual([...CANONICAL_POSITIONS].sort());
  });

  it("o rotulo e a palavra por extenso", () => {
    expect(POSITION_LABELS.GOL).toBe("Goleiro");
    expect(POSITION_LABELS.ZAG).toBe("Zagueiro");
    expect(POSITION_LABELS.MEI).toBe("Meia");
    expect(POSITION_LABELS.ATA).toBe("Atacante");
  });
});
