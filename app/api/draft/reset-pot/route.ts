import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type Body = {
  championshipId?: string;
  potNumber?: number;
  potPosition?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;
  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as Body;
    const championshipId = body.championshipId;
    const potNumber = body.potNumber;
    const potPosition = body.potPosition?.trim();

    if (!championshipId || potNumber == null || !potPosition) {
      return NextResponse.json(
        { error: "Informe championshipId, potNumber e potPosition." },
        { status: 400 },
      );
    }

    const { data: budgetRows, error: budgetErr } = await supabase
      .from("draft_pot_budgets")
      .select("championship_manager_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (budgetErr) throw budgetErr;

    const { data: bidRows, error: bidErr } = await supabase
      .from("draft_qualification_bids")
      .select("championship_manager_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (bidErr) throw bidErr;

    const affectedCmIds = new Set<string>();
    (budgetRows ?? []).forEach((r) => affectedCmIds.add(r.championship_manager_id));
    (bidRows ?? []).forEach((r) => affectedCmIds.add(r.championship_manager_id));

    const { data: purchaseRows, error: purchaseErr } = await supabase
      .from("draft_player_purchases")
      .select("id, championship_manager_id, registration_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (purchaseErr) throw purchaseErr;
    (purchaseRows ?? []).forEach((r) =>
      affectedCmIds.add(r.championship_manager_id),
    );

    const registrationIds = (purchaseRows ?? []).map((p) => p.registration_id);
    if (registrationIds.length > 0) {
      const { data: ctRows, error: ctErr } = await supabase
        .from("championship_teams")
        .select("id")
        .eq("championship_id", championshipId);
      if (ctErr) throw ctErr;

      const teamIds = (ctRows ?? []).map((r) => r.id);
      if (teamIds.length > 0) {
        const { error: delCtpErr } = await supabase
          .from("championship_team_players")
          .delete()
          .in("registration_id", registrationIds)
          .in("championship_team_id", teamIds);
        if (delCtpErr) throw delCtpErr;
      }
    }

    const { error: delPurchaseErr } = await supabase
      .from("draft_player_purchases")
      .delete()
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (delPurchaseErr) throw delPurchaseErr;

    const { error: delBudErr } = await supabase
      .from("draft_pot_budgets")
      .delete()
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (delBudErr) throw delBudErr;

    const { error: delBidErr } = await supabase
      .from("draft_qualification_bids")
      .delete()
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (delBidErr) throw delBidErr;

    const { error: delFineErr } = await supabase
      .from("draft_fines")
      .delete()
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (delFineErr) throw delFineErr;

    const { error: delTxErr } = await supabase
      .from("draft_balance_transactions")
      .delete()
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);
    if (delTxErr) throw delTxErr;

    const { data: chState, error: chErr } = await supabase
      .from("championships")
      .select(
        "draft_auction_open, draft_auction_pot_number, draft_auction_pot_position, draft_qualification_window_open, draft_qualification_pot_number, draft_qualification_pot_position",
      )
      .eq("id", championshipId)
      .single();
    if (chErr) throw chErr;

    const isSameAuctionPot =
      chState?.draft_auction_open &&
      chState.draft_auction_pot_number === potNumber &&
      chState.draft_auction_pot_position?.trim() === potPosition;

    if (isSameAuctionPot) {
      const { error: rpcErr } = await supabase.rpc("set_draft_auction_state", {
        p_championship_id: championshipId,
        p_open: false,
        p_pot_number: null,
        p_pot_position: null,
      });
      if (rpcErr) throw rpcErr;
    }

    const isSameQualPot =
      chState?.draft_qualification_window_open &&
      chState.draft_qualification_pot_number === potNumber &&
      chState.draft_qualification_pot_position?.trim() === potPosition;

    if (isSameQualPot) {
      const { error: closeQualErr } = await supabase
        .from("championships")
        .update({
          draft_qualification_window_open: false,
          draft_qualification_pot_number: null,
          draft_qualification_pot_position: null,
        })
        .eq("id", championshipId);
      if (closeQualErr) throw closeQualErr;
    }

    for (const cmId of affectedCmIds) {
      const [{ data: cm, error: cmErr }, { data: txRows, error: txErr2 }] =
        await Promise.all([
          supabase
            .from("championship_managers")
            .select("initial_balance")
            .eq("id", cmId)
            .single(),
          supabase
            .from("draft_balance_transactions")
            .select("amount")
            .eq("championship_manager_id", cmId)
            .eq("championship_id", championshipId),
        ]);

      if (cmErr || !cm) throw cmErr ?? new Error("CM não encontrado");
      if (txErr2) throw txErr2;

      const delta = (txRows ?? []).reduce((sum, row) => sum + row.amount, 0);
      const recalculated = (cm.initial_balance ?? 100000) + delta;

      const { error: upErr } = await supabase
        .from("championship_managers")
        .update({ current_balance: recalculated })
        .eq("id", cmId);
      if (upErr) throw upErr;
    }

    return NextResponse.json({
      success: true,
      affectedManagers: affectedCmIds.size,
      removedPurchases: purchaseRows?.length ?? 0,
    });
  } catch (err) {
    console.error("reset-pot error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
