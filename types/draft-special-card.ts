export type DraftSpecialCardResult = "purchased" | "returned_to_auction";

export interface DraftSpecialCardUse {
  id: string;
  championship_id: string;
  activated_by_cm_id: string;
  pot_number: number;
  pot_position: string;
  target_registration_id: string;
  won_by_cm_id: string | null;
  winning_bid_amount: number | null;
  result: DraftSpecialCardResult;
  created_at: string;
}

export type DraftSpecialCardUseInsert = Pick<
  DraftSpecialCardUse,
  | "championship_id"
  | "activated_by_cm_id"
  | "pot_number"
  | "pot_position"
  | "target_registration_id"
>;

export interface DraftSpecialCardBid {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  special_card_use_id: string;
  bid_amount: number;
  submitted_at: string;
  won: boolean;
  created_at: string;
}

export type DraftSpecialCardBidInsert = Omit<
  DraftSpecialCardBid,
  "id" | "won" | "created_at"
>;
