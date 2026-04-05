export type DraftPlayer = {
  id: string;
  overall: number;
  position: string;
};

export type DraftPotInsert = {
  championship_id: string;
  player_id: string;
  position: string;
  pot_number: number;
  pot_order: number;
  max_managers: number;
};
