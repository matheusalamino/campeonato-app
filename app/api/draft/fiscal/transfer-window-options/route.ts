import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type PlayerOption = {
  registrationId: string;
  name: string;
  position: string;
};

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
    const { data: cmRows, error: cmErr } = await supabase
      .from("championship_managers")
      .select("id, team_id, managers(name), teams(name)")
      .eq("championship_id", championshipId);
    if (cmErr) throw cmErr;

    const teamIds = Array.from(
      new Set((cmRows ?? []).map((r) => r.team_id).filter(Boolean)),
    ) as string[];

    const { data: ctRows, error: ctErr } = await supabase
      .from("championship_teams")
      .select("id, team_id")
      .eq("championship_id", championshipId)
      .in("team_id", teamIds.length > 0 ? teamIds : ["__none__"]);
    if (ctErr) throw ctErr;

    const champTeamByTeamId = new Map<string, string>();
    (ctRows ?? []).forEach((row) => {
      champTeamByTeamId.set(row.team_id as string, row.id as string);
    });

    const champTeamIds = (ctRows ?? []).map((r) => r.id as string);
    const { data: ctpRows, error: ctpErr } = await supabase
      .from("championship_team_players")
      .select("championship_team_id, registration_id")
      .in(
        "championship_team_id",
        champTeamIds.length > 0 ? champTeamIds : ["__none__"],
      );
    if (ctpErr) throw ctpErr;

    const registrationIds = Array.from(
      new Set((ctpRows ?? []).map((r) => r.registration_id as string)),
    );
    const { data: regRows, error: regErr } = await supabase
      .from("championship_registrations")
      .select("id, player_id")
      .eq("championship_id", championshipId)
      .in("id", registrationIds.length > 0 ? registrationIds : ["__none__"]);
    if (regErr) throw regErr;

    const playerIds = Array.from(
      new Set((regRows ?? []).map((r) => r.player_id as string)),
    );
    const { data: playerRows, error: playerErr } = await supabase
      .from("players")
      .select("id, name, preferred_position")
      .in("id", playerIds.length > 0 ? playerIds : ["__none__"]);
    if (playerErr) throw playerErr;

    const regById = new Map(
      (regRows ?? []).map((r) => [r.id as string, r.player_id as string]),
    );
    const playerById = new Map(
      (playerRows ?? []).map((p) => [
        p.id as string,
        { name: p.name as string, position: (p.preferred_position as string) ?? "" },
      ]),
    );

    const playersByChampTeamId = new Map<string, PlayerOption[]>();
    (ctpRows ?? []).forEach((row) => {
      const ctId = row.championship_team_id as string;
      const regId = row.registration_id as string;
      const playerId = regById.get(regId);
      if (!playerId) return;
      const player = playerById.get(playerId);
      if (!player) return;
      const list = playersByChampTeamId.get(ctId) ?? [];
      list.push({
        registrationId: regId,
        name: player.name,
        position: player.position,
      });
      playersByChampTeamId.set(ctId, list);
    });

    const managers = (cmRows ?? []).map((row) => {
      const teamId = row.team_id as string | null;
      const championshipTeamId = teamId ? champTeamByTeamId.get(teamId) ?? null : null;
      const managerName = Array.isArray(row.managers)
        ? ((row.managers[0] as { name?: string } | undefined)?.name ?? "Cartola")
        : ((row.managers as { name?: string } | null)?.name ?? "Cartola");
      const teamName = Array.isArray(row.teams)
        ? ((row.teams[0] as { name?: string } | undefined)?.name ?? null)
        : ((row.teams as { name?: string } | null)?.name ?? null);

      const players = championshipTeamId
        ? (playersByChampTeamId.get(championshipTeamId) ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        : [];

      return {
        championshipManagerId: row.id as string,
        displayName: teamName ? `${managerName} (${teamName})` : managerName,
        players,
      };
    });

    return NextResponse.json({
      championshipId,
      managers: managers.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "pt-BR"),
      ),
    });
  } catch (err) {
    console.error("transfer-window-options error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}

