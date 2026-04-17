export type DraftFineType =
  | "no_bid_goalkeeper"
  | "no_bid_player"
  | "remaining_budget"
  | "over_budget"
  | "manual";

export interface DraftFine {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  type: DraftFineType;
  amount: number;
  pot_number: number | null;
  pot_position: string | null;
  description: string | null;
  is_automatic: boolean;
  occurrence_number: number | null;
  applied_by: string | null;
  created_at: string;
}

export type DraftFineInsert = Omit<DraftFine, "id" | "created_at"> & {
  is_automatic?: boolean;
};
