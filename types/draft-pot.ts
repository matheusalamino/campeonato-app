export interface DraftPotPlayer {
  id: string;
  name: string;
}

export interface DraftPotRow {
  pot_number: number;
  position: string;
  players: DraftPotPlayer[] | null;
}

export interface DraftPotGrouped {
  pot_number: number;
  position: string;
  players: DraftPotPlayer[];
}
