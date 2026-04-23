export type DraftBalanceTransactionType =
  | "INITIAL_BALANCE"
  | "POT_BID_RESERVE"
  | "POT_BID_REFUND"
  | "GOALKEEPER_PURCHASE"
  | "FINE_NO_BID_GOALKEEPER"
  | "FINE_NO_BID_PLAYER"
  | "FINE_REMAINING_BUDGET"
  | "FINE_OVER_BUDGET"
  | "FINE_MANUAL"
  | "POT_BUDGET_RETURN"
  | "ADDITIONAL_ROUND_PURCHASE"
  | "DRAFT_PLAYER_PURCHASE";

export interface DraftBalanceTransaction {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  type: DraftBalanceTransactionType;
  amount: number;
  reference_id: string | null;
  /** Quando preenchido, permite filtrar extrato por pote ativo do campeonato. */
  pot_number: number | null;
  pot_position: string | null;
  description: string | null;
  created_at: string;
}

export type DraftBalanceTransactionInsert = Omit<
  DraftBalanceTransaction,
  "id" | "created_at"
>;
