import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas administradores" },
      { status: 403 },
    );
  }

  return null;
}

type BidRow = {
  id: string;
  championship_manager_id: string;
  bid_amount: number;
  submitted_at: string;
};

/**
 * Marca `qualified` em draft_qualification_bids para um pote, após o encerramento
 * dos lances (mesma regra de ranking do PotBidsSlide / pot-bids-status).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const authError = await requireAdmin(supabase);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      championshipId: string;
      potNumber: number;
      potPosition: string;
    };

    const { championshipId, potNumber, potPosition } = body;
    const pos = typeof potPosition === "string" ? potPosition.trim() : "";
    if (!championshipId || potNumber == null || !pos) {
      return NextResponse.json(
        { error: "championshipId, potNumber e potPosition são obrigatórios" },
        { status: 400 },
      );
    }

    if (pos.toLowerCase() === "goleiro") {
      return NextResponse.json(
        { error: "Pote de goleiro não usa habilitação por lance" },
        { status: 400 },
      );
    }

    const { data: potRow, error: potErr } = await supabase
      .from("draft_pots")
      .select("max_managers")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("position", pos)
      .maybeSingle();

    if (potErr) throw potErr;
    const maxManagers = potRow?.max_managers ?? 0;

    const { data: bids, error: bidsErr } = await supabase
      .from("draft_qualification_bids")
      .select("id, championship_manager_id, bid_amount, submitted_at")
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos);

    if (bidsErr) throw bidsErr;
    const bidList = (bids ?? []) as BidRow[];

    const { data: enrolledManagers, error: mgrErr } = await supabase
      .from("championship_managers")
      .select("id, team_id")
      .eq("championship_id", championshipId);

    if (mgrErr) throw mgrErr;

    const teamIds = (enrolledManagers ?? [])
      .map((m) => m.team_id as string | null)
      .filter((id): id is string => !!id);

    const { data: championshipTeams } = await supabase
      .from("championship_teams")
      .select("id, team_id")
      .eq("championship_id", championshipId);

    const ctIdToTeamId: Record<string, string> = {};
    (championshipTeams ?? []).forEach((ct) => {
      ctIdToTeamId[ct.id as string] = ct.team_id as string;
    });

    let playerCounts: { championship_team_id: string }[] = [];
    if (teamIds.length > 0) {
      const ctIds = (championshipTeams ?? [])
        .filter((ct) => teamIds.includes(ct.team_id as string))
        .map((ct) => ct.id as string);

      if (ctIds.length > 0) {
        const { data: pc } = await supabase
          .from("championship_team_players")
          .select("championship_team_id")
          .in("championship_team_id", ctIds);
        playerCounts = (pc ?? []) as { championship_team_id: string }[];
      }
    }

    const teamPlayerCount: Record<string, number> = {};
    playerCounts.forEach((p) => {
      const teamId = ctIdToTeamId[p.championship_team_id];
      if (teamId) teamPlayerCount[teamId] = (teamPlayerCount[teamId] ?? 0) + 1;
    });

    const cmEligible = new Map<string, boolean>();
    (enrolledManagers ?? []).forEach((m) => {
      const id = m.id as string;
      const tid = m.team_id as string | null;
      const pc = tid ? (teamPlayerCount[tid] ?? 0) : 0;
      cmEligible.set(id, pc < 10);
    });

    const eligibleBids = bidList.filter((b) =>
      cmEligible.get(b.championship_manager_id),
    );

    eligibleBids.sort((a, b) => {
      const diff = b.bid_amount - a.bid_amount;
      if (diff !== 0) return diff;
      const ta = new Date(a.submitted_at).getTime();
      const tb = new Date(b.submitted_at).getTime();
      return ta - tb;
    });

    const cap = Math.max(0, Math.min(maxManagers, eligibleBids.length));
    const winningIds = new Set(eligibleBids.slice(0, cap).map((b) => b.id));

    const { error: resetErr } = await supabase
      .from("draft_qualification_bids")
      .update({ qualified: false })
      .eq("championship_id", championshipId)
      .eq("pot_number", potNumber)
      .eq("pot_position", pos);

    if (resetErr) throw resetErr;

    if (winningIds.size > 0) {
      const { error: winErr } = await supabase
        .from("draft_qualification_bids")
        .update({ qualified: true })
        .in("id", [...winningIds]);

      if (winErr) throw winErr;
    }

    return NextResponse.json({
      success: true,
      qualifiedCount: winningIds.size,
      bidCount: bidList.length,
    });
  } catch (err) {
    console.error("qualification-resolve error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
