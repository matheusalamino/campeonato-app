import { Championship } from "./championship";
import { Player } from "./player";

export interface Registration {
  id: string;
  championship_id: string | null;
  player_id: string | null;
  final_overall: number | null;
  created_at: string;
  legal_authorization_link: string | null;
  profile_photo_link: string | null;
  is_waitlist?: boolean;
  group_affiliation?: string | null;
  invite_code?: string | null;
  extra_tickets_count?: number;
  tickets_total?: number | null;
  payment_receipt_link?: string | null;
  payment_verified?: boolean;
}

export interface RegistrationWithPlayer extends Registration {
  player: Player;
}

export interface RegistrationWithChampionship extends Registration {
  championships?: Championship;
}

export interface RegistrationFull extends Registration {
  players?: Player;
  championships?: Championship;
}
