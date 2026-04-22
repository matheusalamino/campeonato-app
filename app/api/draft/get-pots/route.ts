import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type DraftPot = {
  player_id: string;
  pot_number: number;
  position: string;
  max_managers: number;
};

type Player = {
  id: string;
  name: string;
};

type Registration = {
  player_id: string;
  final_overall: number | null;
  profile_photo_link: string | null;
};

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

  // 🔥 1. Buscar potes
  const { data: potsData, error: potsError } = await supabase
    .from("draft_pots")
    .select("player_id, pot_number, position, max_managers")
    .eq("championship_id", championshipId)
    .order("pot_order", { ascending: true });

  if (potsError) {
    return NextResponse.json({ error: potsError.message }, { status: 500 });
  }

  if (!potsData?.length) {
    return NextResponse.json({ pots: [] });
  }

  const pots = potsData as DraftPot[];

  const playerIds = pots.map((p) => p.player_id);

  // 🔥 2. Buscar players
  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, name")
    .in("id", playerIds);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const playersMap = new Map<string, Player>(playersData.map((p) => [p.id, p]));

  // 🔥 3. Buscar registrations (overall + foto)
  const { data: registrationsData, error: regError } = await supabase
    .from("championship_registrations")
    .select("player_id, final_overall, profile_photo_link")
    .eq("championship_id", championshipId)
    .in("player_id", playerIds);

  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  const registrationsMap = new Map<
    string,
    { overall: number; photo: string | null }
  >();

  (registrationsData as Registration[]).forEach((r) => {
    registrationsMap.set(r.player_id, {
      overall: r.final_overall ?? 0,
      photo: r.profile_photo_link ?? null,
    });
  });

  // 🔥 4. Agrupar
  const grouped: Record<
    string,
    {
      pot_number: number;
      position: string;
      max_managers: number;
      players: {
        id: string;
        name: string;
        overall: number;
        photo: string | null;
      }[];
      average_overall: number;
    }
  > = {};

  pots.forEach((item) => {
    const key = `${item.position}-${item.pot_number}`;

    if (!grouped[key]) {
      grouped[key] = {
        pot_number: item.pot_number,
        position: item.position,
        players: [],
        max_managers: item.max_managers,
        average_overall: 0,
      };
    }

    const player = playersMap.get(item.player_id);
    const reg = registrationsMap.get(item.player_id);

    if (player) {
      grouped[key].players.push({
        id: player.id,
        name: player.name,
        overall: reg?.overall ?? 0,
        photo: reg?.photo ?? null,
      });
    }
  });

  // 🔥 5. Calcular média
  Object.values(grouped).forEach((pot) => {
    const total = pot.players.reduce((sum, p) => sum + p.overall, 0);

    pot.average_overall =
      pot.players.length > 0 ? Math.round(total / pot.players.length) : 0;
  });

  return NextResponse.json({
    pots: Object.values(grouped),
  });
}
