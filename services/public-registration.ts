import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCpf } from "@/lib/cpf";
import { makeRegistrationSchema } from "@/features/registration/schema";
import { computeTicketsTotal } from "@/features/registration/pricing";
import { deriveIsWaitlist } from "@/features/registration/waitlist";
import { skillsFor } from "@/features/registration/skills";
import { shouldCloseForCapacity } from "@/features/championships/capacity";
import type { GroupOption, ChampionshipStatus } from "@/types/championship";
import type { z } from "zod";

export type PlayerPrefill = {
  name?: string;
  shirt_name?: string;
  email?: string;
  whatsapp?: string;
  birth_date?: string;
  instagram?: string;
  birth_state?: string;
  preferred_position?: string;
  height?: number;
  weight?: number;
};

const PREFILL_COLUMNS =
  "name, shirt_name, email, whatsapp, birth_date, instagram, birth_state, preferred_position, height, weight";

export async function lookupPlayerByCpf(
  cpf: string,
): Promise<{ exists: false } | { exists: true; player: PlayerPrefill }> {
  const normalized = normalizeCpf(cpf);
  if (normalized.length !== 11) return { exists: false };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("players")
    .select(PREFILL_COLUMNS)
    .eq("cpf", normalized)
    .maybeSingle();

  if (!data) return { exists: false };
  return { exists: true, player: data as PlayerPrefill };
}

/** Per-IP sliding-window limit for the public CPF lookup. Returns true if allowed. */
export async function checkLookupRateLimit(ip: string): Promise<boolean> {
  const supabase = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now - 60_000).toISOString();
  // Opportunistic prune of this IP's stale rows (keeps the table bounded).
  await supabase
    .from("registration_lookup_attempts")
    .delete()
    .eq("ip", ip)
    .lt("attempted_at", new Date(now - 3_600_000).toISOString());
  const { count, error } = await supabase
    .from("registration_lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("attempted_at", windowStart);
  if (error) return false; // fail closed on a rate-check error
  if ((count ?? 0) >= 20) return false;
  await supabase.from("registration_lookup_attempts").insert({ ip });
  return true;
}

export async function getOpenRegistrationChampionship(): Promise<{ slug: string; name: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("championships")
    .select("slug, name")
    .in("status", ["subscribing", "rest"])
    .not("slug", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function submitRegistration(
  input: unknown,
): Promise<
  | { ok: true; registrationId: string; isWaitlist: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const supabase = createAdminClient();

  // Peek the slug so we can load the championship config for the schema.
  const slug =
    typeof input === "object" && input && "championship_slug" in input
      ? String((input as { championship_slug: unknown }).championship_slug)
      : "";

  const { data: champ } = await supabase
    .from("championships")
    .select("id, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!champ) return { ok: false, error: "Campeonato não encontrado." };
  if (champ.status !== "subscribing") {
    return { ok: false, error: "As inscrições não estão abertas para este campeonato." };
  }

  const groupOptions = (champ.registration_group_options ?? []) as GroupOption[];
  const parsed = makeRegistrationSchema(groupOptions).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const data = parsed.data;

  // Server-authoritative total; require receipt when there is anything to pay.
  const total = computeTicketsTotal({
    basePrice: champ.base_price,
    extraTicketPrice: champ.extra_ticket_price,
    extraTicketsCount: data.extra_tickets_count,
  });
  if (total > 0 && !data.payment_receipt_link) {
    return {
      ok: false,
      error: "Comprovante de pagamento é obrigatório.",
      fieldErrors: { payment_receipt_link: "Envie o comprovante de pagamento" },
    };
  }

  // Idempotency: reject a second registration for this player + championship,
  // BEFORE any write, so a duplicate attempt never mutates the player's
  // existing identity fields.
  const cpf = normalizeCpf(data.cpf);
  const { data: existingPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();
  if (existingPlayer) {
    const { data: existingReg } = await supabase
      .from("championship_registrations")
      .select("id")
      .eq("championship_id", champ.id)
      .eq("player_id", existingPlayer.id)
      .maybeSingle();
    if (existingReg) return { ok: false, error: "Você já está inscrito neste campeonato." };
  }

  // Upsert player by CPF.
  const playerRow = {
    cpf,
    name: data.name,
    shirt_name: data.shirt_name,
    email: data.email,
    whatsapp: data.whatsapp,
    birth_date: data.birth_date,
    birth_state: data.birth_state,
    instagram: data.instagram || null,
    preferred_position: data.preferred_position,
    height: data.height,
    weight: data.weight,
  };
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .upsert(playerRow, { onConflict: "cpf" })
    .select("id")
    .single();
  if (playerErr || !player) return { ok: false, error: "Não foi possível salvar o jogador." };

  // Derive waitlist from the live count against main capacity.
  const { count, error: countError } = await supabase
    .from("championship_registrations")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", champ.id);
  if (countError) {
    return { ok: false, error: "Não foi possível concluir a inscrição. Tente novamente." };
  }
  const isWaitlist = deriveIsWaitlist({
    registrationCount: count ?? 0,
    maxPlayers: champ.max_players,
  });

  // Insert the registration.
  const { data: registration, error: regErr } = await supabase
    .from("championship_registrations")
    .insert({
      championship_id: champ.id,
      player_id: player.id,
      is_waitlist: isWaitlist,
      group_affiliation: data.group_affiliation,
      invite_code: data.invite_code || null,
      extra_tickets_count: data.extra_tickets_count,
      tickets_total: total,
      profile_photo_link: data.profile_photo_link,
      payment_receipt_link: data.payment_receipt_link || null,
      legal_authorization_link: data.legal_authorization_link || null,
    })
    .select("id")
    .single();
  if (regErr || !registration) {
    return { ok: false, error: "Não foi possível concluir a inscrição." };
  }

  // Persist self-evaluations for the position-appropriate skills.
  const skillKeys = skillsFor(data.preferred_position);
  const selfRows = skillKeys.map((skill) => ({
    registration_id: registration.id,
    skill,
    rating: Number(data.skills[skill] ?? 1),
  }));
  await supabase.from("self_evaluations").insert(selfRows);

  // Auto-close when players + waitlist capacity is reached.
  const { count: newCount } = await supabase
    .from("championship_registrations")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", champ.id);
  if (
    shouldCloseForCapacity({
      status: champ.status as ChampionshipStatus,
      registrationCount: newCount ?? 0,
      maxPlayers: champ.max_players,
      maxWaitlist: champ.max_waitlist_players,
    })
  ) {
    await supabase.from("championships").update({ status: "subscribed" }).eq("id", champ.id);
  }

  return { ok: true, registrationId: registration.id, isWaitlist };
}
