import { createClient } from "@/lib/supabase/server";
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
    };

    const { championshipId, championshipManagerId } = body;

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
      .eq("type", "over_budget");

    if (pfErr) throw pfErr;

    let maxOcc = 0;
    for (const f of prevFines ?? []) {
      const o = f.occurrence_number ?? 0;
      if (o > maxOcc) maxOcc = o;
    }

    const nextOcc = maxOcc + 1;
    const amount = nextOcc * STEP;

    const { data: cm, error: cmErr } = await supabase
      .from("championship_managers")
      .select("current_balance")
      .eq("id", championshipManagerId)
      .single();

    if (cmErr || !cm) {
      return NextResponse.json(
        { error: "Cartola não encontrada" },
        { status: 404 },
      );
    }

    const newBalance = cm.current_balance - amount;

    const { error: fineErr } = await supabase.from("draft_fines").insert({
      championship_id: championshipId,
      championship_manager_id: championshipManagerId,
      type: "over_budget",
      amount,
      pot_number: potNumber,
      pot_position: potPosition,
      description: `Multa - Lance acima do saldo (${nextOcc}ª ocorrência)`,
      is_automatic: false,
      occurrence_number: nextOcc,
      applied_by: auth.user.id,
    });

    if (fineErr) throw fineErr;

    const { error: txErr } = await supabase
      .from("draft_balance_transactions")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: "FINE_OVER_BUDGET",
        amount: -amount,
        description: `Multa Progressiva (${nextOcc}× CC$ ${STEP.toLocaleString("pt-BR")})`,
      });

    if (txErr) throw txErr;

    const { error: upErr } = await supabase
      .from("championship_managers")
      .update({ current_balance: newBalance })
      .eq("id", championshipManagerId);

    if (upErr) throw upErr;

    return NextResponse.json({
      success: true,
      occurrenceNumber: nextOcc,
      amount,
      newBalance,
    });
  } catch (err) {
    console.error("apply-over-budget-fine error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
