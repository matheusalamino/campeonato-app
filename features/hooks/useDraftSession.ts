"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const POLL_INTERVAL = 3000;

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
    isLoading: true,
    error: null,
  });

  const mountedRef = useRef(true);

  const fetchSession = useCallback(async () => {
    try {
      const [cmRes, budgetRes, cardRes, chRes] = await Promise.all([
        supabase
          .from("championship_managers")
          .select("current_balance, initial_balance, team_id")
          .eq("id", championshipManagerId)
          .single(),
        supabase
          .from("draft_pot_budgets")
          .select(
            "pot_number, pot_position, initial_budget, remaining_budget, settled",
          )
          .eq("championship_manager_id", championshipManagerId)
          .eq("settled", false)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("draft_special_card_uses")
          .select("id")
          .eq("championship_id", championshipId)
          .eq("activated_by_cm_id", championshipManagerId)
          .limit(1),
        supabase
          .from("championships")
          .select(
            "draft_qualification_window_open, draft_qualification_pot_number, draft_qualification_pot_position",
          )
          .eq("id", championshipId)
          .single(),
      ]);

      let teamCount = 0;
      const teamId = cmRes.data?.team_id;
      if (teamId) {
        const { data: ctRow } = await supabase
          .from("championship_teams")
          .select("id")
          .eq("championship_id", championshipId)
          .eq("team_id", teamId)
          .maybeSingle();

        if (ctRow?.id) {
          const { count } = await supabase
            .from("championship_team_players")
            .select("id", { count: "exact", head: true })
            .eq("championship_team_id", ctRow.id);

          teamCount = count ?? 0;
        }
      }

      if (!mountedRef.current) return;

      const activeBudget = budgetRes.data?.[0] ?? null;

      const ch = chRes.data as {
        draft_qualification_window_open: boolean | null;
        draft_qualification_pot_number: number | null;
        draft_qualification_pot_position: string | null;
      } | null;

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

    const interval = setInterval(fetchSession, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchSession]);

  return { ...data, refetch: fetchSession };
}
