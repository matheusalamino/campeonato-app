"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Types ──────────────────────────────────────────────────
export type PreviousTitle = {
  championship_name: string;
  count: number;
};

export type ManagerPresentation = {
  id: string;
  name: string;
  photo_url: string | null;
  inspirational_phrase: string | null;
  previous_titles: PreviousTitle[];
};

type ChampionshipManagerEntry = {
  manager_id: string;
  inspirational_phrase: string | null;
  managers: {
    id: string;
    name: string;
    photo_url: string | null;
  };
};

// Must match the Supabase join key exactly — plural because that's the table name
type HistoryEntry = {
  championship_id: string;
  championships: { id: string; name: string } | null; // ✅ plural
};

// ── Hook ───────────────────────────────────────────────────
export function useManagers(championshipId: string) {
  const [managers, setManagers] = useState<ManagerPresentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!championshipId) return;

    async function fetchManagers() {
      setLoading(true);
      setError(null);

      try {
        const { data: entries, error: entriesError } = await supabase
          .from("championship_managers")
          .select(
            `manager_id,
             inspirational_phrase,
             managers ( id, name, photo_url )`,
          )
          .eq("championship_id", championshipId)
          .returns<ChampionshipManagerEntry[]>();

        if (entriesError) throw entriesError;
        if (!entries || entries.length === 0) {
          setManagers([]);
          setLoading(false);
          return;
        }

        const managerList: ManagerPresentation[] = await Promise.all(
          entries.map(async (entry) => {
            const manager = entry.managers;

            const { data: history } = await supabase
              .from("championship_managers")
              .select(`championship_id, championships ( id, name )`)
              .eq("manager_id", manager.id)
              .neq("championship_id", championshipId)
              .returns<HistoryEntry[]>();

            const titleMap: Record<string, number> = {};
            (history ?? []).forEach((h) => {
              const name = h.championships?.name; // ✅ plural — matches Supabase join key
              if (name) titleMap[name] = (titleMap[name] ?? 0) + 1;
            });

            const previous_titles: PreviousTitle[] = Object.entries(
              titleMap,
            ).map(([championship_name, count]) => ({
              championship_name,
              count,
            }));

            return {
              id: manager.id,
              name: manager.name,
              photo_url: manager.photo_url ?? null,
              inspirational_phrase: entry.inspirational_phrase ?? null,
              previous_titles,
            };
          }),
        );

        setManagers(managerList);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Erro ao buscar managers";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchManagers();
  }, [championshipId]);

  return { managers, loading, error };
}
