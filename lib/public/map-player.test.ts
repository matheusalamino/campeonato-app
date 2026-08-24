import { describe, expect, it } from "vitest";
import { mapPlayer } from "@/lib/public/map-player";

// Uma linha plausivel da view, para o teste falar so da posicao.
function linha(position: unknown) {
  return {
    registration_id: "r1",
    championship_id: "c1",
    player_name: "Fulano",
    official_name: null,
    position,
    photo_url: null,
    final_overall: null,
    championship_team_id: null,
    team_name: null,
    team_logo_url: null,
  };
}

describe("a fronteira do public_players normaliza a posicao", () => {
  // O teste que existe por causa de staging e producao: a migration
  // 20260821010000 ainda nao subiu la, e a coluna ainda guarda a PALAVRA.
  // Copiar `r.position` faria o tipo `CanonicalPosition` mentir, e o filtro de
  // posicao (que compara com as chaves de POSITION_LABELS, codigos) pararia de
  // casar com qualquer jogador.
  it("a palavra crua da coluna vira codigo", () => {
    expect(mapPlayer(linha("Goleiro")).position).toBe("GOL");
    expect(mapPlayer(linha("Zagueiro")).position).toBe("ZAG");
    expect(mapPlayer(linha("Meia")).position).toBe("MEI");
    expect(mapPlayer(linha("Atacante")).position).toBe("ATA");
  });

  it("o codigo que ja e codigo passa por identidade", () => {
    expect(mapPlayer(linha("GOL")).position).toBe("GOL");
    expect(mapPlayer(linha("ATA")).position).toBe("ATA");
  });

  // Null e aceito pela CHECK, e a permissividade e load-bearing:
  // `scripts/test-registration-slots.sh` insere jogador so com cpf e nome.
  it("posicao ausente continua null", () => {
    expect(mapPlayer(linha(null)).position).toBeNull();
    expect(mapPlayer(linha(undefined)).position).toBeNull();
    expect(mapPlayer(linha("")).position).toBeNull();
  });

  // O tipo promete `CanonicalPosition | null`. Vocabulario que ninguem
  // reconhece tem de virar null, e NAO vazar a palavra crua para dentro de um
  // campo que se diz canonico.
  it("vocabulario desconhecido vira null, e nao a palavra crua", () => {
    expect(mapPlayer(linha("Arqueiro")).position).toBeNull();
    expect(mapPlayer(linha("LAT")).position).toBe("MEI");
  });

  it("o resto da linha continua sendo copiado", () => {
    const p = mapPlayer({ ...linha("GOL"), player_name: "Beltrano", final_overall: "78" });
    expect(p.playerName).toBe("Beltrano");
    expect(p.finalOverall).toBe(78);
    expect(p.registrationId).toBe("r1");
  });
});
