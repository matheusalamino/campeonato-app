"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TieBreakerCriterion } from "@/types/championship";

const supabase = createClient();

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

export function useGroupStandings(championshipId: string | null, phaseId: string | null) {
  const [standings, setStandings] = useState<Record<string, TeamStanding[]>>({});
  const [loading, setLoading] = useState(false);

  const calculate = useCallback(async () => {
    if (!championshipId || !phaseId) return;
    setLoading(true);

    // 1. Fetch rules, groups, teams, and matches
    const [
      { data: rules },
      { data: groups },
      { data: teamsRows },
      { data: matches },
      { data: champSettings }
    ] = await Promise.all([
      supabase.from("tie_breaker_rules").select("rule, priority").eq("phase_id", phaseId).order("priority"),
      supabase.from("groups").select("id, name").eq("phase_id", phaseId),
      supabase.from("championship_teams").select("id, team_id, teams(name, logo_url)").eq("championship_id", championshipId),
      supabase.from("knockout_matches").select("*").eq("phase_id", phaseId).eq("status", "COMPLETED"),
      supabase.from("championships").select("points_win, points_draw, points_loss").eq("id", championshipId).single()
    ]);

    const ptsWin = champSettings?.points_win ?? 3;
    const ptsDraw = champSettings?.points_draw ?? 1;
    const ptsLoss = champSettings?.points_loss ?? 0;

    // Map championship_team_id to team info
    const ctMap: Record<string, any> = {};
    (teamsRows ?? []).forEach(ct => {
      ctMap[ct.id] = { 
        teamId: ct.team_id, 
        name: ct.teams?.name ?? "Time", 
        logoUrl: ct.teams?.logo_url ?? null 
      };
    });

    // Initialize standings for each group
    const groupStandings: Record<string, Record<string, TeamStanding>> = {};
    (groups ?? []).forEach(g => {
      groupStandings[g.id] = {};
    });

    // We also need to know which team belongs to which group
    const { data: groupSlots } = await supabase.from("group_slots").select("group_letter, championship_team_id").eq("phase_id", phaseId);
    
    // Helper to find group id by letter (e.g. 'A' -> matches 'Grupo A' or 'A')
    const findGroupIdByLetter = (letter: string) => {
      return (groups ?? []).find(g => g.name === letter || g.name.endsWith(` ${letter}`))?.id;
    };

    (groupSlots ?? []).forEach(slot => {
      const groupId = findGroupIdByLetter(slot.group_letter);
      if (groupId && slot.championship_team_id && groupStandings[groupId]) {
        const team = ctMap[slot.championship_team_id];
        if (team) {
          groupStandings[groupId][slot.championship_team_id] = {
            teamId: team.teamId,
            championshipTeamId: slot.championship_team_id,
            name: team.name,
            logoUrl: team.logoUrl,
            played: 0, won: 0, drawn: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
            points: 0,
            recentForm: []
          };
        }
      }
    });

    // Process matches
    // Need match_slots to know who played in each knockout_match
    const { data: slots } = await supabase.from("match_slots").select("match_id, slot_order, championship_team_id");
    const matchToTeams: Record<string, { homeCT?: string, awayCT?: string }> = {};
    (slots ?? []).forEach(s => {
      if (!matchToTeams[s.match_id]) matchToTeams[s.match_id] = {};
      if (s.slot_order === 1) matchToTeams[s.match_id].homeCT = s.championship_team_id;
      if (s.slot_order === 2) matchToTeams[s.match_id].awayCT = s.championship_team_id;
    });

    (matches ?? []).forEach(m => {
      const teams = matchToTeams[m.id];
      if (!teams || !teams.homeCT || !teams.awayCT) return;

      // Find which group these teams belong to
      const homeSlot = (groupSlots ?? []).find(gs => gs.championship_team_id === teams.homeCT);
      const groupId = homeSlot ? findGroupIdByLetter(homeSlot.group_letter) : null;
      if (!groupId || !groupStandings[groupId]) return;

      const home = groupStandings[groupId][teams.homeCT];
      const away = groupStandings[groupId][teams.awayCT];
      if (!home || !away) return;

      const hScore = m.home_score ?? 0;
      const aScore = m.away_score ?? 0;

      home.played++;
      away.played++;
      home.goalsFor += hScore;
      home.goalsAgainst += aScore;
      away.goalsFor += aScore;
      away.goalsAgainst += hScore;

      if (hScore > aScore) {
        home.won++; home.points += ptsWin; home.recentForm.push("W");
        away.lost++; away.points += ptsLoss; away.recentForm.push("L");
      } else if (hScore < aScore) {
        away.won++; away.points += ptsWin; away.recentForm.push("W");
        home.lost++; home.points += ptsLoss; home.recentForm.push("L");
      } else {
        home.drawn++; home.points += ptsDraw; home.recentForm.push("D");
        away.drawn++; away.points += ptsDraw; away.recentForm.push("D");
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst;
      away.goalDifference = away.goalsFor - away.goalsAgainst;
    });

    // Sort function based on rules
    const sortStandings = (a: TeamStanding, b: TeamStanding) => {
      const criteria = rules?.length ? rules.map(r => r.rule as TieBreakerCriterion) : ["points", "goal_diff", "goals_for"];
      
      for (const rule of criteria) {
        if (rule === "points") {
          if (a.points !== b.points) return b.points - a.points;
        }
        if (rule === "goal_diff") {
          if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        }
        if (rule === "goals_for") {
          if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
        }
        if (rule === "wins") {
          if (a.won !== b.won) return b.won - a.won;
        }
      }
      return a.name.localeCompare(b.name);
    };

    const finalStandings: Record<string, TeamStanding[]> = {};
    Object.keys(groupStandings).forEach(gid => {
      finalStandings[gid] = Object.values(groupStandings[gid]).sort(sortStandings);
    });

    setStandings(finalStandings);
    setLoading(false);
  }, [championshipId, phaseId]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  return { standings, loading, reload: calculate };
}
