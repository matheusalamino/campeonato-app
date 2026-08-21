/** Serialize parsed form values (Date -> ISO string, undefined -> null) for Supabase. */
export function toRow(values: {
  name: string;
  season?: string;
  description?: string;
  registration_start_date?: Date;
  registration_end_date?: Date;
  gala_night_date?: Date;
  tournament_start_date?: Date;
  max_players?: number;
  max_waitlist_players: number;
  max_extra_tickets: number;
  status: string;
  registration_image_url?: string;
  base_price?: number;
  extra_ticket_price?: number;
  pix_key?: string;
  pix_merchant_name?: string;
  pix_merchant_city?: string;
  registration_group_options?: { label: string; requires_invite_code: boolean }[];
}) {
  const iso = (d?: Date) => (d ? d.toISOString() : null);
  return {
    name: values.name,
    season: values.season ?? null,
    description: values.description ?? null,
    registration_start_date: iso(values.registration_start_date),
    registration_end_date: iso(values.registration_end_date),
    gala_night_date: iso(values.gala_night_date),
    tournament_start_date: iso(values.tournament_start_date),
    max_players: values.max_players ?? null,
    max_waitlist_players: values.max_waitlist_players,
    max_extra_tickets: values.max_extra_tickets,
    status: values.status,
    registration_image_url: values.registration_image_url ?? null,
    base_price: values.base_price ?? null,
    extra_ticket_price: values.extra_ticket_price ?? null,
    pix_key: values.pix_key ?? null,
    pix_merchant_name: values.pix_merchant_name ?? null,
    pix_merchant_city: values.pix_merchant_city ?? null,
    registration_group_options: values.registration_group_options ?? [],
  };
}
