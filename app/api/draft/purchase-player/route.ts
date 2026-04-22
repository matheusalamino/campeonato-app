import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PurchasePlayerBody = {
  championshipId: string;
  championshipManagerId: string;
  registrationId: string;
  potNumber: number;
  potPosition: string;
  purchasePrice: number;
  purchaseType: "open_auction" | "special_card" | "additional_round";
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PurchasePlayerBody;

  const {
    championshipId,
    championshipManagerId,
    registrationId,
    potNumber,
    potPosition,
    purchasePrice,
    purchaseType,
  } = body;

  if (
    !championshipId ||
    !championshipManagerId ||
    !registrationId ||
    !potNumber ||
    !potPosition ||
    purchasePrice == null ||
    !purchaseType
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from("draft_player_purchases").insert({
    championship_id: championshipId,
    championship_manager_id: championshipManagerId,
    registration_id: registrationId,
    pot_number: potNumber,
    pot_position: potPosition,
    purchase_price: purchasePrice,
    purchase_type: purchaseType,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
