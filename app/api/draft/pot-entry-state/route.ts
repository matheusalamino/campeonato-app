import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type QualifiedManager = {
  championship_manager_id: string;
  manager_name: string;
  team_name: string | null;
};

type ResponseShape = {
  nextScreen: "bids" | "auction";
  qualifiedManagers: QualifiedManager[];
};

function firstJoined<T>(value: unknown): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return value as T;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;
  const supabase = auth.supabase;

  const championshipId = req.nextUrl.searchParams.get("championshipId");
  const potNumberStr = req.nextUrl.searchParams.get("potNumber");
  const potPositionRaw = req.nextUrl.searchParams.get("potPosition");

  if (!championshipId || !potNumberStr || !potPositionRaw) {
    return NextResponse.json(
      { error: "championshipId, potNumber e potPosition são obrigatórios." },
      { status: 400 },
    );
  }

  const potNumber = Number(potNumberStr);
  const potPosition = potPositionRaw.trim();

  if (!Number.isFinite(potNumber) || !potPosition) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const isGoalkeeper = potPosition.toLowerCase().includes("goleiro");

  try {
    const { count: purchasesCount, error: purchasesErr } = await supabase
      .from("draft_player_purchases")
      .select("id", { count: "exact", head: true })
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition);

    if (purchasesErr) throw purchasesErr;

    if (isGoalkeeper) {
      const { data: enrolledManagers, error: mgrErr } = await supabase
        .from("championship_managers")
        .select(
          `
            id,
            team_id,
            managers ( name ),
            teams ( name )
          `,
        )
        .eq("championship_id", championshipId);
      if (mgrErr) throw mgrErr;

      const teamIds = (enrolledManagers ?? [])
        .map((m) => m.team_id)
        .filter((id): id is string => Boolean(id));

      const { data: championshipTeams, error: cTeamsErr } = await supabase
        .from("championship_teams")
        .select("id, team_id")
        .eq("championship_id", championshipId)
        .in("team_id", teamIds.length ? teamIds : ["__none__"]);
      if (cTeamsErr) throw cTeamsErr;

      const ctIdToTeamId = new Map<string, string>();
      (championshipTeams ?? []).forEach((ct) =>
        ctIdToTeamId.set(ct.id, ct.team_id as string),
      );

      const ctIds = (championshipTeams ?? []).map((ct) => ct.id as string);
      const { data: playerCounts, error: pCountErr } = await supabase
        .from("championship_team_players")
        .select("championship_team_id")
        .in("championship_team_id", ctIds.length ? ctIds : ["__none__"]);
      if (pCountErr) throw pCountErr;

      const teamPlayerCount = new Map<string, number>();
      (playerCounts ?? []).forEach((row) => {
        const teamId = ctIdToTeamId.get(row.championship_team_id as string);
        if (!teamId) return;
        teamPlayerCount.set(teamId, (teamPlayerCount.get(teamId) ?? 0) + 1);
      });

      const qualifiedManagers: QualifiedManager[] = (enrolledManagers ?? [])
        .filter((m) => {
          const tid = m.team_id as string | null;
          const count = tid ? (teamPlayerCount.get(tid) ?? 0) : 0;
          return count < 10;
        })
        .map((m) => ({
          championship_manager_id: m.id as string,
          manager_name:
            firstJoined<{ name: string }>(m.managers)?.name ?? "—",
          team_name: firstJoined<{ name: string }>(m.teams)?.name ?? null,
        }));

      const response: ResponseShape = {
        nextScreen:
          qualifiedManagers.length > 0 || (purchasesCount ?? 0) > 0
            ? "auction"
            : "bids",
        qualifiedManagers,
      };
      return NextResponse.json(response);
    }

    const { data: budgetRows, error: budgetErr } = await supabase
      .from("draft_pot_budgets")
      .select("championship_manager_id")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", potPosition)
      .order("created_at", { ascending: true });
    if (budgetErr) throw budgetErr;

    const qualifiedIds = new Set<string>(
      (budgetRows ?? []).map((r) => r.championship_manager_id as string),
    );

    if ((purchasesCount ?? 0) > 0 && qualifiedIds.size === 0) {
      const { data: purchaseRows, error: pErr } = await supabase
        .from("draft_player_purchases")
        .select("championship_manager_id")
        .eq("championship_id", championshipId)
        .eq("pot_number", potNumber)
        .eq("pot_position", potPosition);
      if (pErr) throw pErr;
      (purchaseRows ?? []).forEach((r) =>
        qualifiedIds.add(r.championship_manager_id as string),
      );
    }

    if (qualifiedIds.size === 0) {
      return NextResponse.json({
        nextScreen: "bids",
        qualifiedManagers: [],
      } satisfies ResponseShape);
    }

    const { data: cmRows, error: cmErr } = await supabase
      .from("championship_managers")
      .select(
        `
          id,
          managers ( name ),
          teams ( name )
        `,
      )
      .in("id", Array.from(qualifiedIds));
    if (cmErr) throw cmErr;

    const qualifiedManagers: QualifiedManager[] = (cmRows ?? []).map((row) => ({
      championship_manager_id: row.id as string,
      manager_name: firstJoined<{ name: string }>(row.managers)?.name ?? "—",
      team_name: firstJoined<{ name: string }>(row.teams)?.name ?? null,
    }));

    return NextResponse.json({
      nextScreen: "auction",
      qualifiedManagers,
    } satisfies ResponseShape);
  } catch (err) {
    console.error("pot-entry-state error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
