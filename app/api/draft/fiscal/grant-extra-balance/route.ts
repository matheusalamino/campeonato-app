import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type Body = {
  championshipId?: string;
  amount?: number;
};

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;
  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as Body;
    const championshipId = body.championshipId;
    const amount = Number(body.amount ?? 0);

    if (!championshipId || amount <= 0 || amount % 1000 !== 0) {
      return NextResponse.json(
        { error: "Informe championshipId e valor positivo em múltiplos de CC$ 1.000." },
        { status: 400 },
      );
    }

    const { data: managers, error: mgrErr } = await supabase
      .from("championship_managers")
      .select("id, current_balance")
      .eq("championship_id", championshipId);
    if (mgrErr) throw mgrErr;

    let affected = 0;
    for (const cm of managers ?? []) {
      const { error: upErr } = await supabase
        .from("championship_managers")
        .update({ current_balance: (cm.current_balance ?? 0) + amount })
        .eq("id", cm.id);
      if (upErr) throw upErr;

      const { error: txErr } = await supabase
        .from("draft_balance_transactions")
        .insert({
          championship_id: championshipId,
          championship_manager_id: cm.id,
          type: "INITIAL_BALANCE",
          amount,
          description: `Crédito extra geral do campeonato: CC$ ${amount.toLocaleString("pt-BR")}`,
        });
      if (txErr) throw txErr;

      affected += 1;
    }

    return NextResponse.json({ success: true, affected, amount });
  } catch (err) {
    console.error("grant-extra-balance error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
