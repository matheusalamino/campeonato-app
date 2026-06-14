export type GoalScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  goals: number;
  regularGoals: number;
  penaltyGoals: number;
};

export type AssistScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  assists: number;
};
