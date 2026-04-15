import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();

  try {
    const { championshipId, championshipManagerId, bidAmount } =
      (await req.json()) as {
        championshipId: string;
        championshipManagerId: string;
        bidAmount: number;
      };

    if (!championshipId || !championshipManagerId || !bidAmount) {
      return NextResponse.json(
        { error: "Dados obrigatórios ausentes" },
        { status: 400 },
      );
    }

    if (bidAmount < 1000 || bidAmount % 1000 !== 0) {
      return NextResponse.json(
        { error: "Valor mínimo é CC$ 1.000 com incrementos de CC$ 1.000" },
        { status: 400 },
      );
    }

    const { data: cm } = await supabase
      .from("championship_managers")
      .select("current_balance")
      .eq("id", championshipManagerId)
      .single();

    if (!cm || cm.current_balance < bidAmount) {
      return NextResponse.json(
        { error: "Saldo insuficiente" },
        { status: 400 },
      );
    }

    const { error: bidError } = await supabase
      .from("draft_qualification_bids")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        bid_amount: bidAmount,
        submitted_at: new Date().toISOString(),
        pot_number: 0,
        pot_position: "PENDING",
      });

    if (bidError) {
      if (bidError.code === "23505") {
        return NextResponse.json(
          { error: "Você já enviou um lance para este pote" },
          { status: 409 },
        );
      }
      throw bidError;
    }

    const newBalance = cm.current_balance - bidAmount;

    const { error: txError } = await supabase
      .from("draft_balance_transactions")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: "POT_BID_RESERVE",
        amount: -bidAmount,
        description: `Lance de habilitação: ${bidAmount.toLocaleString("pt-BR")}`,
      });

    if (txError) throw txError;

    const { error: updateError } = await supabase
      .from("championship_managers")
      .update({ current_balance: newBalance })
      .eq("id", championshipManagerId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, newBalance });
  } catch (err) {
    console.error("join-pot-bid error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
