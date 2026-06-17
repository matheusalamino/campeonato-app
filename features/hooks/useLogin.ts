"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setErrorMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage("Invalid email or password.");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile?.role === "manager") {
          router.replace("/team-manager");
          router.refresh();
          return;
        }
        if (profile?.role === "auction_fiscal") {
          router.replace("/auction-fiscal");
          router.refresh();
          return;
        }
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Could not connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearError() {
    setErrorMessage(null);
  }

  return { login, loading, errorMessage, clearError };
}
