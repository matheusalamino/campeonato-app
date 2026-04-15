import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const championshipId = req.nextUrl.searchParams.get("championshipId");
  const cmId = req.nextUrl.searchParams.get("cmId");

  if (!championshipId || !cmId) {
    return NextResponse.json(
      { error: "championshipId e cmId são obrigatórios" },
      { status: 400 },
    );
  }

  try {
    const [cmRes, budgetRes, cardRes, chRes] = await Promise.all([
      supabase
        .from("championship_managers")
        .select("current_balance, initial_balance, team_id")
        .eq("id", cmId)
        .single(),
      supabase
        .from("draft_pot_budgets")
        .select(
          "pot_number, pot_position, initial_budget, remaining_budget, settled",
        )
        .eq("championship_manager_id", cmId)
        .eq("settled", false)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("draft_special_card_uses")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("activated_by_cm_id", cmId)
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

    if (cmRes.data?.team_id) {
      const { data: ctRow } = await supabase
        .from("championship_teams")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("team_id", cmRes.data.team_id)
        .maybeSingle();

      if (ctRow?.id) {
        const { count } = await supabase
          .from("championship_team_players")
          .select("id", { count: "exact", head: true })
          .eq("championship_team_id", ctRow.id);

        teamCount = count ?? 0;
      }
    }

    const ch = chRes.data as {
      draft_qualification_window_open: boolean | null;
      draft_qualification_pot_number: number | null;
      draft_qualification_pot_position: string | null;
    } | null;

    const qualificationWindowOpen = Boolean(ch?.draft_qualification_window_open);
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
        .eq("championship_manager_id", cmId)
        .eq("pot_number", qualificationPotNumber)
        .eq("pot_position", qualificationPotPosition)
        .maybeSingle();

      hasSubmittedQualificationBidForActivePot = Boolean(existingBid);
    }

    return NextResponse.json({
      currentBalance: cmRes.data?.current_balance ?? 0,
      initialBalance: cmRes.data?.initial_balance ?? 100000,
      potBudget: budgetRes.data?.[0] ?? null,
      teamCount,
      hasUsedSpecialCard: (cardRes.data?.length ?? 0) > 0,
      qualificationWindowOpen,
      qualificationPotNumber,
      qualificationPotPosition,
      hasSubmittedQualificationBidForActivePot,
    });
  } catch (err) {
    console.error("session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
