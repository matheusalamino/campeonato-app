// types/defesas.ts
export type DefesaScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  totalSaves: number;
  penaltySaves: number;
  regularSaves: number;
  byMatch: {
    matchId: string;
    matchName: string;
    phaseName: string;
    count: number;
    penaltyCount: number;
  }[];
};
