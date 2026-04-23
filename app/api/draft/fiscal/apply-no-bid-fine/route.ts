import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type Body = {
  championshipId?: string;
  championshipManagerId?: string;
  fineType?: "no_bid_player" | "no_bid_goalkeeper";
  amount?: number;
  potNumber?: number | null;
  potPosition?: string | null;
};

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase || !auth.user) return auth.error!;
  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as Body;
    const championshipId = body.championshipId;
    const championshipManagerId = body.championshipManagerId;
    const fineType = body.fineType;
    const amount = Number(body.amount ?? 0);
    const potNumber = body.potNumber ?? null;
    const potPosition = body.potPosition?.trim() || null;

    if (
      !championshipId ||
      !championshipManagerId ||
      !fineType ||
      amount <= 0 ||
      amount % 1000 !== 0
    ) {
      return NextResponse.json(
        {
          error:
            "Informe championshipId, championshipManagerId, fineType e amount (múltiplo de CC$ 1.000).",
        },
        { status: 400 },
      );
    }

    const { data: budget, error: budgetErr } = await supabase
      .from("draft_pot_budgets")
      .select("id, remaining_budget")
      .eq("championship_id", championshipId)
      .eq("championship_manager_id", championshipManagerId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .eq("settled", false)
      .maybeSingle();

    if (budgetErr) throw budgetErr;
    if (!budget) {
      return NextResponse.json(
        { error: "Cartola sem orçamento ativo neste pote." },
        { status: 400 },
      );
    }

    const appliedAmount = Math.min(amount, Math.max(0, budget.remaining_budget ?? 0));
    if (appliedAmount <= 0) {
      return NextResponse.json(
        {
          error:
            "Cartola isenta para este tipo de multa: saldo do pote atual zerado.",
        },
        { status: 400 },
      );
    }

    const fineDesc =
      fineType === "no_bid_goalkeeper"
        ? "Multa manual — Sem lance no goleiro"
        : "Multa manual — Sem lance no jogador";

    const { data: fineRow, error: fineErr } = await supabase
      .from("draft_fines")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: fineType,
        amount: appliedAmount,
        pot_number: potNumber,
        pot_position: potPosition,
        description: fineDesc,
        is_automatic: false,
        applied_by: auth.user.id,
      })
      .select("id")
      .single();
    if (fineErr) throw fineErr;

    const txType =
      fineType === "no_bid_goalkeeper"
        ? "FINE_NO_BID_GOALKEEPER"
        : "FINE_NO_BID_PLAYER";

    const { error: txErr } = await supabase.from("draft_balance_transactions").insert({
      championship_id: championshipId,
      championship_manager_id: championshipManagerId,
      type: txType,
      amount: -appliedAmount,
      reference_id: fineRow.id,
      pot_number: potNumber,
      pot_position: potPosition,
      description: fineDesc,
    });
    if (txErr) throw txErr;

    const { error: upErr } = await supabase
      .from("draft_pot_budgets")
      .update({ remaining_budget: Math.max(0, budget.remaining_budget - appliedAmount) })
      .eq("id", budget.id);
    if (upErr) throw upErr;

    return NextResponse.json({
      success: true,
      appliedAmount,
      fineId: fineRow.id,
    });
  } catch (err) {
    console.error("apply-no-bid-fine error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
