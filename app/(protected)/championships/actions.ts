"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdminAction, AdminAuthError } from "@/lib/auth";
import {
  createChampionshipSchema,
  updateChampionshipSchema,
  statusChangeSchema,
} from "@/features/championships/schema";
import { reconcileChampionshipCapacity } from "@/services/championship-capacity";
import { slugify } from "@/lib/slug";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function zodToFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Serialize parsed form values (Date -> ISO string, undefined -> null) for Supabase. */
function toRow(values: {
  name: string;
  season?: string;
  description?: string;
  registration_start_date?: Date;
  registration_end_date?: Date;
  gala_night_date?: Date;
  tournament_start_date?: Date;
  max_players?: number;
  max_waitlist_players: number;
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

export async function createChampionship(input: unknown): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminAction();
    const parsed = createChampionshipSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos", fieldErrors: zodToFieldErrors(parsed.error) };
    }
    const slug = slugify(
      parsed.data.season ? `${parsed.data.name}-${parsed.data.season}` : parsed.data.name
    );
    const { error } = await supabase
      .from("championships")
      .insert({ ...toRow(parsed.data), slug });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/championships");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminAuthError) return { ok: false, error: e.message };
    return { ok: false, error: "Erro inesperado ao criar campeonato" };
  }
}

export async function updateChampionship(input: unknown): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminAction();
    const parsed = updateChampionshipSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos", fieldErrors: zodToFieldErrors(parsed.error) };
    }
    const { id, ...values } = parsed.data;
    const row = toRow(values);

    // Assign a slug on edit when the row lacks one (legacy championships created
    // before slugs). Never overwrites an existing slug, keeping shared
    // /inscrever/[slug] links stable.
    const { data: current } = await supabase
      .from("championships")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
    const rowToWrite =
      current && !current.slug
        ? { ...row, slug: slugify(values.season ? `${values.name}-${values.season}` : values.name) }
        : row;

    const { error } = await supabase
      .from("championships")
      .update(rowToWrite)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/championships");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminAuthError) return { ok: false, error: e.message };
    return { ok: false, error: "Erro inesperado ao atualizar campeonato" };
  }
}

export async function changeChampionshipStatus(input: unknown): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminAction();
    const parsed = statusChangeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Transição de status inválida" };
    }
    const { id, from, to } = parsed.data;

    // Backfill a slug when the championship lacks one (legacy rows created before
    // slugs existed). Without a slug it can never surface for public registration
    // or resolve at /inscrever/[slug]. Only sets it when missing — never rewrites
    // an existing slug, so shared links stay stable.
    const updatePayload: { status: string; slug?: string } = { status: to };
    const { data: current } = await supabase
      .from("championships")
      .select("name, season, slug")
      .eq("id", id)
      .maybeSingle();
    if (current && !current.slug) {
      updatePayload.slug = slugify(
        current.season ? `${current.name}-${current.season}` : current.name,
      );
    }

    const { data, error } = await supabase
      .from("championships")
      .update(updatePayload)
      .eq("id", id)
      .eq("status", from)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: "O status do campeonato mudou. Recarregue a página e tente novamente.",
      };
    }
    revalidatePath("/championships");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminAuthError) return { ok: false, error: e.message };
    return { ok: false, error: "Erro inesperado ao alterar status" };
  }
}

export async function deleteChampionship(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase
      .from("championships")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/championships");
    return { ok: true };
  } catch (e) {
    if (e instanceof AdminAuthError) return { ok: false, error: e.message };
    return { ok: false, error: "Erro inesperado ao excluir campeonato" };
  }
}

/** Called from the subscription flow after a registration is created. */
export async function reconcileCapacityAction(championshipId: string): Promise<void> {
  await reconcileChampionshipCapacity(championshipId);
}
