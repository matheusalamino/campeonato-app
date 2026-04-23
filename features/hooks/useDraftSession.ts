"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/** Enquanto o cartola ainda não tem time (sorteio na apresentação), poll um pouco mais rápido. */
const POLL_MS_WAITING_TEAM = 2500;
const POLL_MS_AFTER_TEAM = 5000;

export type DraftSessionData = {
  currentBalance: number;
  initialBalance: number;
  potBudget: {
    potNumber: number;
    potPosition: string;
    initialBudget: number;
    remainingBudget: number;
    settled: boolean;
  } | null;
  teamCount: number;
  hasUsedSpecialCard: boolean;
  playerHasActiveCard: boolean;
  currentAuctionRegistrationId: string | null;
  /** Staff opened blind-bid window for a line pot (from championships). */
  qualificationWindowOpen: boolean;
  qualificationPotNumber: number | null;
  qualificationPotPosition: string | null;
  /** Manager already submitted a bid for the currently open pot. */
  hasSubmittedQualificationBidForActivePot: boolean;
  /** Atualizado a cada poll — reflete `team_id` assim que o sorteio na apresentação grava no banco. */
  liveTeamId: string | null;
  liveTeamName: string | null;
  liveTeamLogoUrl: string | null;
  isLoading: boolean;
  error: string | null;
};

export function useDraftSession(
  championshipId: string,
  championshipManagerId: string,
) {
  const [data, setData] = useState<DraftSessionData>({
    currentBalance: 0,
    initialBalance: 0,
    potBudget: null,
    teamCount: 0,
    hasUsedSpecialCard: false,
    playerHasActiveCard: false,
    currentAuctionRegistrationId: null,
    qualificationWindowOpen: false,
    qualificationPotNumber: null,
    qualificationPotPosition: null,
    hasSubmittedQualificationBidForActivePot: false,
    liveTeamId: null,
    liveTeamName: null,
    liveTeamLogoUrl: null,
    isLoading: true,
    error: null,
  });

  const [pollMs, setPollMs] = useState(POLL_MS_WAITING_TEAM);
  const mountedRef = useRef(true);

  const fetchSession = useCallback(async () => {
    try {
      const [cmRes, cardRes, chRes] = await Promise.all([
        supabase
          .from("championship_managers")
          .select("current_balance, initial_balance, team_id")
          .eq("id", championshipManagerId)
          .single(),
        supabase
          .from("draft_special_card_uses")
          .select("id")
          .eq("championship_id", championshipId)
          .eq("activated_by_cm_id", championshipManagerId)
          .limit(1),
        supabase
          .from("championships")
          .select(
            "draft_qualification_window_open, draft_qualification_pot_number, draft_qualification_pot_position, draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
          )
          .eq("id", championshipId)
          .single(),
      ]);

      let teamCount = 0;
      const teamId = cmRes.data?.team_id ?? null;
      let liveTeamId: string | null = null;
      let liveTeamName: string | null = null;
      let liveTeamLogoUrl: string | null = null;

      if (teamId) {
        liveTeamId = teamId;
        const [{ data: ctRow }, { data: teamRow }] = await Promise.all([
          supabase
            .from("championship_teams")
            .select("id")
            .eq("championship_id", championshipId)
            .eq("team_id", teamId)
            .maybeSingle(),
          supabase
            .from("teams")
            .select("name, logo_url")
            .eq("id", teamId)
            .maybeSingle(),
        ]);

        liveTeamName = teamRow?.name ?? null;
        liveTeamLogoUrl = teamRow?.logo_url ?? null;

        if (ctRow?.id) {
          const { count } = await supabase
            .from("championship_team_players")
            .select("id", { count: "exact", head: true })
            .eq("championship_team_id", ctRow.id);

          teamCount = count ?? 0;
        }
      }

      if (!mountedRef.current) return;

      const ch = chRes.data as {
        draft_qualification_window_open: boolean | null;
        draft_qualification_pot_number: number | null;
        draft_qualification_pot_position: string | null;
        draft_auction_open: boolean | null;
        draft_auction_pot_number: number | null;
        draft_auction_pot_position: string | null;
      } | null;

      let budgetQuery = supabase
        .from("draft_pot_budgets")
        .select(
          "pot_number, pot_position, initial_budget, remaining_budget, settled",
        )
        .eq("championship_manager_id", championshipManagerId)
        .eq("settled", false);

      if (
        ch?.draft_auction_open &&
        ch.draft_auction_pot_number != null &&
        ch.draft_auction_pot_position?.trim()
      ) {
        budgetQuery = budgetQuery
          .eq("pot_number", ch.draft_auction_pot_number)
          .eq("pot_position", ch.draft_auction_pot_position.trim());
      }

      const { data: budgetRows } = await budgetQuery
        .order("created_at", { ascending: false })
        .limit(1);

      const activeBudget = budgetRows?.[0] ?? null;

      const qualificationWindowOpen = Boolean(
        ch?.draft_qualification_window_open,
      );
      const qualificationPotNumber = ch?.draft_qualification_pot_number ?? null;
      const qualificationPotPosition =
        ch?.draft_qualification_pot_position?.trim() ?? null;

      let hasSubmittedQualificationBidForActivePot = false;
      if (
        qualificationWindowOpen &&
        qualificationPotNumber !== null &&
        qualificationPotPosition
      ) {
        const { data: existingBid } = await supabase
          .from("draft_qualification_bids")
          .select("id")
          .eq("championship_id", championshipId)
          .eq("championship_manager_id", championshipManagerId)
          .eq("pot_number", qualificationPotNumber)
          .eq("pot_position", qualificationPotPosition)
          .maybeSingle();

        hasSubmittedQualificationBidForActivePot = Boolean(existingBid);
      }

      if (!mountedRef.current) return;

      setPollMs(teamId ? POLL_MS_AFTER_TEAM : POLL_MS_WAITING_TEAM);

      setData((prev) => ({
        ...prev,
        currentBalance: cmRes.data?.current_balance ?? prev.currentBalance,
        initialBalance: cmRes.data?.initial_balance ?? prev.initialBalance,
        potBudget: activeBudget
          ? {
              potNumber: activeBudget.pot_number,
              potPosition: activeBudget.pot_position,
              initialBudget: activeBudget.initial_budget,
              remainingBudget: activeBudget.remaining_budget,
              settled: activeBudget.settled,
            }
          : null,
        teamCount,
        hasUsedSpecialCard: (cardRes.data?.length ?? 0) > 0,
        qualificationWindowOpen,
        qualificationPotNumber,
        qualificationPotPosition,
        hasSubmittedQualificationBidForActivePot,
        liveTeamId,
        liveTeamName,
        liveTeamLogoUrl,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      if (!mountedRef.current) return;
      setData((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Erro ao carregar sessão",
      }));
    }
  }, [championshipId, championshipManagerId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSession();

    const interval = setInterval(fetchSession, pollMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchSession, pollMs]);

  return { ...data, refetch: fetchSession };
}
