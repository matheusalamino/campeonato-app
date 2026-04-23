import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

const FIXED_FINE = 2000;

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase || !auth.user) return auth.error!;

  const supabase = auth.supabase;

  try {
    const { championshipId } = (await req.json()) as { championshipId?: string };

    if (!championshipId) {
      return NextResponse.json(
        { error: "championshipId é obrigatório" },
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
    const potLabel = `Pote ${potNumber} (${potPosition})`;

    const { data: budgets, error: bErr } = await supabase
      .from("draft_pot_budgets")
      .select("championship_manager_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .eq("settled", false);

    if (bErr) throw bErr;

    if (!budgets?.length) {
      return NextResponse.json(
        { error: "Nenhum cartola com pote ativo encontrado" },
        { status: 400 },
      );
    }

    const cmIds = [...new Set(budgets.map((b) => b.championship_manager_id))];

    const { data: managers, error: mErr } = await supabase
      .from("championship_managers")
      .select("id, current_balance")
      .in("id", cmIds);

    if (mErr) throw mErr;

    const applied: { championshipManagerId: string; amount: number }[] = [];

    for (const cm of managers ?? []) {
      const balance = cm.current_balance;
      if (balance <= 0) continue;

      const amount = Math.min(FIXED_FINE, balance);
      if (amount <= 0) continue;

      const newBalance = balance - amount;

      const { error: fineErr } = await supabase.from("draft_fines").insert({
        championship_id: championshipId,
        championship_manager_id: cm.id,
        type: "manual",
        amount,
        pot_number: potNumber,
        pot_position: potPosition,
        description: `Multa Geral do Fiscal — ${potLabel} (CC$${FIXED_FINE.toLocaleString("pt-BR")} fixa)`,
        is_automatic: false,
        applied_by: auth.user.id,
      });

      if (fineErr) throw fineErr;

      const { error: txErr } = await supabase
        .from("draft_balance_transactions")
        .insert({
          championship_id: championshipId,
          championship_manager_id: cm.id,
          type: "FINE_MANUAL",
          amount: -amount,
          description: `Multa Geral — ${potLabel}`,
        });

      if (txErr) throw txErr;

      const { error: upErr } = await supabase
        .from("championship_managers")
        .update({ current_balance: newBalance })
        .eq("id", cm.id);

      if (upErr) throw upErr;

      applied.push({ championshipManagerId: cm.id, amount });
    }

    return NextResponse.json({ success: true, appliedCount: applied.length, applied });
  } catch (err) {
    console.error("bulk-general-fine error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
