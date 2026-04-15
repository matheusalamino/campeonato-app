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

    const { data: ch, error: chErr } = await supabase
      .from("championships")
      .select(
        "id, draft_qualification_window_open, draft_qualification_pot_number, draft_qualification_pot_position",
      )
      .eq("id", championshipId)
      .single();

    if (chErr || !ch) {
      return NextResponse.json(
        { error: "Campeonato não encontrado" },
        { status: 404 },
      );
    }

    if (!ch.draft_qualification_window_open) {
      return NextResponse.json(
        {
          error:
            "A janela de lances de habilitação está fechada. Aguarde a abertura do pote.",
        },
        { status: 403 },
      );
    }

    const potNumber = ch.draft_qualification_pot_number;
    const potPosition = ch.draft_qualification_pot_position?.trim();

    if (
      potNumber === null ||
      potNumber === undefined ||
      !potPosition ||
      potPosition.length === 0
    ) {
      return NextResponse.json(
        { error: "Pote ativo inválido no campeonato" },
        { status: 400 },
      );
    }

    if (potPosition.toLowerCase() === "goleiro") {
      return NextResponse.json(
        { error: "Habilitação não se aplica ao pote de goleiros" },
        { status: 400 },
      );
    }

    const { data: potRow, error: potErr } = await supabase
      .from("draft_pots")
      .select("id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("position", potPosition)
      .limit(1)
      .maybeSingle();

    if (potErr) throw potErr;

    if (!potRow) {
      return NextResponse.json(
        {
          error:
            "Pote não encontrado nos potes gerados. Verifique pot_number e posição.",
        },
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
        pot_number: potNumber,
        pot_position: potPosition,
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

    const potLabel = `Pote ${potNumber} (${potPosition})`;

    const { error: txError } = await supabase
      .from("draft_balance_transactions")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        type: "POT_BID_RESERVE",
        amount: -bidAmount,
        description: `Habilitação ${potLabel}: ${bidAmount.toLocaleString("pt-BR")}`,
      });

    if (txError) throw txError;

    const { error: updateError } = await supabase
      .from("championship_managers")
      .update({ current_balance: newBalance })
      .eq("id", championshipManagerId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, newBalance, potNumber, potPosition });
  } catch (err) {
    console.error("join-pot-bid error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
