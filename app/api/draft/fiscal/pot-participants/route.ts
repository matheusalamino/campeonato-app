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

    const auctionOpen =
      Boolean(ch.draft_auction_open) &&
      ch.draft_auction_pot_number != null &&
      Boolean(ch.draft_auction_pot_position?.trim());

    const potNumber = auctionOpen ? ch.draft_auction_pot_number : null;
    const potPosition = auctionOpen ? ch.draft_auction_pot_position.trim() : null;

    const { data: allManagers, error: allMgrErr } = await supabase
      .from("championship_managers")
      .select(
        `
          id,
          current_balance,
          managers ( name, photo_url ),
          teams ( name, logo_url )
        `,
      )
      .eq("championship_id", championshipId);
    if (allMgrErr) throw allMgrErr;

    let budgets:
      | {
          id: string;
          championship_manager_id: string;
          remaining_budget: number;
          initial_budget: number;
        }[]
      | null = null;

    if (auctionOpen && potNumber != null && potPosition) {
      const { data: bRows, error: bErr } = await supabase
        .from("draft_pot_budgets")
        .select("id, championship_manager_id, remaining_budget, initial_budget")
        .eq("championship_id", championshipId)
        .eq("pot_number", potNumber)
        .eq("pot_position", potPosition)
        .eq("settled", false);
      if (bErr) throw bErr;
      budgets = bRows;
    } else {
      budgets = [];
    }

    const budgetByCm = new Map<string, { id: string; remaining: number; initial: number }>();
    (budgets ?? []).forEach((b) => {
      budgetByCm.set(b.championship_manager_id, {
        id: b.id,
        remaining: b.remaining_budget,
        initial: b.initial_budget,
      });
    });

    const cmIds = (allManagers ?? []).map((m) => m.id as string);

    if (cmIds.length > 0) {
      const { data: fines, error: fErr } = await supabase
        .from("draft_fines")
        .select("championship_manager_id, occurrence_number, type, amount")
        .eq("championship_id", championshipId)
        .in("championship_manager_id", cmIds);

      if (fErr) throw fErr;

      const fineKey = (cmId: string, type: string) => `${cmId}:${type}`;
      const maxOccByCmType = new Map<string, number>();
      const totalFineByCm = new Map<string, number>();

      for (const row of fines ?? []) {
        const cmId = row.championship_manager_id as string;
        const occ = row.occurrence_number ?? 0;
        const type = (row.type as string) ?? "over_budget";
        const key = fineKey(cmId, type);
        maxOccByCmType.set(key, Math.max(maxOccByCmType.get(key) ?? 0, occ));
        totalFineByCm.set(
          cmId,
          (totalFineByCm.get(cmId) ?? 0) + (row.amount ?? 0),
        );
      }

      const nextFine = (cmId: string, type: string) =>
        (maxOccByCmType.get(fineKey(cmId, type)) ?? 0) + 1;

      const participants = (allManagers ?? []).map((cmRow) => {
        const cmId = cmRow.id as string;
        const manager = firstJoined<{ name?: string; photo_url?: string | null }>(
          cmRow.managers,
        );
        const team = firstJoined<{ name?: string; logo_url?: string | null }>(
          cmRow.teams,
        );
        const budget = budgetByCm.get(cmId);
        return {
          draftPotBudgetId: budget?.id ?? null,
          championshipManagerId: cmId,
          managerName: manager?.name?.trim() || "Cartola",
          managerPhotoUrl: manager?.photo_url ?? null,
          teamName: team?.name?.trim() ?? null,
          teamLogoUrl: team?.logo_url ?? null,
          displayName:
            team?.name?.trim()
              ? `${manager?.name?.trim() || "Cartola"} (${team.name.trim()})`
              : (manager?.name?.trim() || "Cartola"),
          currentBalance: cmRow.current_balance ?? 0,
          totalFineAmount: totalFineByCm.get(cmId) ?? 0,
          remainingPotBudget: budget?.remaining ?? 0,
          initialPotBudget: budget?.initial ?? 0,
          nextProgressiveFineByType: {
            over_budget: nextFine(cmId, "over_budget") * 2000,
            no_bid_player: nextFine(cmId, "no_bid_player") * 2000,
            no_bid_goalkeeper: nextFine(cmId, "no_bid_goalkeeper") * 2000,
          },
        };
      });

      return NextResponse.json({
        championshipId: ch.id,
        championshipName: ch.name,
        auctionOpen,
        potNumber,
        potPosition,
        participants,
      });
    }

    return NextResponse.json({
      championshipId: ch.id,
      championshipName: ch.name,
      auctionOpen,
      potNumber,
      potPosition,
      participants: [] as unknown[],
    });
  } catch (err) {
    console.error("fiscal pot-participants error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
