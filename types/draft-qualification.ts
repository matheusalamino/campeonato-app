export interface DraftQualificationBid {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  pot_number: number;
  pot_position: string;
  bid_amount: number;
  submitted_at: string;
  qualified: boolean;
  created_at: string;
}

export type DraftQualificationBidInsert = Omit<
  DraftQualificationBid,
  "id" | "qualified" | "created_at"
>;
