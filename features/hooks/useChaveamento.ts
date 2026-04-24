"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Phase, GroupSettings } from "@/types/championship";
import type { Team } from "@/features/hooks/useTeams";

const supabase = createClient();

// ── Local types ────────────────────────────────────────────────────────────────

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

// Supabase row shapes
type GroupSlotRaw = {
  phase_id: string;
  group_letter: string;
  position: number;
  label: string;
  championship_team_id: string | null;
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useChaveamento(championshipId: string) {
  const [data, setData] = useState<ChaveamentoData>({ phases: [], teams: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!championshipId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Phases
      const { data: phases, error: pErr } = await supabase
        .from("phases")
        .select("*")
        .eq("championship_id", championshipId)
        .order("order_number");
      if (pErr) throw pErr;

      const groupPhaseIds = (phases ?? [])
        .filter((p) => p.type === "group")
        .map((p) => p.id);

      // 2. Group settings
      const { data: settings } = await supabase
        .from("phase_group_settings")
        .select("*")
        .in("phase_id", groupPhaseIds.length ? groupPhaseIds : ["__none__"]);

      // 3. Group slots (source of truth for group positions)
      //    Replaces the old match_slots query for group phases.
      const { data: groupSlotsRaw } = await supabase
        .from("group_slots")
        .select("phase_id, group_letter, position, label, championship_team_id")
        .in("phase_id", groupPhaseIds.length ? groupPhaseIds : ["__none__"])
        .returns<GroupSlotRaw[]>();

      // 4. Teams in this championship
      const { data: ctRows } = await supabase
        .from("championship_teams")
        .select("id, team_id")
        .eq("championship_id", championshipId);

      const ctMap: Record<string, string> = {}; // championship_team_id → team_id
      (ctRows ?? []).forEach((r) => {
        ctMap[r.id as string] = r.team_id as string;
      });

      const teamIds = Object.values(ctMap);

      const { data: teamRows } = await supabase
        .from("teams")
        .select("id, name, logo_url")
        .in("id", teamIds.length ? teamIds : ["__none__"]);

      const { data: cmRows } = await supabase
        .from("championship_managers")
        .select(`
          team_id,
          managers ( name )
        `)
        .eq("championship_id", championshipId);

      const managerMap: Record<string, string> = {};
      (cmRows ?? []).forEach((cm: any) => {
        if (cm.team_id && cm.managers?.name) {
          managerMap[cm.team_id] = cm.managers.name;
        }
      });

      const teams: Team[] = (teamRows ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        logo_url: (t.logo_url as string | null) ?? null,
        cartola_name: managerMap[t.id as string] ?? null,
      }));

      const teamMap: Record<string, Team> = {};
      teams.forEach((t) => {
        teamMap[t.id] = t;
      });

      // 5. Build slot map: label → team info
      //    Keyed by `${phase_id}:${label}` to avoid cross-phase collisions.
      type SlotInfo = {
        teamId: string | null;
        teamName: string | null;
        teamLogoUrl: string | null;
      };

      const slotMap: Record<string, SlotInfo> = {};

      (groupSlotsRaw ?? []).forEach((sl) => {
        const key = `${sl.phase_id}:${sl.label}`;
        const ctId = sl.championship_team_id;
        const teamId = ctId ? (ctMap[ctId] ?? null) : null;
        const team = teamId ? (teamMap[teamId] ?? null) : null;

        slotMap[key] = {
          teamId: ctId ?? null,
          teamName: team?.name ?? null,
          teamLogoUrl: team?.logo_url ?? null,
        };
      });

      // 6. Settings map
      const settingsMap: Record<string, GroupSettings> = {};
      (settings ?? []).forEach((s) => {
        settingsMap[s.phase_id] = s as GroupSettings;
      });

      // 7. Assemble phases with groups
      const phasesWithGroups: PhaseWithGroups[] = (phases ?? []).map(
        (phase) => {
          const cfg = settingsMap[phase.id] ?? null;
          if (phase.type !== "group" || !cfg) {
            return { ...phase, settings: cfg, groups: [] };
          }

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
                  const key = `${phase.id}:${label}`;
                  const assignment = slotMap[key] ?? {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [championshipId]);

  return { data, loading, error, reload: load };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

/**
 * Assigns a team to a group slot.
 *
 * Operates on `group_slots` (source of truth) and then syncs `match_slots`
 * for every knockout_match in this phase+group that involves this position,
 * so the match display also reflects the assignment.
 */
export async function assignTeamToSlot(
  label: string,
  championshipTeamId: string,
  phaseId: string,
): Promise<{ error: string | null }> {
  const client = createClient();

  // 1. Update group_slots
  const { error: gsErr } = await client
    .from("group_slots")
    .update({ championship_team_id: championshipTeamId })
    .eq("phase_id", phaseId)
    .eq("label", label);

  if (gsErr) return { error: gsErr.message };

  // 2. Verify the slot existed (count check after update)
  const { count } = await client
    .from("group_slots")
    .select("id", { count: "exact", head: true })
    .eq("phase_id", phaseId)
    .eq("label", label);

  if (count === 0) return { error: `Slot "${label}" não encontrado para esta fase` };

  // 3. Best-effort sync to match_slots (for legacy data that still uses group labels).
  //    Fetch match IDs first — Supabase subqueries are not iterable at runtime.
  const { data: matchRows } = await client
    .from("knockout_matches")
    .select("id")
    .eq("phase_id", phaseId);

  const matchIds = (matchRows ?? []).map((m: { id: string }) => m.id);

  if (matchIds.length > 0) {
    await client
      .from("match_slots")
      .update({ championship_team_id: championshipTeamId })
      .eq("label", label)
      .in("match_id", matchIds);
  }

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
