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
    const [cmRes, budgetRes, cardRes] = await Promise.all([
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
    ]);

    let teamCount = 0;

    if (cmRes.data?.team_id) {
      const { data: ctRow } = await supabase
        .from("championship_teams")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("team_id", cmRes.data.team_id)
        .single();

      if (ctRow) {
        const { count } = await supabase
          .from("championship_team_players")
          .select("id", { count: "exact", head: true })
          .eq("championship_team_id", ctRow.id);

        teamCount = count ?? 0;
      }
    }

    return NextResponse.json({
      currentBalance: cmRes.data?.current_balance ?? 0,
      initialBalance: cmRes.data?.initial_balance ?? 100000,
      potBudget: budgetRes.data?.[0] ?? null,
      teamCount,
      hasUsedSpecialCard: (cardRes.data?.length ?? 0) > 0,
    });
  } catch (err) {
    console.error("session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
