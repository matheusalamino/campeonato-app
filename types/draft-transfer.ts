export interface DraftTransfer {
  id: string;
  championship_id: string;
  manager_a_cm_id: string;
  manager_b_cm_id: string;
  player_a_registration_id: string;
  player_b_registration_id: string;
  registered_by: string | null;
  created_at: string;
}

export type DraftTransferInsert = Omit<DraftTransfer, "id" | "created_at">;
