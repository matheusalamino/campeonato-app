import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();

  try {
    const { championshipId, championshipManagerId, specialCardUseId, bidAmount } =
      (await req.json()) as {
        championshipId: string;
        championshipManagerId: string;
        specialCardUseId: string;
        bidAmount: number;
      };

    if (
      !championshipId ||
      !championshipManagerId ||
      !specialCardUseId ||
      bidAmount === undefined
    ) {
      return NextResponse.json(
        { error: "Dados obrigatórios ausentes" },
        { status: 400 },
      );
    }

    if (bidAmount < 0 || bidAmount % 1000 !== 0) {
      return NextResponse.json(
        { error: "Valor inválido. Deve ser múltiplo de CC$ 1.000" },
        { status: 400 },
      );
    }

    if (bidAmount > 0) {
      const { data: budget } = await supabase
        .from("draft_pot_budgets")
        .select("remaining_budget")
        .eq("championship_manager_id", championshipManagerId)
        .eq("settled", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!budget || budget.remaining_budget < bidAmount) {
        return NextResponse.json(
          { error: "Saldo do pote insuficiente" },
          { status: 400 },
        );
      }
    }

    const { error: bidError } = await supabase
      .from("draft_special_card_bids")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        special_card_use_id: specialCardUseId,
        bid_amount: bidAmount,
        submitted_at: new Date().toISOString(),
      });

    if (bidError) {
      if (bidError.code === "23505") {
        return NextResponse.json(
          { error: "Você já enviou um lance para esta Carta Especial" },
          { status: 409 },
        );
      }
      throw bidError;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("special-card-bid error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
