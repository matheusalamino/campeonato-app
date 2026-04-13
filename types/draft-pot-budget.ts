export interface DraftPotBudget {
  id: string;
  championship_id: string;
  championship_manager_id: string;
  pot_number: number;
  pot_position: string;
  initial_budget: number;
  remaining_budget: number;
  fine_amount: number;
  returned_amount: number;
  settled: boolean;
  created_at: string;
}

export type DraftPotBudgetInsert = Omit<
  DraftPotBudget,
  "id" | "fine_amount" | "returned_amount" | "settled" | "created_at"
>;
