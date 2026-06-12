"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ─── Public Types ────────────────────────────────────────────────────────────

export type BookedPlayer = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  lastYellowMatchName: string;
  lastYellowPhaseId: string;
};

export type SuspensionEntry = {
  id: string;
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  reason: "red_card" | "two_yellows";
  served: boolean;
  suspendedMatchName: string | null;
  suspendedMatchPhaseId: string | null;
  originMatchName: string;
};

export type CardHistoryEntry = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  yellowCount: number;
  redCount: number;
  servedSuspensions: number;
};

// ─── Internal Types ──────────────────────────────────────────────────────────

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

type RawEvent = {
  playerId: string;
  eventType: string;
  knockoutMatchId: string;
  createdAt: string;
};

type RawSuspension = {
  id: string;
  registrationId: string;
  reason: string;
  served: boolean;
  suspendedMatchId: string | null;
  originMatchId: string;
};

type MatchInfo = {
  name: string;
  phaseId: string;
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDisciplinary(
  championshipId: string | null,
  phaseId: string | null,
  teamId: string | null,
) {
  const [loading, setLoading] = useState(false);
  const [bookedPlayers, setBookedPlayers] = useState<BookedPlayer[]>([]);
  const [suspensions, setSuspensions] = useState<SuspensionEntry[]>([]);
  const [cardHistory, setCardHistory] = useState<CardHistoryEntry[]>([]);

  // Raw data stored in refs — does not trigger re-renders
  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const rawBookedRef = useRef<Array<{ registrationId: string }>>([]);
  const rawEventsRef = useRef<RawEvent[]>([]);
  const rawSuspensionsRef = useRef<RawSuspension[]>([]);
  const matchMapRef = useRef<Map<string, MatchInfo>>(new Map());
  const loadSeqRef = useRef(0);

  // ── derive: re-apply filters to raw refs ─────────────────────────────────
  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const matchMap = matchMapRef.current;
    const rawEvents = rawEventsRef.current;
    const rawSuspensions = rawSuspensionsRef.current;

    // ── Booked players ──────────────────────────────────────────────────────
    const booked: BookedPlayer[] = [];
    for (const { registrationId } of rawBookedRef.current) {
      const info = regInfoMap.get(registrationId);
      if (!info) continue;

      // Find most recent yellow event for this player
      const lastYellow = rawEvents
        .filter(e => e.playerId === registrationId && e.eventType === "YELLOW_CARD")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const lastMatch = lastYellow ? matchMap.get(lastYellow.knockoutMatchId) : null;
      const lastYellowPhaseId = lastMatch?.phaseId ?? "";
      const lastYellowMatchName = lastMatch?.name ?? "—";

      if (phaseId && lastYellowPhaseId !== phaseId) continue;
      if (teamId && info.teamId !== teamId) continue;

      booked.push({ registrationId, ...info, lastYellowMatchName, lastYellowPhaseId });
    }
    setBookedPlayers(booked);

    // ── Suspensions ─────────────────────────────────────────────────────────
    const susp: SuspensionEntry[] = [];
    for (const s of rawSuspensions) {
      const info = regInfoMap.get(s.registrationId);
      if (!info) continue;

      const suspMatch = s.suspendedMatchId ? matchMap.get(s.suspendedMatchId) : null;
      const origMatch = matchMap.get(s.originMatchId);

      const suspendedMatchPhaseId = suspMatch?.phaseId ?? null;

      if (phaseId && suspendedMatchPhaseId !== null && suspendedMatchPhaseId !== phaseId) continue;
      if (teamId && info.teamId !== teamId) continue;

      susp.push({
        id: s.id,
        registrationId: s.registrationId,
        ...info,
        reason: s.reason as "red_card" | "two_yellows",
        served: s.served,
        suspendedMatchName: suspMatch?.name ?? null,
        suspendedMatchPhaseId,
        originMatchName: origMatch?.name ?? "—",
      });
    }
    // Pending first, then served; within each group sort alphabetically
    susp.sort((a, b) => Number(a.served) - Number(b.served) || a.playerName.localeCompare(b.playerName));
    setSuspensions(susp);

    // ── Card history ────────────────────────────────────────────────────────
    const cardMap = new Map<string, { yellow: number; red: number }>();
    for (const e of rawEvents) {
      const match = matchMap.get(e.knockoutMatchId);
      if (phaseId && match?.phaseId !== phaseId) continue;
      const entry = cardMap.get(e.playerId) ?? { yellow: 0, red: 0 };
      if (e.eventType === "YELLOW_CARD") entry.yellow += 1;
      if (e.eventType === "RED_CARD") entry.red += 1;
      cardMap.set(e.playerId, entry);
    }

    const servedMap = new Map<string, number>();
    for (const s of rawSuspensions) {
      if (!s.served) continue;
      const suspMatch = s.suspendedMatchId ? matchMap.get(s.suspendedMatchId) : null;
      if (phaseId && suspMatch != null && suspMatch.phaseId !== phaseId) continue;
      servedMap.set(s.registrationId, (servedMap.get(s.registrationId) ?? 0) + 1);
    }

    const history: CardHistoryEntry[] = [];
    for (const [regId, counts] of cardMap.entries()) {
      const info = regInfoMap.get(regId);
      if (!info) continue;
      if (teamId && info.teamId !== teamId) continue;
      history.push({
        registrationId: regId,
        ...info,
        yellowCount: counts.yellow,
        redCount: counts.red,
        servedSuspensions: servedMap.get(regId) ?? 0,
      });
    }
    history.sort((a, b) => (b.yellowCount + b.redCount) - (a.yellowCount + a.redCount));
    setCardHistory(history);
  }, [phaseId, teamId]);

  // ── load: fetch all raw data for championship ─────────────────────────────
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;

    if (!championshipId) {
      regInfoMapRef.current = new Map();
      rawBookedRef.current = [];
      rawEventsRef.current = [];
      rawSuspensionsRef.current = [];
      matchMapRef.current = new Map();
      setBookedPlayers([]);
      setSuspensions([]);
      setCardHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Phase 1: registrations
      const { data: regs } = await supabase
        .from("championship_registrations")
        .select("id, profile_photo_link, players(id, name)")
        .eq("championship_id", championshipId);

      const regIds = (regs ?? []).map(r => r.id);

      // Phase 1b: team info for each registration
      const { data: ctpRows } = await supabase
        .from("championship_team_players")
        .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
        .in("registration_id", regIds.length ? regIds : ["__none__"]);

      // Build regInfoMap
      const ctpMap = new Map<string, { teamId: string; teamName: string }>();
      for (const ctp of ctpRows ?? []) {
        if (ctpMap.has(ctp.registration_id)) continue; // take first team
        const ct = ctp.championship_teams as unknown as { id: string; teams: { name: string } | { name: string }[] | null } | null;
        const teamsRel = ct?.teams;
        const teamName = (Array.isArray(teamsRel) ? teamsRel[0]?.name : teamsRel?.name) ?? "—";
        ctpMap.set(ctp.registration_id, { teamId: ctp.championship_team_id, teamName });
      }

      const newRegInfoMap = new Map<string, RegInfo>();
      for (const reg of regs ?? []) {
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
        const teamInfo = ctpMap.get(reg.id);
        newRegInfoMap.set(reg.id, {
          playerName,
          playerPhoto: reg.profile_photo_link ?? null,
          teamId: teamInfo?.teamId ?? "",
          teamName: teamInfo?.teamName ?? "—",
        });
      }
      regInfoMapRef.current = newRegInfoMap;

      // Phase 2: parallel queries
      const [bookedRes, suspRes, eventsRes, matchesRes] = await Promise.all([
        supabase
          .from("v_booked_players")
          .select("registration_id")
          .eq("championship_id", championshipId),
        supabase
          .from("suspensions")
          .select("id, registration_id, reason, served, suspended_match_id, origin_match_id")
          .in("registration_id", regIds.length ? regIds : ["__none__"]),
        supabase
          .from("match_events_v2")
          .select("player_id, event_type, knockout_match_id, created_at")
          .in("event_type", ["YELLOW_CARD", "RED_CARD"])
          .is("deleted_at", null)
          .in("player_id", regIds.length ? regIds : ["__none__"]),
        supabase
          .from("knockout_matches")
          .select("id, name, phase_id")
          .eq("championship_id", championshipId),
      ]);

      // Discard if a newer load has started since this one was launched
      if (seq !== loadSeqRef.current) return;

      // Build refs
      rawBookedRef.current = (bookedRes.data ?? []).map(r => ({ registrationId: r.registration_id }));

      rawSuspensionsRef.current = (suspRes.data ?? []).map(s => ({
        id: s.id,
        registrationId: s.registration_id,
        reason: s.reason,
        served: s.served,
        suspendedMatchId: s.suspended_match_id ?? null,
        originMatchId: s.origin_match_id,
      }));

      rawEventsRef.current = (eventsRes.data ?? []).map(e => ({
        playerId: e.player_id,
        eventType: e.event_type,
        knockoutMatchId: e.knockout_match_id,
        createdAt: e.created_at,
      }));

      const newMatchMap = new Map<string, MatchInfo>();
      for (const m of matchesRes.data ?? []) {
        newMatchMap.set(m.id, { name: m.name ?? "—", phaseId: m.phase_id ?? "" });
      }
      matchMapRef.current = newMatchMap;

    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [championshipId]);

  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  // Re-fetch when championship changes; run latest derive after load completes
  useEffect(() => { void load().then(() => deriveRef.current()); }, [load]);

  // Re-derive when filters change (no re-fetch)
  useEffect(() => { derive(); }, [derive]);

  return { bookedPlayers, suspensions, cardHistory, loading, reload: async () => { await load(); derive(); } };
}
