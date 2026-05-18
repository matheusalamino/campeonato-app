"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  MatchSlot,
  KnockoutMatchSource,
  Phase,
} from "@/types/championship";

const supabase = createClient();

type TeamInfo = {
  id: string;
  name: string;
  logo_url: string | null;
};

type MatchSide = {
  type: "team" | "rule" | "pending";
  label: string;
  logoUrl: string | null;
};

export type ChampionshipMatchItem = {
  id: string;
  phaseId: string;
  phaseName: string;
  phaseOrder: number;
  matchName: string | null;
  matchCode: string | null;
  roundNumber: number | null;
  groupLabel: string | null;
  scheduledAt: string | null;
  isFinal: boolean;
  home: MatchSide;
  away: MatchSide;
};

export type ChampionshipMatchPhaseGroup = {
  id: string;
  name: string;
  orderNumber: number;
  matches: ChampionshipMatchItem[];
};

type GroupSlotRow = {
  phase_id: string;
  label: string;
  championship_team_id: string | null;
};

type ChampionshipMatchRow = {
  id: string;
  phase_id: string;
  name: string | null;
  round_number: number | null;
  code: string | null;
  group_label: string | null;
  scheduled_at: string | null;
  is_final: boolean | null;
};

function teamFromChampionshipTeamId(
  championshipTeamId: string | null | undefined,
  teamsByChampionshipTeamId: Record<string, TeamInfo>,
): TeamInfo | null {
  if (!championshipTeamId) return null;
  return teamsByChampionshipTeamId[championshipTeamId] ?? null;
}

function resolveSourceLabel(source: KnockoutMatchSource): string {
  if (source.source_type === "group_position") {
    return `${source.source_position ?? "?"}º COLOCADO ${source.source_group ?? "?"}`;
  }

  if (source.source_type === "match_winner") {
    return `VENCEDOR ${source.source_match_code ?? "?"}`;
  }

  if (source.source_type === "match_loser") {
    return `PERDEDOR ${source.source_match_code ?? "?"}`;
  }

  return "A definir";
}

function parseGroupMatchLabels(
  matchName: string | null,
): [string | null, string | null] {
  if (!matchName) return [null, null];

  const parts = matchName.split(/\s+x\s+/i).map((part) => part.trim());
  return [parts[0] ?? null, parts[1] ?? null];
}

function sortMatches(a: ChampionshipMatchItem, b: ChampionshipMatchItem) {
  if (a.scheduledAt && b.scheduledAt) {
    return (
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() ||
      (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
      (a.matchCode ?? "").localeCompare(b.matchCode ?? "", "pt-BR") ||
      (a.matchName ?? "").localeCompare(b.matchName ?? "", "pt-BR")
    );
  }

  if (a.scheduledAt && !b.scheduledAt) return -1;
  if (!a.scheduledAt && b.scheduledAt) return 1;

  return (
    (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
    (a.matchCode ?? "").localeCompare(b.matchCode ?? "", "pt-BR") ||
    (a.matchName ?? "").localeCompare(b.matchName ?? "", "pt-BR")
  );
}

export function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoFromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function fetchChampionshipMatchGroups(
  championshipId: string,
): Promise<ChampionshipMatchPhaseGroup[]> {
  const { data: phases, error: phasesError } = await supabase
    .from("phases")
    .select("*")
    .eq("championship_id", championshipId)
    .order("order_number");

  if (phasesError || !phases) {
    return [];
  }

  const phaseRows = phases as Phase[];
  const phaseIds = phaseRows.map((phase) => phase.id);

  if (phaseIds.length === 0) {
    return [];
  }

  const groupPhaseIds = phaseRows
    .filter((phase) => phase.type === "group")
    .map((phase) => phase.id);

  const [
    { data: matchRows },
    { data: championshipTeams },
    { data: groupSlots },
  ] = await Promise.all([
    supabase
      .from("knockout_matches")
      .select("id, phase_id, name, round_number, code, group_label, scheduled_at, is_final")
      .in("phase_id", phaseIds),
    supabase
      .from("championship_teams")
      .select("id, team_id")
      .eq("championship_id", championshipId),
    supabase
      .from("group_slots")
      .select("phase_id, label, championship_team_id")
      .in("phase_id", groupPhaseIds.length ? groupPhaseIds : ["__none__"]),
  ]);

  const matches = (matchRows ?? []) as ChampionshipMatchRow[];
  const matchIds = matches.map((match) => match.id);

  const ctRows = (championshipTeams ?? []) as {
    id: string;
    team_id: string;
  }[];

  const championshipTeamToTeamId = Object.fromEntries(
    ctRows.map((row) => [row.id, row.team_id]),
  );

  const teamIds = Array.from(new Set(ctRows.map((row) => row.team_id)));

  const [{ data: teamRows }, { data: matchSlots }, { data: sourceRows }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, logo_url")
        .in("id", teamIds.length ? teamIds : ["__none__"]),
      supabase
        .from("match_slots")
        .select("id, match_id, slot_order, label, championship_team_id")
        .in("match_id", matchIds.length ? matchIds : ["__none__"])
        .order("slot_order"),
      supabase
        .from("knockout_match_sources")
        .select(
          "id, knockout_match_id, slot_order, source_type, source_phase_id, source_group, source_position, source_match_code",
        )
        .in("knockout_match_id", matchIds.length ? matchIds : ["__none__"])
        .order("slot_order"),
    ]);

  const teamMap = Object.fromEntries(
    ((teamRows ?? []) as TeamInfo[]).map((team) => [team.id, team]),
  );

  const teamsByChampionshipTeamId = Object.fromEntries(
    Object.entries(championshipTeamToTeamId)
      .map(([championshipTeamId, teamId]) => [
        championshipTeamId,
        teamMap[teamId] ?? null,
      ])
      .filter((entry): entry is [string, TeamInfo] => entry[1] !== null),
  );

  const groupAssignmentMap = Object.fromEntries(
    ((groupSlots ?? []) as GroupSlotRow[]).map((slot) => [
      `${slot.phase_id}:${slot.label}`,
      teamFromChampionshipTeamId(
        slot.championship_team_id,
        teamsByChampionshipTeamId,
      ),
    ]),
  );

  const slotsByMatch = ((matchSlots ?? []) as MatchSlot[]).reduce<
    Record<string, MatchSlot[]>
  >((acc, slot) => {
    acc[slot.match_id] = [...(acc[slot.match_id] ?? []), slot];
    return acc;
  }, {});

  const sourcesByMatch = ((sourceRows ?? []) as KnockoutMatchSource[]).reduce<
    Record<string, KnockoutMatchSource[]>
  >((acc, source) => {
    acc[source.knockout_match_id] = [
      ...(acc[source.knockout_match_id] ?? []),
      source,
    ];
    return acc;
  }, {});

  const phaseMap = Object.fromEntries(phaseRows.map((phase) => [phase.id, phase]));

  function resolveSide(
    match: ChampionshipMatchRow,
    phase: Phase,
    slotOrder: 1 | 2,
  ): MatchSide {
    const slot = (slotsByMatch[match.id] ?? []).find(
      (item) => item.slot_order === slotOrder,
    );

    const slottedTeam = teamFromChampionshipTeamId(
      slot?.championship_team_id,
      teamsByChampionshipTeamId,
    );

    if (slottedTeam) {
      return {
        type: "team",
        label: slottedTeam.name,
        logoUrl: slottedTeam.logo_url,
      };
    }

    const source = (sourcesByMatch[match.id] ?? []).find(
      (item) => item.slot_order === slotOrder,
    );

    if (source) {
      return {
        type: "rule",
        label: resolveSourceLabel(source),
        logoUrl: null,
      };
    }

    if (phase.type === "group") {
      const [homeLabel, awayLabel] = parseGroupMatchLabels(match.name);
      const groupLabel = slotOrder === 1 ? homeLabel : awayLabel;

      if (groupLabel) {
        const assignedTeam = groupAssignmentMap[`${phase.id}:${groupLabel}`];

        if (assignedTeam) {
          return {
            type: "team",
            label: assignedTeam.name,
            logoUrl: assignedTeam.logo_url,
          };
        }

        return {
          type: "rule",
          label: groupLabel.toUpperCase(),
          logoUrl: null,
        };
      }
    }

    if (slot?.label && slot.label !== "home" && slot.label !== "away") {
      const assignedTeam = groupAssignmentMap[`${phase.id}:${slot.label}`];

      if (assignedTeam) {
        return {
          type: "team",
          label: assignedTeam.name,
          logoUrl: assignedTeam.logo_url,
        };
      }

      return {
        type: "rule",
        label: slot.label.toUpperCase(),
        logoUrl: null,
      };
    }

    return {
      type: "pending",
      label: "A definir",
      logoUrl: null,
    };
  }

  return phaseRows.map((phase) => {
    const phaseMatches = matches
      .filter((match) => match.phase_id === phase.id)
      .map((match) => ({
        id: match.id,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseOrder: phase.order_number,
        matchName: match.name,
        matchCode: match.code,
        roundNumber: match.round_number,
        groupLabel: match.group_label,
        scheduledAt: match.scheduled_at,
        isFinal: match.is_final ?? false,
        home: resolveSide(match, phaseMap[match.phase_id], 1),
        away: resolveSide(match, phaseMap[match.phase_id], 2),
      }))
      .sort(sortMatches);

    return {
      id: phase.id,
      name: phase.name,
      orderNumber: phase.order_number,
      matches: phaseMatches,
    };
  });
}

export function useChampionshipMatches(championshipId: string | null) {
  const [groups, setGroups] = useState<ChampionshipMatchPhaseGroup[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!championshipId) {
      setGroups([]);
      return;
    }

    setLoading(true);
    const nextGroups = await fetchChampionshipMatchGroups(championshipId);
    setGroups(nextGroups);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function run() {
      if (!championshipId) {
        if (active) {
          setGroups([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const nextGroups = await fetchChampionshipMatchGroups(championshipId);

      if (!active) return;

      setGroups(nextGroups);
      setLoading(false);
    }

    void run();

    return () => {
      active = false;
    };
  }, [championshipId]);

  async function saveMatchDetails(matchId: string, scheduledAtValue: string, roundNumber: number, isFinal: boolean = false) {
    const scheduledAt = toIsoFromDateTimeLocal(scheduledAtValue);

    if (isFinal) {
      // Check if another match is already marked as final
      const phaseIds = groups.map(g => g.id);
      if (phaseIds.length > 0) {
        const { data: existingFinals } = await supabase
          .from("knockout_matches")
          .select("id")
          .in("phase_id", phaseIds)
          .eq("is_final", true)
          .neq("id", matchId);
        
        if (existingFinals && existingFinals.length > 0) {
          return { error: "Já existe outro jogo marcado como final neste campeonato." };
        }
      }
    }

    const { error } = await supabase
      .from("knockout_matches")
      .update({ 
        scheduled_at: scheduledAt,
        round_number: roundNumber,
        is_final: isFinal
      })
      .eq("id", matchId);

    if (error) {
      return { error: error.message };
    }

    setGroups((current) =>
      current.map((group) => ({
        ...group,
        matches: group.matches
          .map((match) =>
            match.id === matchId ? { ...match, scheduledAt, roundNumber, isFinal } : match,
          )
          .sort(sortMatches),
      })),
    );

    return { error: null };
  }

  return {
    groups,
    loading,
    reload: load,
    saveMatchDetails,
  };
}
