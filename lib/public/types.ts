// Tipos compartilhados das páginas públicas (telão e estatísticas)

import type { CanonicalPosition } from "@/features/players/position";

export type PublicPlayer = {
  registrationId: string;
  championshipId: string;
  playerName: string;
  officialName: string | null;
  // Codigo, nao palavra: vem da view `public_players`, que expoe a coluna com
  // CHECK validada. E o que deixa `POSITION_LABELS[p.position]` compilar.
  position: CanonicalPosition | null;
  photoUrl: string | null;
  finalOverall: number | null;
  championshipTeamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

export type PublicPlayerStats = {
  registrationId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  decisiveSaves: number;
  penaltySaves: number;
  fouls: number;
  matchesPlayed: number;
  minutesPlayed: number;
};

// Entrada genérica de ranking exibida nos pódios/listas
export type RankingEntry = {
  registrationId: string;
  playerName: string;
  teamName: string | null;
  teamLogoUrl: string | null;
  photoUrl: string | null;
  position: CanonicalPosition | null;
  value: number;       // gols, assistências, pontos, IOG...
  detail?: string;     // ex.: "OVR 78"
  isOverride?: boolean;
};

/**
 * Codigo -> palavra por extenso. O UNICO conversor de exibicao do app: e daqui
 * que as telas publicas, os formularios do admin e o wizard de inscricao tiram
 * a palavra que o usuario le.
 *
 * Tipado por `CanonicalPosition`, e nao por `string`, e a diferenca e o que o
 * `tsc` pega: com `Record<string, string>` um codigo novo sem rotulo COMPILAVA
 * e sumia na tela. Agora nao compila.
 *
 * `LAT` e `VOL` sairam porque eram rotulo sem dado possivel. A CHECK
 * `players_preferred_position_known` -- validada, conferida no banco local em
 * 2026-08-22 -- so aceita GOL/ZAG/MEI/ATA ou NULL, entao a coluna nao guarda
 * nenhum dos dois; e as duas telas de filtro montam as opcoes com
 * `Object.entries(POSITION_LABELS)`, ou seja, os dois rendiam botao que nunca
 * casaria com jogador nenhum.
 *
 * Isto NAO revoga os apelidos `lateral`/`volante` de `POSITION_ALIASES`: la e
 * borda de ENTRADA, e o CSV continua recebendo essas palavras de planilha
 * alheia. O que acabou e a pretensao de exibi-las.
 */
export const POSITION_LABELS: Record<CanonicalPosition, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  MEI: "Meia",
  ATA: "Atacante",
};
