export type VoterRole = 'home_manager' | 'away_manager' | 'referee';

export type ExistingVote = {
  voterRole: VoterRole;
  registrationId: string;
};

export type VoteDetail = {
  matchId: string;
  matchName: string;
  phaseName: string;
  voterRole: VoterRole;
  points: number;
};

export type PlayerScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  totalPoints: number;
  votes: VoteDetail[];
};

export type ManagerVoteDetail = {
  matchId: string;
  matchName: string;
  phaseName: string;
  points: number;
};

export type ManagerScore = {
  championshipTeamId: string;
  teamName: string;
  managerName: string | null;
  managerPhoto: string | null;
  totalPoints: number;
  votes: ManagerVoteDetail[];
};
