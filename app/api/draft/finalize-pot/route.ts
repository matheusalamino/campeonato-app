import { createClient } from "@/lib/supabase/server";
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

      if (fine > 0) {
        const { error: fineIns } = await supabase.from("draft_fines").insert({
          championship_id: championshipId,
          championship_manager_id: row.championship_manager_id,
          type: "remaining_budget",
          amount: fine,
          pot_number: potNumber,
          pot_position: normalizedPosition,
          description: `Multa — saldo restante do pote (${normalizedPosition}, pote ${potNumber})`,
          is_automatic: true,
        });
        if (fineIns) throw fineIns;
      }

      if (returned > 0) {
        const { data: cm, error: cmErr } = await supabase
          .from("championship_managers")
          .select("current_balance")
          .eq("id", row.championship_manager_id)
          .single();

        if (cmErr || !cm) throw cmErr ?? new Error("CM não encontrado");

        const newBal = cm.current_balance + returned;

        const { error: txErr } = await supabase
          .from("draft_balance_transactions")
          .insert({
            championship_id: championshipId,
            championship_manager_id: row.championship_manager_id,
            type: "POT_BUDGET_RETURN",
            amount: returned,
            description: `Devolução após finalização do pote ${potNumber} (${normalizedPosition})`,
          });
        if (txErr) throw txErr;

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

    return NextResponse.json({ success: true, settledCount });
  } catch (err) {
    console.error("finalize-pot error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
