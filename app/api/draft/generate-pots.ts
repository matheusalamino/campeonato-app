import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  calculatePotCount,
  distributePlayers,
  calculateManagersLimit,
} from "@/lib/draft";
import { DraftPlayer, DraftPotInsert } from "@/types/draft";

type SupabaseRegistration = {
  player_id: string;
  final_overall: number | null;
  players:
    | {
        preferred_position: string;
      }[]
    | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();

  try {
    const { championshipId }: { championshipId: string } = await req.json();

    if (!championshipId) {
      return NextResponse.json(
        { error: "championshipId obrigatório" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("championship_registrations")
      .select(
        `
        player_id,
        final_overall,
        players ( preferred_position )
      `,
      )
      .eq("championship_id", championshipId);

    if (error) throw error;

    const players = data as SupabaseRegistration[];

    if (!players?.length) {
      throw new Error("Nenhum jogador encontrado");
    }

    // 🧹 limpar potes antigos
    await supabase
      .from("draft_pots")
      .delete()
      .eq("championship_id", championshipId);

    // 🧠 agrupar por posição
    const grouped: Record<string, DraftPlayer[]> = {};

    for (const p of players) {
      const position = p.players?.[0]?.preferred_position;

      if (!position) continue;

      if (!grouped[position]) grouped[position] = [];

      grouped[position].push({
        id: p.player_id,
        overall: p.final_overall ?? 0,
        position,
      });
    }

    let potOrder = 1;
    const inserts: DraftPotInsert[] = [];

    for (const position of Object.keys(grouped)) {
      const list = grouped[position];

      // 🧤 GOLEIRO
      if (position === "Goleiro") {
        for (const player of list) {
          inserts.push({
            championship_id: championshipId,
            player_id: player.id,
            position,
            pot_number: 1,
            pot_order: potOrder,
            max_managers: 0,
          });
        }

        potOrder++;
        continue;
      }

      const potCount = calculatePotCount(list.length);
      const pots = distributePlayers(list, potCount);

      pots.forEach((pot, index) => {
        const limit = calculateManagersLimit(pot.length);

        pot.forEach((player) => {
          inserts.push({
            championship_id: championshipId,
            player_id: player.id,
            position,
            pot_number: index + 1,
            pot_order: potOrder,
            max_managers: limit,
          });
        });

        potOrder++;
      });
    }

    const { error: insertError } = await supabase
      .from("draft_pots")
      .insert(inserts);

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erro interno",
      },
      { status: 500 },
    );
  }
}
