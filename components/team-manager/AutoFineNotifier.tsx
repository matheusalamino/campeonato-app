"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTeamManagerDraft } from "@/components/TeamManagerDraftContext";

type FineRow = {
  id: string;
  type: string;
  amount: number;
  pot_number: number | null;
  pot_position: string | null;
  description: string | null;
  is_automatic: boolean;
};

const POLL_MS = 6000;

export function AutoFineNotifier() {
  const supabase = useMemo(() => createClient(), []);
  const ctx = useTeamManagerDraft();
  const mountedRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    const storageKey = `seen_auto_fines:${ctx.championshipManagerId}`;
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    const initial = raw ? (JSON.parse(raw) as string[]) : [];
    seenIdsRef.current = new Set(initial);

    async function poll() {
      const { data, error } = await supabase
        .from("draft_fines")
        .select("id, type, amount, pot_number, pot_position, description, is_automatic")
        .eq("championship_id", ctx.championshipId)
        .eq("championship_manager_id", ctx.championshipManagerId)
        .eq("is_automatic", true)
        .order("created_at", { ascending: true })
        .limit(25);

      if (error || !mountedRef.current) return;

      const rows = (data ?? []) as FineRow[];
      let changed = false;
      for (const fine of rows) {
        if (seenIdsRef.current.has(fine.id)) continue;
        seenIdsRef.current.add(fine.id);
        changed = true;

        const potLabel =
          fine.pot_number != null && fine.pot_position
            ? `Pote ${fine.pot_number} (${fine.pot_position})`
            : "Draft";

        toast.warning(
          `Multa automática: CC$ ${fine.amount.toLocaleString("pt-BR")} · ${potLabel}`,
          {
            description: fine.description ?? "Seu saldo foi ajustado automaticamente.",
          },
        );
      }

      if (changed) {
        localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(seenIdsRef.current).slice(-100)),
        );
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [ctx.championshipId, ctx.championshipManagerId, supabase]);

  return null;
}
