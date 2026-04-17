import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type DraftStaffRole = "admin" | "auction_fiscal";

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
      supabase: null as Awaited<ReturnType<typeof createClient>> | null,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

export async function requireAdminOrAuctionFiscal() {
  const base = await requireAuthenticatedUser();
  if (base.error || !base.supabase || !base.user) return base;

  const { data: profile } = await base.supabase
    .from("profiles")
    .select("role")
    .eq("id", base.user.id)
    .single();

  const ok =
    profile?.role === "admin" || profile?.role === "auction_fiscal";

  if (!ok) {
    return {
      error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }),
      supabase: null,
      user: null,
    };
  }

  return {
    error: null,
    supabase: base.supabase,
    user: base.user,
    role: profile?.role as DraftStaffRole | undefined,
  };
}

export async function requireAdmin() {
  const base = await requireAuthenticatedUser();
  if (base.error || !base.supabase || !base.user) return base;

  const { data: profile } = await base.supabase
    .from("profiles")
    .select("role")
    .eq("id", base.user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas administradores" },
        { status: 403 },
      ),
      supabase: null,
      user: null,
    };
  }

  return { error: null, supabase: base.supabase, user: base.user };
}
