/**
 * Resolves which team occupies a knockout match slot using live data:
 * - group_position: computes current standings and picks the Nth-place team
 * - match_winner / match_loser: finds the match by code, resolves its teams
 *   recursively, then determines winner/loser from live score
 *
 * Matches that have NOT started (status === "NOT_STARTED") are excluded
 * from standings computation — consistent with the user requirement.
 */

type MatchRow = {
  id: string;
  phase_id: string;
  name: string | null;
  code: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  penalty_home_score: number | null;
  penalty_away_score: number | null;
  penalty_winner_team_id: string | null;
};

type SourceRow = {
  knockout_match_id: string;
  slot_order: number;
  source_type: string;
  source_phase_id: string | null;
  source_group: string | null;
  source_position: number | null;
  source_match_code: string | null;
};

type SlotRow = {
  match_id: string;
  slot_order: number;
  championship_team_id: string | null;
};

type GroupSlotRow = {
  phase_id: string;
  label: string;
  group_letter: string | null;
  championship_team_id: string | null;
};

type GoalEvent = {
  knockout_match_id: string;
  event_type: string;
  team_id: string;
};

type TieBreakerRuleRow = {
  phase_id: string;
  rule: string;
};

type PointsConfig = { win: number; draw: number; loss: number };

export type ResolutionContext = {
  // phaseId → groupLetter → [ctId ranked 1st → last]
  groupRanksByPhase: Record<string, Record<string, string[]>>;
  matchByCode: Record<string, MatchRow>;
  sourcesByMatchSlot: Record<string, Record<number, SourceRow>>;
  // matchId → slotOrder → championship_team_id
  slotCtByMatchSlot: Record<string, Record<number, string | null>>;
  goalsByMatchId: Record<string, GoalEvent[]>;
};

export function buildResolutionContext(
  matchRows: MatchRow[],
  slots: SlotRow[],
  groupSlots: GroupSlotRow[],
  sources: SourceRow[],
  goalEvents: GoalEvent[],
  tieBreakerRules: TieBreakerRuleRow[],
  pointsConfig: PointsConfig,
): ResolutionContext {
  // matchByCode
  const matchByCode: Record<string, MatchRow> = {};
  for (const m of matchRows) {
    if (m.code) matchByCode[m.code] = m;
  }

  // sourcesByMatchSlot
  const sourcesByMatchSlot: Record<string, Record<number, SourceRow>> = {};
  for (const s of sources) {
    if (!sourcesByMatchSlot[s.knockout_match_id]) sourcesByMatchSlot[s.knockout_match_id] = {};
    sourcesByMatchSlot[s.knockout_match_id][s.slot_order] = s;
  }

  // slotCtByMatchSlot
  const slotCtByMatchSlot: Record<string, Record<number, string | null>> = {};
  for (const s of slots) {
    if (!slotCtByMatchSlot[s.match_id]) slotCtByMatchSlot[s.match_id] = {};
    slotCtByMatchSlot[s.match_id][s.slot_order] = s.championship_team_id;
  }

  // goalsByMatchId
  const goalsByMatchId: Record<string, GoalEvent[]> = {};
  for (const ev of goalEvents) {
    if (!goalsByMatchId[ev.knockout_match_id]) goalsByMatchId[ev.knockout_match_id] = [];
    goalsByMatchId[ev.knockout_match_id].push(ev);
  }

  // Group rankings — only computed for phases referenced as source_phase_id
  const sourcePhaseIds = new Set(
    sources
      .filter(s => s.source_type === "group_position" && s.source_phase_id)
      .map(s => s.source_phase_id!),
  );

  const groupRanksByPhase: Record<string, Record<string, string[]>> = {};

  for (const phaseId of sourcePhaseIds) {
    const labelToCt: Record<string, string> = {};
    const teamsByGroup: Record<string, Set<string>> = {};

    for (const gs of groupSlots) {
      if (gs.phase_id !== phaseId || !gs.championship_team_id) continue;
      if (gs.label) labelToCt[gs.label] = gs.championship_team_id;
      if (gs.group_letter) {
        if (!teamsByGroup[gs.group_letter]) teamsByGroup[gs.group_letter] = new Set();
        teamsByGroup[gs.group_letter].add(gs.championship_team_id);
      }
    }

    type Stats = { letter: string; pts: number; gf: number; ga: number; gd: number; w: number; d: number; l: number };
    const stats: Record<string, Stats> = {};
    for (const [letter, ctSet] of Object.entries(teamsByGroup)) {
      for (const ctId of ctSet) {
        stats[ctId] = { letter, pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0 };
      }
    }

    for (const m of matchRows) {
      if (m.phase_id !== phaseId) continue;
      if (m.status !== "IN_PROGRESS" && m.status !== "COMPLETED") continue;

      let homeCt: string | null = slotCtByMatchSlot[m.id]?.[1] ?? null;
      let awayCt: string | null = slotCtByMatchSlot[m.id]?.[2] ?? null;

      if (!homeCt || !awayCt) {
        if (m.name) {
          const parts = m.name.split(/\s+x\s+/i).map(p => p.trim());
          homeCt = labelToCt[parts[0]] ?? null;
          awayCt = labelToCt[parts[1]] ?? null;
        }
      }

      if (!homeCt || !awayCt || !stats[homeCt] || !stats[awayCt]) continue;

      let hScore: number;
      let aScore: number;

      if (m.status === "IN_PROGRESS") {
        const evs = goalsByMatchId[m.id] ?? [];
        hScore = evs.filter(e =>
          (e.event_type === "GOAL" && e.team_id === homeCt) ||
          (e.event_type === "OWN_GOAL" && e.team_id === awayCt),
        ).length;
        aScore = evs.filter(e =>
          (e.event_type === "GOAL" && e.team_id === awayCt) ||
          (e.event_type === "OWN_GOAL" && e.team_id === homeCt),
        ).length;
      } else {
        hScore = m.home_score ?? 0;
        aScore = m.away_score ?? 0;
      }

      stats[homeCt].gf += hScore;
      stats[homeCt].ga += aScore;
      stats[awayCt].gf += aScore;
      stats[awayCt].ga += hScore;

      if (hScore > aScore) {
        stats[homeCt].w++; stats[homeCt].pts += pointsConfig.win;
        stats[awayCt].l++; stats[awayCt].pts += pointsConfig.loss;
      } else if (hScore < aScore) {
        stats[awayCt].w++; stats[awayCt].pts += pointsConfig.win;
        stats[homeCt].l++; stats[homeCt].pts += pointsConfig.loss;
      } else {
        stats[homeCt].d++; stats[homeCt].pts += pointsConfig.draw;
        stats[awayCt].d++; stats[awayCt].pts += pointsConfig.draw;
      }

      stats[homeCt].gd = stats[homeCt].gf - stats[homeCt].ga;
      stats[awayCt].gd = stats[awayCt].gf - stats[awayCt].ga;
    }

    const phaseCriteria = tieBreakerRules.filter(r => r.phase_id === phaseId).map(r => r.rule);
    const criteria = phaseCriteria.length ? phaseCriteria : ["points", "goal_diff", "goals_for"];

    const ranksByGroup: Record<string, string[]> = {};
    for (const letter of Object.keys(teamsByGroup)) {
      ranksByGroup[letter] = Object.entries(stats)
        .filter(([, s]) => s.letter === letter)
        .sort(([, a], [, b]) => {
          for (const rule of criteria) {
            if (rule === "points"    && a.pts !== b.pts) return b.pts - a.pts;
            if (rule === "goal_diff" && a.gd  !== b.gd)  return b.gd  - a.gd;
            if (rule === "goals_for" && a.gf  !== b.gf)  return b.gf  - a.gf;
            if (rule === "wins"      && a.w   !== b.w)   return b.w   - a.w;
          }
          return 0;
        })
        .map(([ctId]) => ctId);
    }

    groupRanksByPhase[phaseId] = ranksByGroup;
  }

  return { groupRanksByPhase, matchByCode, sourcesByMatchSlot, slotCtByMatchSlot, goalsByMatchId };
}

/**
 * Resolves the championship_team_id occupying `slotOrder` of `matchId`.
 * Returns null when the team is not yet determined (source match not started,
 * match still level with no penalty result, or no source configured).
 */
export function resolveCtId(
  matchId: string,
  slotOrder: number,
  ctx: ResolutionContext,
  depth = 0,
): string | null {
  if (depth > 5) return null;

  const directCtId = ctx.slotCtByMatchSlot[matchId]?.[slotOrder] ?? null;
  if (directCtId) return directCtId;

  const source = ctx.sourcesByMatchSlot[matchId]?.[slotOrder];
  if (!source) return null;

  if (source.source_type === "group_position" && source.source_phase_id && source.source_group && source.source_position) {
    const rankings = ctx.groupRanksByPhase[source.source_phase_id]?.[source.source_group];
    return rankings?.[source.source_position - 1] ?? null;
  }

  if (source.source_type === "match_winner" || source.source_type === "match_loser") {
    const code = source.source_match_code;
    if (!code) return null;
    const srcMatch = ctx.matchByCode[code];
    if (!srcMatch) return null;
    if (srcMatch.status !== "IN_PROGRESS" && srcMatch.status !== "COMPLETED") return null;

    const homeCt = resolveCtId(srcMatch.id, 1, ctx, depth + 1);
    const awayCt = resolveCtId(srcMatch.id, 2, ctx, depth + 1);
    if (!homeCt || !awayCt) return null;

    let hScore: number;
    let aScore: number;

    if (srcMatch.status === "IN_PROGRESS") {
      const evs = ctx.goalsByMatchId[srcMatch.id] ?? [];
      hScore = evs.filter(e =>
        (e.event_type === "GOAL" && e.team_id === homeCt) ||
        (e.event_type === "OWN_GOAL" && e.team_id === awayCt),
      ).length;
      aScore = evs.filter(e =>
        (e.event_type === "GOAL" && e.team_id === awayCt) ||
        (e.event_type === "OWN_GOAL" && e.team_id === homeCt),
      ).length;
    } else {
      hScore = srcMatch.home_score ?? 0;
      aScore = srcMatch.away_score ?? 0;

      if (hScore === aScore) {
        // Completed with draw — resolve via penalties
        if (srcMatch.penalty_winner_team_id) {
          const winner = srcMatch.penalty_winner_team_id === homeCt ? homeCt : awayCt;
          const loser = srcMatch.penalty_winner_team_id === homeCt ? awayCt : homeCt;
          return source.source_type === "match_winner" ? winner : loser;
        }
        const ph = srcMatch.penalty_home_score ?? 0;
        const pa = srcMatch.penalty_away_score ?? 0;
        if (ph === pa) return null;
        const winner = ph > pa ? homeCt : awayCt;
        const loser = ph > pa ? awayCt : homeCt;
        return source.source_type === "match_winner" ? winner : loser;
      }
    }

    if (hScore === aScore) return null; // in-progress draw, no winner yet

    const winner = hScore > aScore ? homeCt : awayCt;
    const loser = hScore > aScore ? awayCt : homeCt;
    return source.source_type === "match_winner" ? winner : loser;
  }

  return null;
}
