import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function getUserRole() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role ?? null;
}

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

/**
 * Guard for Server Actions. Throws AdminAuthError when the caller is not an
 * authenticated admin. Returns the server Supabase client and the user.
 */
export async function requireAdminAction() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AdminAuthError("Não autenticado");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (data?.role !== "admin") {
    throw new AdminAuthError("Apenas administradores");
  }

  return { supabase, user };
}
