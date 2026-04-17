export type DraftPurchaseType =
  | "open_auction"
  | "special_card"
  | "additional_round";

export interface DraftPlayerPurchase {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  registration_id: string;
  pot_number: number;
  pot_position: string;
  purchase_price: number;
  purchase_type: DraftPurchaseType;
  created_at: string;
}

export type DraftPlayerPurchaseInsert = Omit<
  DraftPlayerPurchase,
  "id" | "created_at"
>;
