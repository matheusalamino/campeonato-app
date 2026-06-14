export type GoalkeeperScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  matchesPlayed: number;
  goalsConceded: number;
  decisiveSaves: number;
  penaltySaves: number;
  mgs: number;
  mdd: number;
  pd: number;
  iog: number;
};
