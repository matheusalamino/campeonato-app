import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/** Leitura pública do estado de leilão (apresentação / painéis). */
export async function GET(req: NextRequest) {
  const championshipId = req.nextUrl.searchParams.get("championshipId");

  if (!championshipId) {
    return NextResponse.json(
      { error: "championshipId é obrigatório" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("championships")
    .select(
      "id, draft_auction_open, draft_auction_pot_number, draft_auction_pot_position",
    )
    .eq("id", championshipId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Campeonato não encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    championshipId: data.id,
    draft_auction_open: data.draft_auction_open,
    draft_auction_pot_number: data.draft_auction_pot_number,
    draft_auction_pot_position: data.draft_auction_pot_position,
  });
}
