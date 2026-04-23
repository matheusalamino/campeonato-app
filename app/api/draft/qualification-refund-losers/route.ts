import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores" },
      { status: 403 },
    );
  }

  return null;
}

type LoserBid = {
  id: string;
  championship_manager_id: string;
  bid_amount: number;
};

/**
 * Credita de volta o valor reservado (POT_BID_RESERVE) dos cartolas não
 * classificados após a habilitação. Idempotente: `reference_id` = id do lance.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const authError = await requireAdmin(supabase);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      championshipId: string;
      potNumber: number;
      potPosition: string;
    };

    const { championshipId, potNumber, potPosition } = body;
    const pos = typeof potPosition === "string" ? potPosition.trim() : "";
    if (!championshipId || potNumber == null || !pos) {
      return NextResponse.json(
        { error: "championshipId, potNumber e potPosition são obrigatórios" },
        { status: 400 },
      );
    }

    if (pos.toLowerCase() === "goleiro") {
      return NextResponse.json({
        success: true,
        refunded: 0,
        skipped: "Pote de goleiro sem habilitação por lance",
      });
    }

    const { data: potRows, error: potErr } = await supabase
      .from("draft_pots")
      .select("max_managers")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("position", pos)
      .order("created_at", { ascending: false })
      .limit(1);

    if (potErr) throw potErr;
    const maxManagers = (potRows?.[0]?.max_managers as number) ?? 0;

    const { data: allBids, error: allErr } = await supabase
      .from("draft_qualification_bids")
      .select("id, qualified")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos);

    if (allErr) throw allErr;
    const bidsList = allBids ?? [];
    const hasAnyBid = bidsList.length > 0;
    const hasWinner = bidsList.some((b) => b.qualified === true);

    if (hasAnyBid && !hasWinner && maxManagers > 0) {
      return NextResponse.json(
        {
          error:
            "Classificação ainda não registrada. Use \"Revelar Lances\" antes de iniciar o leilão.",
        },
        { status: 409 },
      );
    }

    const { data: losers, error: losersErr } = await supabase
      .from("draft_qualification_bids")
      .select("id, championship_manager_id, bid_amount")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos)
      .eq("qualified", false);

    if (losersErr) throw losersErr;
    const loserRows = (losers ?? []) as LoserBid[];

    let refunded = 0;

    for (const bid of loserRows) {
      const { count: existingRefund, error: cntErr } = await supabase
        .from("draft_balance_transactions")
        .select("id", { count: "exact", head: true })
        .eq("reference_id", bid.id)
        .eq("type", "POT_BID_REFUND");

      if (cntErr) throw cntErr;
      if ((existingRefund ?? 0) > 0) continue;

      const { data: cm, error: cmErr } = await supabase
        .from("championship_managers")
        .select("current_balance")
        .eq("id", bid.championship_manager_id)
        .single();

      if (cmErr) throw cmErr;

      const amount = bid.bid_amount;
      const newBalance = (cm?.current_balance ?? 0) + amount;
      const potLabel = `Pote ${potNumber} (${pos})`;

      const { error: txErr } = await supabase
        .from("draft_balance_transactions")
        .insert({
          championship_id: championshipId,
          championship_manager_id: bid.championship_manager_id,
          type: "POT_BID_REFUND",
          amount,
          reference_id: bid.id,
          pot_number: potNumber,
          pot_position: pos,
          description: `Estorno habilitação ${potLabel}: não classificado · ${amount.toLocaleString("pt-BR")}`,
        });

      if (txErr) throw txErr;

      const { error: upErr } = await supabase
        .from("championship_managers")
        .update({ current_balance: newBalance })
        .eq("id", bid.championship_manager_id);

      if (upErr) throw upErr;

      refunded += 1;
    }

    const { data: qualifiedBids, error: qErr } = await supabase
      .from("draft_qualification_bids")
      .select("championship_manager_id, bid_amount")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos)
      .eq("qualified", true);

    if (qErr) throw qErr;

    let potBudgetsCreated = 0;

    for (const row of qualifiedBids ?? []) {
      const cmId = row.championship_manager_id as string;
      const bidAmount = row.bid_amount as number;

      const { data: existingBudget, error: exErr } = await supabase
        .from("draft_pot_budgets")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("championship_manager_id", cmId)
        .eq("pot_number", potNumber)
        .eq("pot_position", pos)
        .maybeSingle();

      if (exErr) throw exErr;
      if (existingBudget) continue;

      const { error: insBud } = await supabase.from("draft_pot_budgets").insert({
        championship_id: championshipId,
        championship_manager_id: cmId,
        pot_number: potNumber,
        pot_position: pos,
        initial_budget: bidAmount,
        remaining_budget: bidAmount,
      });

      if (insBud) throw insBud;
      potBudgetsCreated += 1;
    }

    return NextResponse.json({
      success: true,
      refunded,
      losersConsidered: loserRows.length,
      potBudgetsCreated,
    });
  } catch (err) {
    console.error("qualification-refund-losers error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
