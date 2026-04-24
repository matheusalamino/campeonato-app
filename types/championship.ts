export interface Championship {
  id: string;
  name: string;
  season?: string;
  status?: string;
  overall?: number;
  /** When true, managers may submit one qualification bid for the active pot */
  draft_qualification_window_open?: boolean;
  draft_qualification_pot_number?: number | null;
  draft_qualification_pot_position?: string | null;
  /** Leilão (pote) ativo para o fiscal */
  draft_auction_open?: boolean;
  draft_auction_pot_number?: number | null;
  draft_auction_pot_position?: string | null;
}

export type PhaseType = "group" | "knockout";

export type RoundType = "all_vs_all" | "champions";

export type Phase = {
  id: string;
  championship_id: string;
  name: string;
  abbreviation: string;
  type: PhaseType;
  order_number: number;
  is_home_away: boolean;
  created_at: string;
};

export type CreatePhaseDTO = {
  name: string;
  type: PhaseType;
  order_number: number;
  championship_id: string;
  abbreviation: string;
  is_home_away: boolean;
};

export type UpdatePhaseGroupSettings = {
  number_of_groups: number;
  teams_per_group: number;
  round_type: RoundType;
  matches_per_pair: number;
};

export type UpdatePhaseKnockoutSettings = {
  number_of_matches: number;
  is_home_away: boolean;
  auto_fill: boolean;
};

export type UpdatePhaseDTO = {
  id: string;
  name?: string;
  type?: PhaseType;
  order_number?: number;
  abbreviation?: string;
  is_home_away?: boolean;
  /** Optional: update related group settings (does NOT recreate matches/slots) */
  groupSettings?: UpdatePhaseGroupSettings;
  /** Optional: update related knockout settings */
  knockoutSettings?: UpdatePhaseKnockoutSettings;
};

export type PhaseForm = {
  name: string;
  type: PhaseType;
};

export type GroupSettings = {
  phase_id: string;
  number_of_groups: number;
  teams_per_group: number;
  round_type: "all_vs_all" | "champions";
  matches_per_pair: number;
};

export type KnockoutSettings = {
  phase_id: string;
  number_of_matches: number;
  is_home_away: boolean;
  auto_fill: boolean;
  source_phase_id: string | null;
};

export type KnockoutSource = {
  knockout_match_id: string;
  source_type: "group" | "knockout";
  source_phase_id: string;
  source_group?: string;
  source_position?: number;
  source_match_code?: string;
  is_home: boolean;
};
export type MatchSlot = {
  id: string;
  match_id: string;
  slot_order: 1 | 2;
  /** 'home' | 'away' for match slots; group position labels live in GroupSlot */
  label: string;
  championship_team_id: string | null;
};

/** Global group position slot — source of truth for team assignment in group phases */
export type GroupSlotRow = {
  id: string;
  phase_id: string;
  group_letter: string;       // 'A', 'B'...
  position: number;           // 1, 2, 3, 4...
  label: string;              // 'A1', 'B3'...
  championship_team_id: string | null;
  created_at: string;
};

export type KnockoutSourceType =
  | "group_position"
  | "match_winner"
  | "match_loser";

export type KnockoutMatchSource = {
  id?: string;
  knockout_match_id: string;
  slot_order: 1 | 2;

  source_type: KnockoutSourceType;
  source_phase_id: string;

  source_group?: string; // A, B
  source_position?: number; // 1,2,3...
  source_match_code?: string; // REP1, SEMI2
};

export type SlotConfig = {
  slot_order: 1 | 2;

  mode: "manual" | "auto";

  // manual
  championship_team_id?: string;

  // auto
  source_type?: "group_position" | "match_winner" | "match_loser";
  source_phase_id?: string;

  source_group?: string;
  source_position?: number;

  source_match_code?: string;
};
