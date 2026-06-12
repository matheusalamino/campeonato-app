import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export type AddMatchEventParams = {
  knockoutMatchId: string;
  teamId: string;            // championship_team_id
  registrationId: string | null;
  eventType: string;
  eventTimeS: number;
  period: string;
  assistPlayerId?: string | null;
  playerInId?: string | null;
  championshipId: string;
};

export type RemoveMatchEventParams = {
  eventId: string;
  knockoutMatchId: string;
  registrationId: string | null;
  eventType: string;
};

export type AddPenaltyEventParams = {
  knockoutMatchId: string;
  championshipId: string;
  teamId: string;
  registrationId: string;
  eventTimeS: number;
  period: string;
  outcome: "PENALTY_GOAL" | "PENALTY_OUT" | "PENALTY_SAVED";
  goalkeeperRegistrationId?: string | null;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export async function addMatchEvent(params: AddMatchEventParams): Promise<void> {
  const {
    knockoutMatchId,
    teamId,
    registrationId,
    eventType,
    eventTimeS,
    period,
    assistPlayerId,
    playerInId,
    championshipId,
  } = params;

  const { error } = await supabase.from("match_events_v2").insert({
    knockout_match_id: knockoutMatchId,
    team_id: teamId,
    player_id: registrationId ?? null,
    assist_player_id: assistPlayerId ?? null,
    player_in_id: playerInId ?? null,
    event_type: eventType,
    event_time_s: eventTimeS,
    period,
  });

  if (error) throw new Error(`Failed to insert match event: ${error.message}`);

  if (!registrationId) return;

  if (eventType === "RED_CARD") {
    await handleRedCard(registrationId, knockoutMatchId, teamId, championshipId);
  } else if (eventType === "YELLOW_CARD") {
    await handleYellowCard(registrationId, knockoutMatchId, teamId, championshipId);
  }
}

export async function removeMatchEvent(params: RemoveMatchEventParams): Promise<void> {
  const { eventId, knockoutMatchId, registrationId, eventType } = params;

  const { error: deleteError } = await supabase
    .from("match_events_v2")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);

  if (deleteError) throw new Error(`Failed to remove match event: ${deleteError.message}`);

  if (!registrationId) return;

  if (eventType === "RED_CARD") {
    await reverseRedCard(registrationId, knockoutMatchId);
  } else if (eventType === "YELLOW_CARD") {
    await reverseYellowCard(registrationId, knockoutMatchId);
  }
}

export async function addPenaltyEvent(params: AddPenaltyEventParams): Promise<void> {
  const {
    knockoutMatchId,
    championshipId,
    teamId,
    registrationId,
    eventTimeS,
    period,
    outcome,
    goalkeeperRegistrationId,
  } = params;

  const { error } = await supabase.from("match_events_v2").insert({
    knockout_match_id: knockoutMatchId,
    team_id: teamId,
    player_id: registrationId,
    player_in_id: outcome === "PENALTY_SAVED" ? (goalkeeperRegistrationId ?? null) : null,
    event_type: outcome,
    event_time_s: eventTimeS,
    period,
  });

  if (error) throw new Error(`Failed to insert penalty event: ${error.message}`);

  if (outcome === "PENALTY_SAVED" && goalkeeperRegistrationId) {
    const { error: saveError } = await supabase.from("player_saves").insert({
      match_id: knockoutMatchId,
      championship_id: championshipId,
      registration_id: goalkeeperRegistrationId,
      is_penalty: true,
    });
    if (saveError) throw new Error(`Failed to insert penalty save: ${saveError.message}`);
  }
}

// ─── Card handlers ────────────────────────────────────────────────────────────

async function handleRedCard(
  registrationId: string,
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<void> {
  const suspendedMatchId = await findNextMatch(
    knockoutMatchId,
    championshipTeamId,
    championshipId,
  );

  const { error } = await supabase.from("suspensions").insert({
    registration_id: registrationId,
    origin_match_id: knockoutMatchId,
    suspended_match_id: suspendedMatchId,
    reason: "red_card",
    served: false,
  });

  if (error) throw new Error(`Failed to create red card suspension: ${error.message}`);
}

async function handleYellowCard(
  registrationId: string,
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<void> {
  // Guard: if the player already had a YELLOW_CARD in this match before this one,
  // this is a 2nd yellow in the same match — referee handles it as a red card (expulsion).
  // Accumulation logic must NOT fire in this case.
  // Note: the event we just inserted is already in the DB, so count >= 2 means a prior yellow existed.
  const { data: existingYellows } = await supabase
    .from("match_events_v2")
    .select("id")
    .eq("knockout_match_id", knockoutMatchId)
    .eq("player_id", registrationId)
    .eq("event_type", "YELLOW_CARD")
    .is("deleted_at", null);

  if ((existingYellows?.length ?? 0) >= 2) {
    // 2nd yellow in the same match → expulsion. Treat as suspension + reset counter.
    const suspendedMatchId = await findNextMatch(knockoutMatchId, championshipTeamId, championshipId);
    const { error: suspError } = await supabase.from("suspensions").insert({
      registration_id: registrationId,
      origin_match_id: knockoutMatchId,
      suspended_match_id: suspendedMatchId,
      reason: "two_yellows",
      served: false,
    });
    if (suspError) throw new Error(`Failed to create two_yellows suspension: ${suspError.message}`);
    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 0, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
    return;
  }

  // Ensure player_card_stats row exists (create with 0 if first yellow ever).
  await supabase
    .from("player_card_stats")
    .upsert(
      { registration_id: registrationId, active_yellow_cards: 0 },
      { onConflict: "registration_id", ignoreDuplicates: true },
    );

  const { data: stats } = await supabase
    .from("player_card_stats")
    .select("active_yellow_cards")
    .eq("registration_id", registrationId)
    .single();

  const activeYellows = stats?.active_yellow_cards ?? 0;

  if (activeYellows === 0) {
    // First active yellow: player is now pendurado (on a booking).
    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 1, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
  } else if (activeYellows === 1) {
    // Second active yellow from a DIFFERENT match: suspend + reset counter.
    const suspendedMatchId = await findNextMatch(
      knockoutMatchId,
      championshipTeamId,
      championshipId,
    );

    const { error: suspError } = await supabase.from("suspensions").insert({
      registration_id: registrationId,
      origin_match_id: knockoutMatchId,
      suspended_match_id: suspendedMatchId,
      reason: "two_yellows",
      served: false,
    });

    if (suspError) throw new Error(`Failed to create two_yellows suspension: ${suspError.message}`);

    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 0, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
  } else {
    // Unexpected state: active_yellow_cards > 1. This should not happen in normal
    // operation. Log and skip to avoid creating duplicate suspensions.
    console.error(
      `[match-events] Unexpected active_yellow_cards=${activeYellows} for registration ${registrationId}. Skipping suspension.`,
    );
  }
}

// ─── Reversal handlers ────────────────────────────────────────────────────────

async function reverseRedCard(
  registrationId: string,
  knockoutMatchId: string,
): Promise<void> {
  // No-op if no unserved red-card suspension exists.
  await supabase
    .from("suspensions")
    .delete()
    .eq("registration_id", registrationId)
    .eq("origin_match_id", knockoutMatchId)
    .eq("reason", "red_card")
    .eq("served", false);
}

async function reverseYellowCard(
  registrationId: string,
  knockoutMatchId: string,
): Promise<void> {
  // Check if this yellow was the one that triggered a two_yellows suspension.
  const { data: suspension } = await supabase
    .from("suspensions")
    .select("id")
    .eq("registration_id", registrationId)
    .eq("origin_match_id", knockoutMatchId)
    .eq("reason", "two_yellows")
    .eq("served", false)
    .maybeSingle();

  if (suspension) {
    // This was the 2nd yellow: remove suspension and restore counter to 1.
    await supabase.from("suspensions").delete().eq("id", suspension.id);
    await supabase
      .from("player_card_stats")
      .update({ active_yellow_cards: 1, updated_at: new Date().toISOString() })
      .eq("registration_id", registrationId);
    return;
  }

  // This was the 1st yellow (player was pendurado): decrement counter, minimum 0.
  const { data: stats } = await supabase
    .from("player_card_stats")
    .select("active_yellow_cards")
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (!stats) return;

  await supabase
    .from("player_card_stats")
    .update({
      active_yellow_cards: Math.max(0, stats.active_yellow_cards - 1),
      updated_at: new Date().toISOString(),
    })
    .eq("registration_id", registrationId);
}

// ─── Next match finder ────────────────────────────────────────────────────────

async function findNextMatch(
  knockoutMatchId: string,
  championshipTeamId: string,
  championshipId: string,
): Promise<string | null> {
  const { data: currentMatch } = await supabase
    .from("knockout_matches")
    .select("phase_id, round_number")
    .eq("id", knockoutMatchId)
    .single();

  if (!currentMatch) return null;

  const { phase_id: currentPhaseId, round_number: currentRound } = currentMatch;

  // 1. Look for the team's next match in the same phase (next round_number).
  if (currentRound !== null) {
    const { data: laterSamePhase } = await supabase
      .from("knockout_matches")
      .select("id, name")
      .eq("phase_id", currentPhaseId)
      .gt("round_number", currentRound)
      .order("round_number", { ascending: true });

    // 1a. Knockout phase: match_slots with non-null championship_team_id.
    for (const match of laterSamePhase ?? []) {
      const { data: slot } = await supabase
        .from("match_slots")
        .select("match_id")
        .eq("championship_team_id", championshipTeamId)
        .eq("match_id", match.id)
        .maybeSingle();

      if (slot) return slot.match_id;
    }

    // 1b. Group phase: match_slots have championship_team_id = null.
    // Teams are identified by their group label (e.g. "A1") parsed from the match name.
    const { data: groupSlot } = await supabase
      .from("group_slots")
      .select("label")
      .eq("championship_team_id", championshipTeamId)
      .eq("phase_id", currentPhaseId)
      .maybeSingle();

    if (groupSlot?.label) {
      const label = groupSlot.label;
      for (const match of laterSamePhase ?? []) {
        if (!match.name) continue;
        const parts = (match.name as string).split(/\s+x\s+/i).map((p: string) => p.trim());
        if (parts[0] === label || parts[1] === label) return match.id;
      }
    }
  }

  // 2. Current phase is done — find the next phase (by order_number).
  const { data: currentPhase } = await supabase
    .from("phases")
    .select("order_number")
    .eq("id", currentPhaseId)
    .single();

  if (!currentPhase) return null;

  const { data: nextPhases } = await supabase
    .from("phases")
    .select("id")
    .eq("championship_id", championshipId)
    .gt("order_number", currentPhase.order_number)
    .order("order_number", { ascending: true })
    .limit(1);

  if (!nextPhases || nextPhases.length === 0) return null;

  const nextPhaseId = nextPhases[0].id;

  // 3. Find the team's slot in the earliest match of the next phase.
  const { data: nextPhaseMatches } = await supabase
    .from("knockout_matches")
    .select("id, name")
    .eq("phase_id", nextPhaseId)
    .order("round_number", { ascending: true });

  if (!nextPhaseMatches || nextPhaseMatches.length === 0) return null;

  // 3a. Knockout phase: match_slots with non-null championship_team_id.
  for (const match of nextPhaseMatches) {
    const { data: nextSlot } = await supabase
      .from("match_slots")
      .select("match_id")
      .eq("championship_team_id", championshipTeamId)
      .eq("match_id", match.id)
      .maybeSingle();

    if (nextSlot) return nextSlot.match_id;
  }

  // 3b. Group phase next: resolve via group_slots label.
  const { data: nextGroupSlot } = await supabase
    .from("group_slots")
    .select("label")
    .eq("championship_team_id", championshipTeamId)
    .eq("phase_id", nextPhaseId)
    .maybeSingle();

  if (nextGroupSlot?.label) {
    const label = nextGroupSlot.label;
    for (const match of nextPhaseMatches) {
      if (!match.name) continue;
      const parts = (match.name as string).split(/\s+x\s+/i).map((p: string) => p.trim());
      if (parts[0] === label || parts[1] === label) return match.id;
    }
  }

  // 4. Team not yet slotted in the next phase (group standings unresolved).
  // Suspension is created with suspended_match_id = null and resolved later.
  return null;
}
