import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Types ──────────────────────────────────────────────────
export type ManagerBidStatus = {
  championship_manager_id: string;
  manager_name: string;
  team_name: string | null;
  player_count: number;
  is_eligible: boolean; // false if team is full (>= 10 players)
  has_bid: boolean;
  bid_amount: number | null;
  submitted_at: string | null;
  qualified: boolean | null;
};

export type PotBidsStatusResponse = {
  pot_number: number;
  pot_position: string;
  max_managers: number;
  window_open: boolean;
  all_eligible_submitted: boolean;
  managers: ManagerBidStatus[];
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const championshipId = searchParams.get("championshipId");
  const potNumber = searchParams.get("potNumber");
  const potPosition = searchParams.get("potPosition");

  if (!championshipId || !potNumber || !potPosition) {
    return NextResponse.json(
      { error: "Missing championshipId, potNumber or potPosition" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // 1. Championship window state + draft pot max_managers
  const [champResult, potResult] = await Promise.all([
    supabase
      .from("championships")
      .select(
        "draft_qualification_window_open, draft_qualification_pot_number, draft_qualification_pot_position",
      )
      .eq("id", championshipId)
      .single(),

    supabase
      .from("draft_pots")
      .select("max_managers")
      .eq("championship_id", championshipId)
      .eq("pot_number", Number(potNumber))
      .eq("position", potPosition)
      .limit(1)
      .single(),
  ]);

  if (champResult.error) {
    return NextResponse.json(
      { error: champResult.error.message },
      { status: 500 },
    );
  }

  const champ = champResult.data;
  const maxManagers = potResult.data?.max_managers ?? 0;
  const windowOpen = champ.draft_qualification_window_open ?? false;

  // 2. All managers enrolled in this championship with their team + player count
  const { data: enrolledManagers, error: mgrErr } = await supabase
    .from("championship_managers")
    .select(
      `
      id,
      team_id,
      managers ( name ),
      teams ( name ),
      championship_id
    `,
    )
    .eq("championship_id", championshipId);

  if (mgrErr) {
    return NextResponse.json({ error: mgrErr.message }, { status: 500 });
  }

  // 3. Player count per team (championship_team_players)
  const teamIds = (enrolledManagers ?? [])
    .map((m) => m.team_id)
    .filter((id): id is string => !!id);

  const { data: playerCounts } = await supabase
    .from("championship_team_players")
    .select("championship_team_id")
    .in(
      "championship_team_id",
      teamIds.length > 0
        ? await (async () => {
            const { data: ctRows } = await supabase
              .from("championship_teams")
              .select("id")
              .in("team_id", teamIds)
              .eq("championship_id", championshipId);
            return (ctRows ?? []).map((r) => r.id as string);
          })()
        : ["__none__"],
    );

  // Build team_id → player_count map
  // We need championship_team_id → team_id first
  const { data: championshipTeams } = await supabase
    .from("championship_teams")
    .select("id, team_id")
    .eq("championship_id", championshipId);

  const ctIdToTeamId: Record<string, string> = {};
  (championshipTeams ?? []).forEach((ct) => {
    ctIdToTeamId[ct.id as string] = ct.team_id as string;
  });

  const teamPlayerCount: Record<string, number> = {};
  (playerCounts ?? []).forEach((p) => {
    const teamId = ctIdToTeamId[p.championship_team_id as string];
    if (teamId) teamPlayerCount[teamId] = (teamPlayerCount[teamId] ?? 0) + 1;
  });

  // 4. Existing bids for this pot
  const { data: bids, error: bidsErr } = await supabase
    .from("draft_qualification_bids")
    .select("championship_manager_id, bid_amount, submitted_at, qualified")
    .eq("championship_id", championshipId)
    .eq("pot_number", Number(potNumber))
    .eq("pot_position", potPosition);

  if (bidsErr) {
    return NextResponse.json({ error: bidsErr.message }, { status: 500 });
  }

  const bidMap: Record<
    string,
    { bid_amount: number; submitted_at: string; qualified: boolean | null }
  > = {};
  (bids ?? []).forEach((b) => {
    bidMap[b.championship_manager_id as string] = {
      bid_amount: b.bid_amount as number,
      submitted_at: b.submitted_at as string,
      qualified: b.qualified as boolean | null,
    };
  });

  // 5. Build response
  type MgrRow = {
    id: string;
    team_id: string | null;
    managers: { name: string } | null;
    teams: { name: string } | null;
  };

  const managers: ManagerBidStatus[] = (enrolledManagers ?? []).map((m) => {
    const row = m as unknown as MgrRow;
    const playerCount = row.team_id ? (teamPlayerCount[row.team_id] ?? 0) : 0;
    const isEligible = playerCount < 10;
    const bid = bidMap[row.id];
    return {
      championship_manager_id: row.id,
      manager_name: row.managers?.name ?? "—",
      team_name: row.teams?.name ?? null,
      player_count: playerCount,
      is_eligible: isEligible,
      has_bid: !!bid,
      bid_amount: bid?.bid_amount ?? null,
      submitted_at: bid?.submitted_at ?? null,
      qualified: bid?.qualified ?? null,
    };
  });

  const eligibleManagers = managers.filter((m) => m.is_eligible);
  const allEligibleSubmitted =
    eligibleManagers.length > 0 && eligibleManagers.every((m) => m.has_bid);

  const response: PotBidsStatusResponse = {
    pot_number: Number(potNumber),
    pot_position: potPosition,
    max_managers: maxManagers,
    window_open: windowOpen,
    all_eligible_submitted: allEligibleSubmitted,
    managers,
  };

  return NextResponse.json(response);
}
