// Tipos compartilhados das páginas públicas (telão e estatísticas)

import type { CanonicalPosition } from "@/features/players/position";

export type PublicPlayer = {
  registrationId: string;
  championshipId: string;
  playerName: string;
  officialName: string | null;
  // Codigo, nao palavra. E quem garante NAO e a coluna: a migration que poe a
  // CHECK ainda nao subiu para staging nem producao, e la o banco ainda devolve
  // `Goleiro`. Quem garante e `mapPlayer` (lib/public/map-player.ts), unico
  // produtor deste campo, que normaliza antes de entregar.
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
  // Mesma garantia do `PublicPlayer.position`, e pela mesma via: toda entrada
  // de ranking sai de um `PublicPlayer` ja normalizado, ou nasce `null` (os
  // cartolas, que nao tem posicao).
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
 * `players_preferred_position_known` so aceita GOL/ZAG/MEI/ATA ou NULL: o texto
 * esta em `supabase/migrations/20260821010000_position_vocabulary_codes.sql`, e
 * `features/players/position.test.ts` prende `CANONICAL_POSITIONS` aquele
 * arquivo. Entao a coluna nao guarda nenhum dos dois; e as duas telas de filtro
 * montam as opcoes com `Object.entries(POSITION_LABELS)`, ou seja, os dois
 * rendiam botao que nunca casaria com jogador nenhum.
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
