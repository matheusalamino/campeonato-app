import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

function firstJoined<T>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return (v[0] ?? undefined) as T | undefined;
  return v as T;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;

  const supabase = auth.supabase;
  const championshipId = req.nextUrl.searchParams.get("championshipId");

  if (!championshipId) {
    return NextResponse.json(
      { error: "championshipId é obrigatório" },
      { status: 400 },
    );
  }

  try {
    const { data: ch, error: chErr } = await supabase
      .from("championships")
      .select(
        "id, name, draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
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
      return NextResponse.json({
        championshipId: ch.id,
        championshipName: ch.name,
        auctionOpen: false,
        potNumber: null,
        potPosition: null,
        participants: [] as unknown[],
      });
    }

    const potNumber = ch.draft_auction_pot_number;
    const potPosition = ch.draft_auction_pot_position.trim();

    const { data: budgets, error: bErr } = await supabase
      .from("draft_pot_budgets")
      .select(
        `
        id,
        championship_manager_id,
        remaining_budget,
        initial_budget,
        settled,
        championship_managers (
          id,
          current_balance,
          manager_id,
          team_id,
          managers ( name ),
          teams ( name )
        )
      `,
      )
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .eq("settled", false);

    if (bErr) throw bErr;

    const cmIds =
      budgets?.map((b) => b.championship_manager_id).filter(Boolean) ?? [];

    const maxOccByCm = new Map<string, number>();

    if (cmIds.length > 0) {
      const { data: fines, error: fErr } = await supabase
        .from("draft_fines")
        .select("championship_manager_id, occurrence_number")
        .eq("championship_id", championshipId)
        .eq("type", "over_budget")
        .in("championship_manager_id", cmIds);

      if (fErr) throw fErr;

      for (const row of fines ?? []) {
        const cmId = row.championship_manager_id as string;
        const occ = row.occurrence_number ?? 0;
        maxOccByCm.set(cmId, Math.max(maxOccByCm.get(cmId) ?? 0, occ));
      }
    }

    const participants = (budgets ?? []).map((row) => {
      const cm = firstJoined<{
        id: string;
        current_balance: number;
        managers?: unknown;
        teams?: unknown;
      }>(row.championship_managers);

      const team = firstJoined<{ name: string }>(cm?.teams);
      const manager = firstJoined<{ name: string }>(cm?.managers);

      const displayName =
        team?.name?.trim() ||
        manager?.name?.trim() ||
        "Cartola";

      const maxOcc = cm ? (maxOccByCm.get(cm.id) ?? 0) : 0;
      const nextOcc = maxOcc + 1;
      const nextProgressiveFine = nextOcc * 2000;

      return {
        draftPotBudgetId: row.id,
        championshipManagerId: row.championship_manager_id,
        displayName,
        currentBalance: cm?.current_balance ?? 0,
        remainingPotBudget: row.remaining_budget,
        initialPotBudget: row.initial_budget,
        nextProgressiveOverBudgetFine: nextProgressiveFine,
      };
    });

    return NextResponse.json({
      championshipId: ch.id,
      championshipName: ch.name,
      auctionOpen: true,
      potNumber,
      potPosition,
      participants,
    });
  } catch (err) {
    console.error("fiscal pot-participants error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
