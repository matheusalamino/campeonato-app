"use client";

import { useEffect, useState } from "react";
// ✅ Import the shared client from your project — NOT createClient()
// Adjust the path to wherever your supabase client is defined, e.g.:
//   @/lib/supabase/client
//   @/lib/supabaseClient
//   @/utils/supabase/client  (common in Next.js + Supabase templates)
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type Team = {
  id: string;
  name: string;
  logo_url: string | null;
  /** Nome do cartola (manager) dono do time neste campeonato, se já sorteado. */
  cartola_name: string | null;
};

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useTeams(championshipId: string) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!championshipId) return;

    async function fetchTeams() {
      setLoading(true);
      setError(null);

      try {
        const { data: ctRows, error: ctError } = await supabase
          .from("championship_teams")
          .select("team_id")
          .eq("championship_id", championshipId);

        if (ctError) throw ctError;
        if (!ctRows || ctRows.length === 0) {
          setTeams([]);
          setLoading(false);
          return;
        }

        const teamIds = ctRows.map((r) => r.team_id as string);

        const [{ data: teamRows, error: teamsError }, { data: cmRows }] =
          await Promise.all([
            supabase
              .from("teams")
              .select("id, name, logo_url")
              .in("id", teamIds),
            supabase
              .from("championship_managers")
              .select("team_id, managers ( name )")
              .eq("championship_id", championshipId)
              .not("team_id", "is", null),
          ]);

        if (teamsError) throw teamsError;

        const cartolaByTeamId: Record<string, string> = {};
        (cmRows ?? []).forEach((row) => {
          const tid = row.team_id as string | null;
          const name = (row.managers as { name?: string } | null)?.name;
          if (tid && name) cartolaByTeamId[tid] = name;
        });

        const teamList: Team[] = (teamRows ?? []).map((t) => ({
          id: t.id as string,
          name: t.name as string,
          logo_url: (t.logo_url as string | null) ?? null,
          cartola_name: cartolaByTeamId[t.id as string] ?? null,
        }));

        setTeams(shuffled(teamList));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Erro ao buscar times";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    fetchTeams();
  }, [championshipId]);

  return { teams, loading, error };
}
