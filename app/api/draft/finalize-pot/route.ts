import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/draft-auth";
import { computePotRemainderSettlement } from "@/lib/pot-settlement";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.supabase) return auth.error!;

  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as {
      championshipId?: string;
      potNumber?: number;
      potPosition?: string;
    };

    const { championshipId, potNumber, potPosition } = body;

    if (!championshipId || potNumber == null || !potPosition) {
      return NextResponse.json(
        {
          error:
            "Informe championshipId, potNumber e potPosition do pote a finalizar",
        },
        { status: 400 },
      );
    }

    const normalizedPosition = potPosition.trim();
    if (!normalizedPosition) {
      return NextResponse.json({ error: "potPosition inválido" }, { status: 400 });
    }

    const { data: potRow, error: potErr } = await supabase
      .from("draft_pots")
      .select("id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("position", normalizedPosition)
      .limit(1)
      .maybeSingle();

    if (potErr) throw potErr;

    if (!potRow) {
      return NextResponse.json(
        { error: "Pote não encontrado para este campeonato" },
        { status: 400 },
      );
    }

    const { data: rows, error: rErr } = await supabase
      .from("draft_pot_budgets")
      .select(
        "id, championship_manager_id, remaining_budget, settled",
      )
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", normalizedPosition)
      .eq("settled", false);

    if (rErr) throw rErr;

    if (!rows?.length) {
      return NextResponse.json({
        success: true,
        settledCount: 0,
        message: "Nenhum saldo de pote em aberto para finalizar",
      });
    }

    let settledCount = 0;

    for (const row of rows) {
      const remaining = row.remaining_budget;
      const { fine, returned } = computePotRemainderSettlement(remaining);

      const potLabel = `Pote ${potNumber} (${normalizedPosition})`;

      if (remaining > 0) {
        // Log the full leftover amount first; fine debit below makes net effect = returned.
        const { error: txReturnErr } = await supabase
          .from("draft_balance_transactions")
          .insert({
            championship_id: championshipId,
            championship_manager_id: row.championship_manager_id,
            type: "POT_BUDGET_RETURN",
            amount: remaining,
            pot_number: potNumber,
            pot_position: normalizedPosition,
            description: `Liquidação — Saldo remanescente no ${potLabel}`,
          });
        if (txReturnErr) throw txReturnErr;
      }

      if (fine > 0) {
        const { data: fineRow, error: fineIns } = await supabase
          .from("draft_fines")
          .insert({
            championship_id: championshipId,
            championship_manager_id: row.championship_manager_id,
            type: "remaining_budget",
            amount: fine,
            pot_number: potNumber,
            pot_position: normalizedPosition,
            description: `Multa — Saldo não utilizado no ${potLabel}`,
            is_automatic: true,
          })
          .select("id")
          .single();
        if (fineIns) throw fineIns;

        const { error: txErr } = await supabase
          .from("draft_balance_transactions")
          .insert({
            championship_id: championshipId,
            championship_manager_id: row.championship_manager_id,
            type: "FINE_REMAINING_BUDGET",
            amount: -fine,
            reference_id: fineRow.id,
            pot_number: potNumber,
            pot_position: normalizedPosition,
            description: `Multa — Saldo não utilizado no ${potLabel}`,
          });
        if (txErr) throw txErr;
      }

      if (returned > 0) {
        const { data: cm, error: cmErr } = await supabase
          .from("championship_managers")
          .select("current_balance")
          .eq("id", row.championship_manager_id)
          .single();

        if (cmErr || !cm) throw cmErr ?? new Error("CM não encontrado");

        const newBal = cm.current_balance + returned;

        const { error: upCm } = await supabase
          .from("championship_managers")
          .update({ current_balance: newBal })
          .eq("id", row.championship_manager_id);
        if (upCm) throw upCm;
      }

      const { error: upB } = await supabase
        .from("draft_pot_budgets")
        .update({
          remaining_budget: 0,
          fine_amount: fine,
          returned_amount: returned,
          settled: true,
        })
        .eq("id", row.id);

      if (upB) throw upB;
      settledCount += 1;
    }

    const { data: chState } = await supabase
      .from("championships")
      .select(
        "draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
      )
      .eq("id", championshipId)
      .single();

    const shouldCloseAuction =
      chState?.draft_auction_open &&
      chState.draft_auction_pot_number === potNumber &&
      chState.draft_auction_pot_position?.trim() === normalizedPosition;

    if (shouldCloseAuction) {
      const { error: rpcErr } = await supabase.rpc("set_draft_auction_state", {
        p_championship_id: championshipId,
        p_open: false,
        p_pot_number: null,
        p_pot_position: null,
      });
      if (rpcErr) throw rpcErr;
    }

    const { data: potPlayers, error: potPlayersErr } = await supabase
      .from("draft_pots")
      .select("player_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("position", normalizedPosition);
    if (potPlayersErr) throw potPlayersErr;

    const playerIds = (potPlayers ?? []).map((r) => r.player_id);
    let extraPotNumber: number | null = null;
    let movedToExtraCount = 0;

    if (playerIds.length > 0) {
      const [{ data: regs, error: regErr }, { data: buys, error: buyErr }] =
        await Promise.all([
          supabase
            .from("championship_registrations")
            .select("id, player_id")
            .eq("championship_id", championshipId)
            .in("player_id", playerIds),
          supabase
            .from("draft_player_purchases")
            .select("registration_id")
            .eq("championship_id", championshipId)
            .eq("pot_number", potNumber)
            .eq("pot_position", normalizedPosition),
        ]);

      if (regErr) throw regErr;
      if (buyErr) throw buyErr;

      const regByPlayer = new Map((regs ?? []).map((r) => [r.player_id, r.id]));
      const purchasedRegIds = new Set((buys ?? []).map((b) => b.registration_id));
      const unsoldPlayerIds = playerIds.filter((pid) => {
        const regId = regByPlayer.get(pid);
        if (!regId) return false;
        return !purchasedRegIds.has(regId);
      });

      if (unsoldPlayerIds.length > 0) {
        const { data: maxPotRow, error: maxPotErr } = await supabase
          .from("draft_pots")
          .select("pot_number, pot_order")
          .eq("championship_id", championshipId)
          .order("pot_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxPotErr) throw maxPotErr;

        const nextPotNumber = (maxPotRow?.pot_number ?? potNumber) + 1;
        const nextPotOrder = (maxPotRow?.pot_order ?? 0) + 1;

        const { error: moveErr } = await supabase
          .from("draft_pots")
          .update({
            pot_number: nextPotNumber,
            pot_order: nextPotOrder,
          })
          .eq("championship_id", championshipId)
          .eq("pot_number", potNumber)
          .eq("position", normalizedPosition)
          .in("player_id", unsoldPlayerIds);

        if (moveErr) throw moveErr;

        extraPotNumber = nextPotNumber;
        movedToExtraCount = unsoldPlayerIds.length;
      }
    }

    return NextResponse.json({
      success: true,
      settledCount,
      movedToExtraCount,
      extraPotNumber,
    });
  } catch (err) {
    console.error("finalize-pot error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
