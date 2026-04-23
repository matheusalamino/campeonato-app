import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

type Body = {
  championshipId?: string;
  managerACmId?: string;
  playerARegistrationId?: string;
  managerBCmId?: string;
  playerBRegistrationId?: string;
};

function normalizePositionGroup(position: string | null | undefined) {
  const p = (position ?? "").trim().toLowerCase();
  if (!p) return "unknown" as const;
  if (p === "gol" || p.includes("goleiro")) return "goalkeeper" as const;
  return "line" as const;
}

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase || !auth.user) return auth.error!;

  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as Body;
    const {
      championshipId,
      managerACmId,
      playerARegistrationId,
      managerBCmId,
      playerBRegistrationId,
    } = body;

    if (
      !championshipId ||
      !managerACmId ||
      !playerARegistrationId ||
      !managerBCmId ||
      !playerBRegistrationId
    ) {
      return NextResponse.json(
        { error: "Campos obrigatórios ausentes para transferência" },
        { status: 400 },
      );
    }

    if (managerACmId === managerBCmId) {
      return NextResponse.json(
        { error: "Selecione cartolas diferentes para a troca" },
        { status: 400 },
      );
    }

    if (playerARegistrationId === playerBRegistrationId) {
      return NextResponse.json(
        { error: "Selecione jogadores diferentes para a troca" },
        { status: 400 },
      );
    }

    const { data: cmRows, error: cmErr } = await supabase
      .from("championship_managers")
      .select("id, team_id")
      .eq("championship_id", championshipId)
      .in("id", [managerACmId, managerBCmId]);
    if (cmErr) throw cmErr;
    if ((cmRows ?? []).length !== 2) {
      return NextResponse.json(
        { error: "Cartolas inválidos para este campeonato" },
        { status: 400 },
      );
    }

    const cmById = new Map((cmRows ?? []).map((r) => [r.id as string, r]));
    const teamAId = cmById.get(managerACmId)?.team_id as string | undefined;
    const teamBId = cmById.get(managerBCmId)?.team_id as string | undefined;
    if (!teamAId || !teamBId) {
      return NextResponse.json(
        { error: "Um dos cartolas está sem time vinculado" },
        { status: 400 },
      );
    }

    const { data: ctRows, error: ctErr } = await supabase
      .from("championship_teams")
      .select("id, team_id")
      .eq("championship_id", championshipId)
      .in("team_id", [teamAId, teamBId]);
    if (ctErr) throw ctErr;
    if ((ctRows ?? []).length !== 2) {
      return NextResponse.json(
        { error: "Times dos cartolas não encontrados no campeonato" },
        { status: 400 },
      );
    }

    const ctByTeamId = new Map((ctRows ?? []).map((r) => [r.team_id as string, r.id as string]));
    const championshipTeamAId = ctByTeamId.get(teamAId);
    const championshipTeamBId = ctByTeamId.get(teamBId);
    if (!championshipTeamAId || !championshipTeamBId) {
      return NextResponse.json(
        { error: "Não foi possível resolver os times do campeonato para a troca" },
        { status: 400 },
      );
    }

    const { data: ctpRows, error: ctpErr } = await supabase
      .from("championship_team_players")
      .select("id, championship_team_id, registration_id")
      .in("registration_id", [playerARegistrationId, playerBRegistrationId])
      .in("championship_team_id", [championshipTeamAId, championshipTeamBId]);
    if (ctpErr) throw ctpErr;

    const ctpA = (ctpRows ?? []).find(
      (r) =>
        (r.registration_id as string) === playerARegistrationId &&
        (r.championship_team_id as string) === championshipTeamAId,
    );
    const ctpB = (ctpRows ?? []).find(
      (r) =>
        (r.registration_id as string) === playerBRegistrationId &&
        (r.championship_team_id as string) === championshipTeamBId,
    );

    if (!ctpA || !ctpB) {
      return NextResponse.json(
        {
          error:
            "A seleção não confere com os elencos atuais (jogador/cartola). Atualize e tente novamente.",
        },
        { status: 409 },
      );
    }

    const { data: regRows, error: regErr } = await supabase
      .from("championship_registrations")
      .select("id, championship_id, player_id")
      .eq("championship_id", championshipId)
      .in("id", [playerARegistrationId, playerBRegistrationId]);
    if (regErr) throw regErr;
    if ((regRows ?? []).length !== 2) {
      return NextResponse.json(
        { error: "Jogadores inválidos para este campeonato" },
        { status: 400 },
      );
    }

    const playerIds = (regRows ?? []).map((r) => r.player_id as string);
    const { data: playerRows, error: playerErr } = await supabase
      .from("players")
      .select("id, name, preferred_position")
      .in("id", playerIds);
    if (playerErr) throw playerErr;
    if ((playerRows ?? []).length !== 2) {
      return NextResponse.json(
        { error: "Não foi possível carregar dados dos jogadores para validar a troca" },
        { status: 400 },
      );
    }

    const playerById = new Map(
      (playerRows ?? []).map((p) => [
        p.id as string,
        {
          name: p.name as string,
          position: (p.preferred_position as string) ?? "",
          group: normalizePositionGroup(p.preferred_position as string),
        },
      ]),
    );

    const playerAId = (regRows ?? []).find((r) => r.id === playerARegistrationId)
      ?.player_id as string;
    const playerBId = (regRows ?? []).find((r) => r.id === playerBRegistrationId)
      ?.player_id as string;

    const playerA = playerById.get(playerAId);
    const playerB = playerById.get(playerBId);
    if (!playerA || !playerB) {
      return NextResponse.json(
        { error: "Falha ao validar posições para a troca" },
        { status: 400 },
      );
    }

    if (playerA.group !== playerB.group) {
      return NextResponse.json(
        {
          error:
            "Troca inválida: só é permitido Goleiro ↔ Goleiro ou Linha ↔ Linha.",
        },
        { status: 400 },
      );
    }

    const { error: moveAErr } = await supabase
      .from("championship_team_players")
      .update({ championship_team_id: championshipTeamBId })
      .eq("id", ctpA.id as string);
    if (moveAErr) throw moveAErr;

    const { error: moveBErr } = await supabase
      .from("championship_team_players")
      .update({ championship_team_id: championshipTeamAId })
      .eq("id", ctpB.id as string);
    if (moveBErr) {
      await supabase
        .from("championship_team_players")
        .update({ championship_team_id: championshipTeamAId })
        .eq("id", ctpA.id as string);
      throw moveBErr;
    }

    const { error: transferErr } = await supabase.from("draft_transfers").insert({
      championship_id: championshipId,
      manager_a_cm_id: managerACmId,
      manager_b_cm_id: managerBCmId,
      player_a_registration_id: playerARegistrationId,
      player_b_registration_id: playerBRegistrationId,
      registered_by: auth.user.id,
    });
    if (transferErr) throw transferErr;

    return NextResponse.json({
      success: true,
      swapped: {
        managerA: { cmId: managerACmId, player: playerA.name, position: playerA.position },
        managerB: { cmId: managerBCmId, player: playerB.name, position: playerB.position },
      },
    });
  } catch (err) {
    console.error("apply-transfer error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}

