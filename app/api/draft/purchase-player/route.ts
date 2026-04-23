import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type PurchasePlayerBody = {
  championshipId: string;
  championshipManagerId: string;
  registrationId: string;
  potNumber: number;
  potPosition: string;
  purchasePrice: number;
  purchaseType: "open_auction" | "special_card" | "additional_round";
};

function purchaseTypeLabel(t: PurchasePlayerBody["purchaseType"]): string {
  switch (t) {
    case "open_auction":
      return "Leilão aberto";
    case "special_card":
      return "Cartão especial";
    case "additional_round":
      return "Rodada adicional";
    default:
      return "Draft";
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;

  const supabase = auth.supabase;

  const body = (await req.json()) as PurchasePlayerBody;

  const {
    championshipId,
    championshipManagerId,
    registrationId,
    potNumber,
    potPosition,
    purchasePrice,
    purchaseType,
  } = body;

  if (
    !championshipId ||
    !championshipManagerId ||
    !registrationId ||
    potNumber == null ||
    !potPosition ||
    purchasePrice == null ||
    purchasePrice < 0 ||
    !purchaseType
  ) {
    return NextResponse.json(
      { error: "Campos obrigatórios inválidos ou preço negativo" },
      { status: 400 },
    );
  }

  const pos = potPosition.trim();
  if (!pos) {
    return NextResponse.json({ error: "potPosition inválido" }, { status: 400 });
  }

  let purchaseRowId: string | null = null;

  try {
    const { data: reg, error: regErr } = await supabase
      .from("championship_registrations")
      .select("id, championship_id")
      .eq("id", registrationId)
      .single();

    if (regErr || !reg || reg.championship_id !== championshipId) {
      return NextResponse.json(
        { error: "Inscrição não encontrada neste campeonato" },
        { status: 400 },
      );
    }

    const { data: existingPurchase } = await supabase
      .from("draft_player_purchases")
      .select("id")
      .eq("championship_id", championshipId)
      .eq("registration_id", registrationId)
      .limit(1);

    if ((existingPurchase?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "Este jogador já foi comprado neste campeonato" },
        { status: 409 },
      );
    }

    const { data: ctIds, error: ctIdsErr } = await supabase
      .from("championship_teams")
      .select("id")
      .eq("championship_id", championshipId);

    if (ctIdsErr) throw ctIdsErr;

    const teamIdsInChamp = (ctIds ?? []).map((r) => r.id as string);

    if (teamIdsInChamp.length > 0) {
      const { count: ctpDup, error: ctpDupErr } = await supabase
        .from("championship_team_players")
        .select("id", { count: "exact", head: true })
        .eq("registration_id", registrationId)
        .in("championship_team_id", teamIdsInChamp);

      if (ctpDupErr) throw ctpDupErr;
      if ((ctpDup ?? 0) > 0) {
        return NextResponse.json(
          { error: "Este jogador já está em um time neste campeonato" },
          { status: 409 },
        );
      }
    }

    const { data: cm, error: cmErr } = await supabase
      .from("championship_managers")
      .select("id, team_id, current_balance")
      .eq("id", championshipManagerId)
      .eq("championship_id", championshipId)
      .single();

    if (cmErr || !cm?.team_id) {
      return NextResponse.json(
        { error: "Cartola não encontrado ou sem time atribuído" },
        { status: 400 },
      );
    }

    const { data: ctRow, error: ctErr } = await supabase
      .from("championship_teams")
      .select("id")
      .eq("championship_id", championshipId)
      .eq("team_id", cm.team_id)
      .limit(1)
      .maybeSingle();

    if (ctErr) throw ctErr;
    if (!ctRow?.id) {
      return NextResponse.json(
        { error: "Time do cartola não está inscrito neste campeonato" },
        { status: 400 },
      );
    }

    const championshipTeamId = ctRow.id as string;
    const balanceBefore = cm.current_balance ?? 0;

    const { data: budgetRows, error: budErr } = await supabase
      .from("draft_pot_budgets")
      .select("id, remaining_budget")
      .eq("championship_id", championshipId)
      .eq("championship_manager_id", championshipManagerId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos)
      .eq("settled", false)
      .limit(1);

    if (budErr) throw budErr;

    const budget =
      purchaseType === "open_auction"
        ? (budgetRows?.[0] as
            | { id: string; remaining_budget: number }
            | undefined)
        : undefined;

    if (budget && budget.remaining_budget < purchasePrice) {
      return NextResponse.json(
        {
          error: `Saldo do pote insuficiente (restante ${budget.remaining_budget.toLocaleString("pt-BR")})`,
        },
        { status: 400 },
      );
    }

    if (balanceBefore < purchasePrice) {
      return NextResponse.json(
        { error: "Saldo CC do cartola insuficiente para este valor" },
        { status: 400 },
      );
    }

    const { data: purchaseIns, error: purchaseErr } = await supabase
      .from("draft_player_purchases")
      .insert({
        championship_id: championshipId,
        championship_manager_id: championshipManagerId,
        registration_id: registrationId,
        pot_number: potNumber,
        pot_position: pos,
        purchase_price: purchasePrice,
        purchase_type: purchaseType,
      })
      .select("id")
      .single();

    if (purchaseErr || !purchaseIns?.id) throw purchaseErr ?? new Error("insert");
    purchaseRowId = purchaseIns.id as string;

    const { error: ctpErr } = await supabase.from("championship_team_players").insert({
      championship_team_id: championshipTeamId,
      registration_id: registrationId,
    });

    if (ctpErr) {
      await supabase
        .from("draft_player_purchases")
        .delete()
        .eq("id", purchaseRowId);
      throw ctpErr;
    }

    const newBalance = balanceBefore - purchasePrice;
    const potLabel = `Pote ${potNumber} (${pos})`;
    const typeLabel = purchaseTypeLabel(purchaseType);

    const { error: txErr } = await supabase.from("draft_balance_transactions").insert({
      championship_id: championshipId,
      championship_manager_id: championshipManagerId,
      type: "DRAFT_PLAYER_PURCHASE",
      amount: -purchasePrice,
      reference_id: purchaseRowId,
      description: `${typeLabel} — ${potLabel}: ${purchasePrice.toLocaleString("pt-BR")}`,
    });

    if (txErr) {
      await supabase
        .from("championship_team_players")
        .delete()
        .eq("championship_team_id", championshipTeamId)
        .eq("registration_id", registrationId);
      await supabase.from("draft_player_purchases").delete().eq("id", purchaseRowId);
      throw txErr;
    }

    const { error: balErr } = await supabase
      .from("championship_managers")
      .update({ current_balance: newBalance })
      .eq("id", championshipManagerId);

    if (balErr) {
      await supabase
        .from("draft_balance_transactions")
        .delete()
        .eq("reference_id", purchaseRowId)
        .eq("type", "DRAFT_PLAYER_PURCHASE");
      await supabase
        .from("championship_team_players")
        .delete()
        .eq("championship_team_id", championshipTeamId)
        .eq("registration_id", registrationId);
      await supabase.from("draft_player_purchases").delete().eq("id", purchaseRowId);
      throw balErr;
    }

    if (budget) {
      const newRem = budget.remaining_budget - purchasePrice;
      const { error: budUpErr } = await supabase
        .from("draft_pot_budgets")
        .update({ remaining_budget: Math.max(0, newRem) })
        .eq("id", budget.id);

      if (budUpErr) {
        await supabase
          .from("championship_managers")
          .update({ current_balance: balanceBefore })
          .eq("id", championshipManagerId);
        await supabase
          .from("draft_balance_transactions")
          .delete()
          .eq("reference_id", purchaseRowId)
          .eq("type", "DRAFT_PLAYER_PURCHASE");
        await supabase
          .from("championship_team_players")
          .delete()
          .eq("championship_team_id", championshipTeamId)
          .eq("registration_id", registrationId);
        await supabase.from("draft_player_purchases").delete().eq("id", purchaseRowId);
        throw budUpErr;
      }
    }

    return NextResponse.json({
      ok: true,
      purchaseId: purchaseRowId,
      newBalance,
    });
  } catch (err) {
    console.error("purchase-player error:", err);
    if (purchaseRowId) {
      await supabase.from("draft_player_purchases").delete().eq("id", purchaseRowId);
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    const lowered = message.toLowerCase();
    const status =
      lowered.includes("duplicate") || lowered.includes("unique")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
