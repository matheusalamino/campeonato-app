"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Phase, GroupSettings } from "@/types/championship";
import type { Team } from "@/features/hooks/useTeams";

const supabase = createClient();

// ── Local types ────────────────────────────────────────────
export type GroupSlot = {
  slotLabel: string;
  group: string;
  position: number;
  teamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

export type GroupData = {
  groupLetter: string;
  slots: GroupSlot[];
};

export type PhaseWithGroups = Phase & {
  settings: GroupSettings | null;
  groups: GroupData[];
};

export type ChaveamentoData = {
  phases: PhaseWithGroups[];
  teams: Team[];
};

// Supabase row shapes (replaces `any`)
type SlotRaw = {
  id: string;
  match_id: string;
  slot_order: number;
  label: string | null;
  championship_team_id: string | null;
  knockout_matches: { phase_id: string };
};

type SlotIdRow = {
  id: string;
  knockout_matches: { phase_id: string };
};

// ── Hook ───────────────────────────────────────────────────
export function useChaveamento(championshipId: string) {
  const [data, setData] = useState<ChaveamentoData>({ phases: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!championshipId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: phases, error: pErr } = await supabase
        .from("phases")
        .select("*")
        .eq("championship_id", championshipId)
        .order("order_number");
      if (pErr) throw pErr;

      const groupPhaseIds = (phases ?? [])
        .filter((p) => p.type === "group")
        .map((p) => p.id);

      const { data: settings } = await supabase
        .from("phase_group_settings")
        .select("*")
        .in("phase_id", groupPhaseIds.length ? groupPhaseIds : ["__none__"]);

      const { data: slotsRaw } = await supabase
        .from("match_slots")
        .select(
          "id, match_id, slot_order, label, championship_team_id, knockout_matches!inner ( phase_id )",
        )
        .in(
          "knockout_matches.phase_id",
          (phases ?? []).map((p) => p.id),
        )
        .returns<SlotRaw[]>();

      const { data: ctRows } = await supabase
        .from("championship_teams")
        .select("team_id")
        .eq("championship_id", championshipId);

      const teamIds = (ctRows ?? []).map((r) => r.team_id as string);

      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, logo_url")
        .in("id", teamIds.length ? teamIds : ["__none__"]);

      const teams: Team[] = (teamRows ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        logo_url: (t.logo_url as string | null) ?? null,
        cartola_name: null,
      }));

      const settingsMap: Record<string, GroupSettings> = {};
      (settings ?? []).forEach((s) => {
        settingsMap[s.phase_id] = s as GroupSettings;
      });

      const slotMap: Record<
        string,
        {
          teamId: string | null;
          teamName: string | null;
          teamLogoUrl: string | null;
        }
      > = {};
      (slotsRaw ?? []).forEach((sl) => {
        if (!sl.label) return;
        const team =
          teams.find((t) => t.id === sl.championship_team_id) ?? null;
        slotMap[sl.label] = {
          teamId: sl.championship_team_id ?? null,
          teamName: team?.name ?? null,
          teamLogoUrl: team?.logo_url ?? null,
        };
      });

      const phasesWithGroups: PhaseWithGroups[] = (phases ?? []).map(
        (phase) => {
          const cfg = settingsMap[phase.id] ?? null;
          if (phase.type !== "group" || !cfg)
            return { ...phase, settings: cfg, groups: [] };

          const numGroups = cfg.number_of_groups ?? 0;
          const teamsPerGroup = cfg.teams_per_group ?? 0;

          const groups: GroupData[] = Array.from(
            { length: numGroups },
            (_, gi) => {
              const letter = String.fromCharCode(65 + gi);
              const slots: GroupSlot[] = Array.from(
                { length: teamsPerGroup },
                (_, pi) => {
                  const label = `${letter}${pi + 1}`;
                  const assignment = slotMap[label] ?? {
                    teamId: null,
                    teamName: null,
                    teamLogoUrl: null,
                  };
                  return {
                    slotLabel: label,
                    group: letter,
                    position: pi + 1,
                    ...assignment,
                  };
                },
              );
              return { groupLetter: letter, slots };
            },
          );

          return { ...phase, settings: cfg, groups };
        },
      );

      setData({ phases: phasesWithGroups, teams });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar chaveamento",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [championshipId]);

  return { data, loading, error, reload: load };
}

// ── Mutations ──────────────────────────────────────────────
export async function assignTeamToSlot(
  label: string,
  championshipTeamId: string,
  phaseId: string,
): Promise<{ error: string | null }> {
  const client = createClient();

  const { data: slots, error: fetchErr } = await client
    .from("match_slots")
    .select("id, knockout_matches!inner(phase_id)")
    .eq("label", label)
    .eq("knockout_matches.phase_id", phaseId)
    .returns<SlotIdRow[]>();

  if (fetchErr) return { error: fetchErr.message };
  if (!slots || slots.length === 0)
    return { error: `Slot "${label}" não encontrado para esta fase` };

  const ids = slots.map((s) => s.id);

  const { error: updateErr } = await client
    .from("match_slots")
    .update({ championship_team_id: championshipTeamId })
    .in("id", ids);

  if (updateErr) return { error: updateErr.message };
  return { error: null };
}

export async function getChampionshipTeamId(
  teamId: string,
  championshipId: string,
): Promise<string | null> {
  const client = createClient();
  const { data } = await client
    .from("championship_teams")
    .select("id")
    .eq("team_id", teamId)
    .eq("championship_id", championshipId)
    .single();
  return (data as { id: string } | null)?.id ?? null;
}
