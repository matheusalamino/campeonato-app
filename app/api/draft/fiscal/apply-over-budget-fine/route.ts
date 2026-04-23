import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

const STEP = 2000;

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase || !auth.user) return auth.error!;

  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as {
      championshipId?: string;
      championshipManagerId?: string;
      fineType?: "over_budget" | "no_bid_player" | "no_bid_goalkeeper";
    };

    const { championshipId, championshipManagerId } = body;
    const fineType = body.fineType ?? "over_budget";

    if (!championshipId || !championshipManagerId) {
      return NextResponse.json(
        { error: "championshipId e championshipManagerId são obrigatórios" },
        { status: 400 },
      );
    }

    const { data: ch, error: chErr } = await supabase
      .from("championships")
      .select(
        "draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
      )
      .eq("id", championshipId)
      .single();

    if (chErr || !ch) {
      return NextResponse.json(
        { error: "Campeonato não encontrado" },
        { status: 404 },
      );
    }

    if (
      !ch.draft_auction_open ||
      ch.draft_auction_pot_number == null ||
      !ch.draft_auction_pot_position
    ) {
      return NextResponse.json(
        { error: "Não há leilão ativo para este campeonato" },
        { status: 400 },
      );
    }

    const potNumber = ch.draft_auction_pot_number;
    const potPosition = ch.draft_auction_pot_position.trim();

    const { data: budget, error: bErr } = await supabase
      .from("draft_pot_budgets")
      .select("id")
      .eq("championship_id", championshipId)
      .eq("championship_manager_id", championshipManagerId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .eq("settled", false)
      .maybeSingle();

    if (bErr) throw bErr;

    if (!budget) {
      return NextResponse.json(
        { error: "Cartola não participa do pote em leilão" },
        { status: 400 },
      );
    }

    const { data: prevFines, error: pfErr } = await supabase
      .from("draft_fines")
      .select("occurrence_number")
      .eq("championship_id", championshipId)
      .eq("championship_manager_id", championshipManagerId)
      .eq("type", fineType);

    if (pfErr) throw pfErr;

    let maxOcc = 0;
    for (const f of prevFines ?? []) {
      const o = f.occurrence_number ?? 0;
      if (o > maxOcc) maxOcc = o;
    }

    const nextOcc = maxOcc + 1;
    const amount = nextOcc * STEP;

    const { data: budgetRow, error: brErr } = await supabase
      .from("draft_pot_budgets")
      .select("id, remaining_budget")
      .eq("championship_id", championshipId)
      .eq("championship_manager_id", championshipManagerId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .eq("settled", false)
      .maybeSingle();

    if (brErr) throw brErr;
    if (!budgetRow) {
      return NextResponse.json(
        { error: "Cartola sem orçamento ativo neste pote" },
        { status: 400 },
      );
    }

    const appliedAmount = Math.min(amount, Math.max(0, budgetRow.remaining_budget));
    if (appliedAmount <= 0) {
      return NextResponse.json(
        { error: "Saldo do pote insuficiente para aplicar multa." },
        { status: 400 },
      );
    }
    const newRemaining = Math.max(0, budgetRow.remaining_budget - appliedAmount);

    const fineLabel =
      fineType === "no_bid_player"
        ? "Sem lance no jogador"
        : fineType === "no_bid_goalkeeper"
          ? "Sem lance no goleiro"
          : "Lance acima do saldo";

    const { data: fineRow, error: fineErr } = await supabase
      .from("draft_fines")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: fineType,
        amount: appliedAmount,
        pot_number: potNumber,
        pot_position: potPosition,
        description: `Multa Progressiva — ${fineLabel} (${nextOcc}ª ocorrência)`,
        is_automatic: false,
        occurrence_number: nextOcc,
        applied_by: auth.user.id,
      })
      .select("id")
      .single();

    if (fineErr) throw fineErr;

    const txType =
      fineType === "no_bid_player"
        ? "FINE_NO_BID_PLAYER"
        : fineType === "no_bid_goalkeeper"
          ? "FINE_NO_BID_GOALKEEPER"
          : "FINE_OVER_BUDGET";

    const { error: txErr } = await supabase
      .from("draft_balance_transactions")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: txType,
        amount: -appliedAmount,
        reference_id: fineRow.id,
        pot_number: potNumber,
        pot_position: potPosition,
        description: `Multa Progressiva (${nextOcc}× CC$ ${STEP.toLocaleString("pt-BR")}) — ${fineLabel}`,
      });

    if (txErr) throw txErr;

    const { error: upErr } = await supabase
      .from("draft_pot_budgets")
      .update({ remaining_budget: newRemaining })
      .eq("id", budgetRow.id);

    if (upErr) throw upErr;

    return NextResponse.json({
      success: true,
      fineType,
      occurrenceNumber: nextOcc,
      amount: appliedAmount,
      newRemainingBudget: newRemaining,
    });
  } catch (err) {
    console.error("apply-over-budget-fine error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
