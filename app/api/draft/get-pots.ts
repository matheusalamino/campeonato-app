import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { DraftPotRow, DraftPotGrouped } from "@/types/draft-pot";

export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const championshipId = searchParams.get("championshipId");

  if (!championshipId) {
    return NextResponse.json(
      { error: "championshipId obrigatório" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("draft_pots")
    .select(
      `
      pot_number,
      position,
      players ( id, name )
    `,
    )
    .eq("championship_id", championshipId)
    .order("pot_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data as DraftPotRow[];

  // 🔥 AGRUPAMENTO TIPADO
  const grouped: Record<string, DraftPotGrouped> = {};

  rows.forEach((item) => {
    const key = `${item.position}-${item.pot_number}`;

    if (!grouped[key]) {
      grouped[key] = {
        pot_number: item.pot_number,
        position: item.position,
        players: [],
      };
    }

    if (item.players && item.players.length > 0) {
      grouped[key].players.push(item.players[0]);
    }
  });

  return NextResponse.json({
    pots: Object.values(grouped),
  });
}
