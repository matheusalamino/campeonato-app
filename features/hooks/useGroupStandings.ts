"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TieBreakerCriterion } from "@/types/championship";

const supabase = createClient();

type TeamRelation = {
  name: string | null;
  logo_url: string | null;
};

function singleTeamRelation(teams: TeamRelation | TeamRelation[] | null): TeamRelation | null {
  return Array.isArray(teams) ? (teams[0] ?? null) : teams;
}

export type TeamStanding = {
  teamId: string;
  championshipTeamId: string;
  name: string;
  logoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  recentForm: ("W" | "D" | "L")[];
};

function normalizeGroupName(name: string | null | undefined, fallbackLetter?: string | null): string {
  const raw = (name ?? "").trim();
  const fallback = (fallbackLetter ?? "").trim().toUpperCase();
  const letterFromName = raw.match(/(?:^|\s)grupo\s+([A-Z])\b/i)?.[1] ?? raw.match(/^([A-Z])$/i)?.[1];
  const letter = (letterFromName ?? fallback).toUpperCase();

  if (letter) return `Grupo ${letter}`;
  if (/^grupo\s+/i.test(raw)) return raw;
  return raw ? `Grupo ${raw}` : "Grupo";
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook fetches group standings for a given championship phase.
// It includes IN_PROGRESS matches, computes live scores from events, and
// auto-refreshes via polling (every 15 s) + Supabase Realtime.
// ─────────────────────────────────────────────────────────────────────────────
export function useGroupStandings(championshipId: string | null, phaseId: string | null) {
  const [standings, setStandings] = useState<Record<string, TeamStanding[]>>({});
  const [groupLabels, setGroupLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use refs so the calculate function is stable and doesn't re-create unnecessarily
  const championshipIdRef = useRef(championshipId);
  const phaseIdRef = useRef(phaseId);

  useEffect(() => {
    championshipIdRef.current = championshipId;
    phaseIdRef.current = phaseId;
  });

  const calculate = useCallback(async () => {
    const cId = championshipIdRef.current;
    const pId = phaseIdRef.current;
    if (!cId || !pId) return;

    setLoading(true);

    try {
      // ── 1. Fetch all needed data in parallel ─────────────────────────────
      const [
        { data: rules },
        { data: groups },
        { data: teamsRows },
        { data: matches },
        { data: champSettings },
        { data: groupSlots },
        { data: allSlots },
        { data: goalEvents },
      ] = await Promise.all([
        supabase.from("tie_breaker_rules").select("rule, priority").eq("phase_id", pId).order("priority"),
        supabase.from("groups").select("id, name").eq("phase_id", pId),
        supabase.from("championship_teams").select("id, team_id, teams(name, logo_url)").eq("championship_id", cId),
        // Include both COMPLETED and IN_PROGRESS — live games must appear immediately
        supabase
          .from("knockout_matches")
          .select("id, status, home_score, away_score, name")
          .eq("phase_id", pId)
          .in("status", ["COMPLETED", "IN_PROGRESS"]),
        supabase.from("championships").select("points_win, points_draw, points_loss").eq("id", cId).single(),
        supabase.from("group_slots").select("group_letter, label, championship_team_id").eq("phase_id", pId),
        // All slots (no phase filter) — filtered later by match ids
        supabase
          .from("match_slots")
          .select("match_id, slot_order, championship_team_id")
          .order("slot_order", { ascending: true }),
        // Only goal events that are not soft-deleted
        supabase
          .from("match_events_v2")
          .select("knockout_match_id, event_type, team_id")
          .is("deleted_at", null)
          .in("event_type", ["GOAL", "OWN_GOAL", "PENALTY_GOAL"]),
      ]);

      const ptsWin  = champSettings?.points_win  ?? 3;
      const ptsDraw = champSettings?.points_draw ?? 1;
      const ptsLoss = champSettings?.points_loss ?? 0;

      // ── 2. CT → team info map ─────────────────────────────────────────────
      const ctMap: Record<string, { teamId: string; name: string; logoUrl: string | null }> = {};
      (teamsRows ?? []).forEach((ct) => {
        const team = singleTeamRelation(ct.teams);
        ctMap[ct.id] = {
          teamId: ct.team_id,
          name: team?.name ?? "Time",
          logoUrl: team?.logo_url ?? null,
        };
      });

      // ── 3. Initialize standings per group ─────────────────────────────────
      const groupStandings: Record<string, Record<string, TeamStanding>> = {};
      (groups ?? []).forEach((g) => { groupStandings[g.id] = {}; });

      // ── 4. Helper: find group ID by letter (robust, case-insensitive) ─────
      const findGroupId = (letter: string): string | undefined => {
        const l = (letter ?? "").trim().toUpperCase();
        const found = (groups ?? []).find((g) => {
          const n = g.name.toUpperCase();
          return n === l || n.endsWith(` ${l}`) || n.includes(`GRUPO ${l}`);
        });
        if (found) return found.id;
        // Single-group phase → always use that group as fallback
        if ((groups ?? []).length === 1) return groups![0].id;
        return undefined;
      };

      // ── 5. Seed each group with its teams at 0 stats ──────────────────────
      (groupSlots ?? []).forEach((slot) => {
        const groupId = findGroupId(slot.group_letter);
        if (!groupId || !slot.championship_team_id || !groupStandings[groupId]) return;
        const team = ctMap[slot.championship_team_id];
        if (!team) return;
        groupStandings[groupId][slot.championship_team_id] = {
          teamId: team.teamId,
          championshipTeamId: slot.championship_team_id,
          name: team.name,
          logoUrl: team.logoUrl,
          played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
          points: 0,
          recentForm: [],
        };
      });

      const orderedGroupLetters = Array.from(
        new Set((groupSlots ?? []).map((slot) => slot.group_letter).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      const lettersByGroupId: Record<string, string> = {};
      (groupSlots ?? []).forEach((slot) => {
        const groupId = findGroupId(slot.group_letter);
        if (groupId && !lettersByGroupId[groupId]) {
          lettersByGroupId[groupId] = slot.group_letter;
        }
      });

      const labelsByGroupId: Record<string, string> = {};
      (groups ?? []).forEach((group, index) => {
        labelsByGroupId[group.id] = normalizeGroupName(
          group.name,
          lettersByGroupId[group.id] ?? orderedGroupLetters[index],
        );
      });

      // ── 6. match → {homeCT, awayCT} map ──────────────────────────────────
      // Group-phase matches have championship_team_id = null in match_slots.
      // Teams are resolved via the match name (e.g. "A1 x A3") against the
      // group_slots.label column — same fallback useMatchDetail already uses.
      // Build label → championship_team_id map from group_slots
      const labelToCT: Record<string, string> = {};
      (groupSlots ?? []).forEach((gs) => {
        if (gs.label && gs.championship_team_id) {
          labelToCT[gs.label] = gs.championship_team_id;
        }
      });

      const matchToTeams: Record<string, { homeCT: string; awayCT: string }> = {};
      (matches ?? []).forEach((m) => {
        // 1st priority: match_slots with non-null CT (knockout phases)
        const homeSlot = (allSlots ?? []).find(
          (s) => s.match_id === m.id && s.slot_order === 1 && s.championship_team_id,
        );
        const awaySlot = (allSlots ?? []).find(
          (s) => s.match_id === m.id && s.slot_order === 2 && s.championship_team_id,
        );
        if (homeSlot?.championship_team_id && awaySlot?.championship_team_id) {
          matchToTeams[m.id] = { homeCT: homeSlot.championship_team_id, awayCT: awaySlot.championship_team_id };
          return;
        }

        // 2nd priority: parse match name ("A1 x A3") and look up label → CT
        if (m.name) {
          const parts = (m.name as string).split(/\s+x\s+/i).map((p) => p.trim());
          const homeCT = labelToCT[parts[0]];
          const awayCT = labelToCT[parts[1]];
          if (homeCT && awayCT) {
            matchToTeams[m.id] = { homeCT, awayCT };
          }
        }
      });

      // ── 7. Index goal events by match ─────────────────────────────────────
      const goalsByMatch: Record<string, Array<{ event_type: string; team_id: string }>> = {};
      (goalEvents ?? []).forEach((ev) => {
        if (!goalsByMatch[ev.knockout_match_id]) goalsByMatch[ev.knockout_match_id] = [];
        goalsByMatch[ev.knockout_match_id].push(ev);
      });

      // ── 8. Process each match ─────────────────────────────────────────────
      (matches ?? []).forEach((m) => {
        const teams = matchToTeams[m.id];
        if (!teams?.homeCT || !teams?.awayCT) return;

        const homeGroupSlot = (groupSlots ?? []).find((gs) => gs.championship_team_id === teams.homeCT);
        const groupId = homeGroupSlot ? findGroupId(homeGroupSlot.group_letter) : undefined;
        if (!groupId || !groupStandings[groupId]) return;

        const home = groupStandings[groupId][teams.homeCT];
        const away = groupStandings[groupId][teams.awayCT];
        if (!home || !away) return;

        let hScore: number;
        let aScore: number;

        if (m.status === "IN_PROGRESS") {
          const evs = goalsByMatch[m.id] ?? [];
          hScore = evs.filter(
            (e) =>
              ((e.event_type === "GOAL" || e.event_type === "PENALTY_GOAL") && e.team_id === teams.homeCT) ||
              (e.event_type === "OWN_GOAL" && e.team_id === teams.awayCT),
          ).length;
          aScore = evs.filter(
            (e) =>
              ((e.event_type === "GOAL" || e.event_type === "PENALTY_GOAL") && e.team_id === teams.awayCT) ||
              (e.event_type === "OWN_GOAL" && e.team_id === teams.homeCT),
          ).length;
        } else {
          hScore = m.home_score ?? 0;
          aScore = m.away_score ?? 0;
        }

        home.played++;
        away.played++;
        home.goalsFor     += hScore;
        home.goalsAgainst += aScore;
        away.goalsFor     += aScore;
        away.goalsAgainst += hScore;

        if (hScore > aScore) {
          home.won++;   home.points  += ptsWin;  home.recentForm.push("W");
          away.lost++;  away.points  += ptsLoss; away.recentForm.push("L");
        } else if (hScore < aScore) {
          away.won++;   away.points  += ptsWin;  away.recentForm.push("W");
          home.lost++;  home.points  += ptsLoss; home.recentForm.push("L");
        } else {
          home.drawn++; home.points  += ptsDraw; home.recentForm.push("D");
          away.drawn++; away.points  += ptsDraw; away.recentForm.push("D");
        }

        home.goalDifference = home.goalsFor - home.goalsAgainst;
        away.goalDifference = away.goalsFor - away.goalsAgainst;
      });

      // ── 9. Sort by tie-breaker rules ──────────────────────────────────────
      const criteria = (rules ?? []).length
        ? (rules ?? []).map((r) => r.rule as TieBreakerCriterion)
        : (["points", "goal_diff", "goals_for"] as TieBreakerCriterion[]);

      const sortStandings = (a: TeamStanding, b: TeamStanding): number => {
        for (const rule of criteria) {
          if (rule === "points"    && a.points         !== b.points)         return b.points         - a.points;
          if (rule === "goal_diff" && a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
          if (rule === "goals_for" && a.goalsFor       !== b.goalsFor)       return b.goalsFor       - a.goalsFor;
          if (rule === "wins"      && a.won            !== b.won)            return b.won            - a.won;
        }
        return a.name.localeCompare(b.name);
      };

      const finalStandings: Record<string, TeamStanding[]> = {};
      Object.keys(groupStandings).forEach((gid) => {
        finalStandings[gid] = Object.values(groupStandings[gid]).sort(sortStandings);
      });

      setStandings(finalStandings);
      setGroupLabels(labelsByGroupId);
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads IDs from refs

  // ── 10. Run on mount / when IDs change + polling + Realtime ──────────────
  useEffect(() => {
    void calculate();

    // ── Polling every 15 s ────────────────────────────────────────────────
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => { void calculate(); }, 15_000);

    // ── Supabase Realtime subscriptions ───────────────────────────────────
    const cId = championshipIdRef.current;
    const pId = phaseIdRef.current;
    if (!cId || !pId) return;

    const channel = supabase
      .channel(`group-standings-${pId}-${Date.now()}`)
      // Match status or score changed (started, finished, score synced)
      .on("postgres_changes", { event: "*", schema: "public", table: "knockout_matches", filter: `phase_id=eq.${pId}` }, () => { void calculate(); })
      // Goal inserted or soft-deleted
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events_v2" }, () => { void calculate(); })
      // Tie-breaker rule change → re-sort immediately
      .on("postgres_changes", { event: "*", schema: "public", table: "tie_breaker_rules", filter: `phase_id=eq.${pId}` }, () => { void calculate(); })
      .subscribe();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [championshipId, phaseId, calculate]);

  return { standings, groupLabels, loading, reload: calculate };
}
