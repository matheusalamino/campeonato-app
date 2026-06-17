// Tipos compartilhados das páginas públicas (telão e estatísticas)

export type PublicPlayer = {
  registrationId: string;
  championshipId: string;
  playerName: string;
  officialName: string | null;
  position: string | null;
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
  position: string | null;
  value: number;       // gols, assistências, pontos, IOG...
  detail?: string;     // ex.: "OVR 78"
};

export const POSITION_LABELS: Record<string, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  LAT: "Lateral",
  VOL: "Volante",
  MEI: "Meia",
  ATA: "Atacante",
};

// Maps full-word labels (as stored in DB) back to position codes
const LABEL_TO_CODE: Record<string, string> = {
  Goleiro: "GOL", Zagueiro: "ZAG", Lateral: "LAT",
  Volante: "VOL", Meia: "MEI", Atacante: "ATA",
  // tolerate codes already being codes
  GOL: "GOL", ZAG: "ZAG", LAT: "LAT", VOL: "VOL", MEI: "MEI", ATA: "ATA",
};

export function normalizePosition(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return LABEL_TO_CODE[raw] ?? LABEL_TO_CODE[raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()] ?? raw;
}
