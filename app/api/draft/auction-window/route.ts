import { NextResponse } from "next/server";
import { requireAdminOrAuctionFiscal } from "@/lib/draft-auth";

export async function POST(req: Request) {
  const auth = await requireAdminOrAuctionFiscal();
  if (auth.error || !auth.supabase) return auth.error!;

  const supabase = auth.supabase;

  try {
    const body = (await req.json()) as {
      championshipId: string;
      open: boolean;
      potNumber?: number;
      potPosition?: string;
    };

    const { championshipId, open, potNumber, potPosition } = body;

    if (!championshipId || typeof open !== "boolean") {
      return NextResponse.json(
        { error: "championshipId e open são obrigatórios" },
        { status: 400 },
      );
    }

    if (open) {
      if (
        potNumber === undefined ||
        potNumber === null ||
        !potPosition ||
        typeof potPosition !== "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Com open=true, informe potNumber e potPosition (iguais ao draft_pots)",
          },
          { status: 400 },
        );
      }

      const normalizedPosition = potPosition.trim();
      if (!normalizedPosition) {
        return NextResponse.json(
          { error: "potPosition inválido" },
          { status: 400 },
        );
      }

      const { data: potRow, error: potErr } = await supabase
        .from("draft_pots")
        .select("id")
        .eq("championship_id", championshipId)
        .eq("pot_number", potNumber)
        .eq("position", normalizedPosition)
        .limit(1)
        .maybeSingle();

      if (potErr) throw potErr;

      if (!potRow) {
        return NextResponse.json(
          {
            error:
              "Nenhum draft_pots encontrado para este campeonato, pote e posição",
          },
          { status: 400 },
        );
      }

      const { error: rpcErr } = await supabase.rpc("set_draft_auction_state", {
        p_championship_id: championshipId,
        p_open: true,
        p_pot_number: potNumber,
        p_pot_position: normalizedPosition,
      });

      if (rpcErr) throw rpcErr;

      return NextResponse.json({ success: true, open: true });
    }

    const { error: rpcErr } = await supabase.rpc("set_draft_auction_state", {
      p_championship_id: championshipId,
      p_open: false,
      p_pot_number: null,
      p_pot_position: null,
    });

    if (rpcErr) throw rpcErr;

    return NextResponse.json({ success: true, open: false });
  } catch (err) {
    console.error("auction-window error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}
