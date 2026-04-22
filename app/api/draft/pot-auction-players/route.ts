import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Skill maps ─────────────────────────────────────────────
// label = short abbreviation shown in card columns
// name  = full name shown in radar
const SKILL_MAP: Record<string, { label: string; name: string }> = {
  // Line players
  desarme: { label: "DES", name: "Desarme" },
  controle: { label: "CON", name: "Controle" },
  visao: { label: "VIS", name: "Visão" },
  finalizacao: { label: "FIN", name: "Finalização" },
  drible: { label: "DRI", name: "Drible" },
  velocidade: { label: "VEL", name: "Velocidade" },
  // Goalkeeper
  comunicacao: { label: "COM", name: "Comunicação" },
  jogoAereo: { label: "AER", name: "Jogo Aéreo" },
  posicionamento: { label: "POS", name: "Posicionamento" },
  agilidade: { label: "AGI", name: "Agilidade" },
  reflexo: { label: "REF", name: "Reflexo" },
  reposicao: { label: "REP", name: "Reposição" },
};

// ── Rating scale 1–5 → display value ──────────────────────
// 5 → 96, 4 → 90, 3 → 84, 2 → 78, 1 → 72
const RATING_TO_VALUE: Record<number, number> = {
  5: 96,
  4: 90,
  3: 84,
  2: 78,
  1: 72,
};

function ratingToValue(rating: number): number {
  const rounded = Math.round(rating);
  return RATING_TO_VALUE[rounded] ?? 78;
}

// ── Weighted average calculation ───────────────────────────
// All individual ratings are first converted to display scale,
// then averaged with organizer weight 70% / self weight 30%.
// The number of organizer evaluations is respected naturally
// (each organizer rating is its own data point → more organizers = more influence).
//
// Formula:
//   weightedSum   = sum(orgValues) * 0.7 + sum(selfValues) * 0.3
//   weightedCount = orgCount * 0.7 + selfCount * 0.3
//   result        = round(weightedSum / weightedCount)
function computeWeightedAvg(
  orgValues: number[],
  selfValues: number[],
): number | null {
  if (orgValues.length === 0 && selfValues.length === 0) return null;

  const orgSum = orgValues.reduce((s, v) => s + v, 0);
  const selfSum = selfValues.reduce((s, v) => s + v, 0);

  const wOrgSum = orgSum * 0.7;
  const wSelfSum = selfSum * 0.3;

  const wOrgCount = orgValues.length * 0.7;
  const wSelfCount = selfValues.length * 0.3;

  const totalWeight = wOrgCount + wSelfCount;
  if (totalWeight === 0) return null;

  return Math.round((wOrgSum + wSelfSum) / totalWeight);
}

// ── Response types ─────────────────────────────────────────
export type PlayerAttribute = {
  skill: string;
  label: string;
  name: string; // full name for radar
  value: number;
};

export type AuctionPlayer = {
  registration_id: string;
  player_id: string;
  name: string;
  official_name: string | null;
  photo_url: string | null;
  overall: number | null;
  position: string;
  attributes: PlayerAttribute[];
  already_purchased: boolean;
};

export type PotAuctionPlayersResponse = {
  players: AuctionPlayer[];
};

// ── Supabase row types (no any) ────────────────────────────
type EvalRow = { registration_id: string; skill: string; rating: number };
type PurchaseRow = { registration_id: string };
type RegRow = {
  id: string;
  player_id: string;
  final_overall: number | null;
  profile_photo_link: string | null;
};
type PlayerRow = {
  id: string;
  name: string;
  official_name: string | null;
  preferred_position: string | null;
};
type PotRow = { player_id: string; pot_order: number };
type CtRow = { id: string; team_id: string };

// ── Handler ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const championshipId = searchParams.get("championshipId");
  const potNumber = searchParams.get("potNumber");
  const potPosition = searchParams.get("potPosition");

  if (!championshipId || !potNumber || !potPosition) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = await createClient();

  // 1. Players in pot (ordered)
  const { data: potPlayers, error: potErr } = await supabase
    .from("draft_pots")
    .select("player_id, pot_order")
    .eq("championship_id", championshipId)
    .eq("pot_number", Number(potNumber))
    .eq("position", potPosition)
    .order("pot_order")
    .returns<PotRow[]>();

  if (potErr)
    return NextResponse.json({ error: potErr.message }, { status: 500 });
  if (!potPlayers || potPlayers.length === 0)
    return NextResponse.json({ players: [] });

  const playerIds = potPlayers.map((p) => p.player_id);

  // 2. Registrations
  const { data: registrations, error: regErr } = await supabase
    .from("championship_registrations")
    .select("id, player_id, final_overall, profile_photo_link")
    .eq("championship_id", championshipId)
    .in("player_id", playerIds)
    .returns<RegRow[]>();

  if (regErr)
    return NextResponse.json({ error: regErr.message }, { status: 500 });

  const regByPlayer = new Map<string, RegRow>();
  (registrations ?? []).forEach((r) => regByPlayer.set(r.player_id, r));
  const registrationIds = [...regByPlayer.values()].map((r) => r.id);

  // 3. Player base info
  const { data: players, error: playersErr } = await supabase
    .from("players")
    .select("id, name, official_name, preferred_position")
    .in("id", playerIds)
    .returns<PlayerRow[]>();

  if (playersErr)
    return NextResponse.json({ error: playersErr.message }, { status: 500 });

  const playerMap = new Map<string, PlayerRow>();
  (players ?? []).forEach((p) => playerMap.set(p.id, p));

  // 4. Evaluations
  const [orgResult, selfResult] = await Promise.all([
    registrationIds.length > 0
      ? supabase
          .from("organizer_evaluations")
          .select("registration_id, skill, rating")
          .in("registration_id", registrationIds)
          .returns<EvalRow[]>()
      : { data: [] as EvalRow[], error: null },
    registrationIds.length > 0
      ? supabase
          .from("self_evaluations")
          .select("registration_id, skill, rating")
          .in("registration_id", registrationIds)
          .returns<EvalRow[]>()
      : { data: [] as EvalRow[], error: null },
  ]);

  // Accumulate per registration per skill: { orgValues[], selfValues[] }
  type SkillData = { orgValues: number[]; selfValues: number[] };
  const skillDataMap = new Map<string, Map<string, SkillData>>();

  const getSkillData = (regId: string, skill: string): SkillData => {
    if (!skillDataMap.has(regId)) skillDataMap.set(regId, new Map());
    const inner = skillDataMap.get(regId)!;
    if (!inner.has(skill)) inner.set(skill, { orgValues: [], selfValues: [] });
    return inner.get(skill)!;
  };

  (orgResult.data ?? []).forEach((e) => {
    if (!SKILL_MAP[e.skill]) return; // ignore unknown skills
    getSkillData(e.registration_id, e.skill).orgValues.push(
      ratingToValue(e.rating),
    );
  });

  (selfResult.data ?? []).forEach((e) => {
    if (!SKILL_MAP[e.skill]) return;
    getSkillData(e.registration_id, e.skill).selfValues.push(
      ratingToValue(e.rating),
    );
  });

  // 5. Already purchased
  const { data: purchases } = await supabase
    .from("draft_player_purchases")
    .select("registration_id")
    .eq("championship_id", championshipId)
    .eq("pot_number", Number(potNumber))
    .eq("pot_position", potPosition)
    .returns<PurchaseRow[]>();

  const purchasedSet = new Set((purchases ?? []).map((p) => p.registration_id));

  // 6. Build response
  const result: AuctionPlayer[] = potPlayers.map((pp) => {
    const playerId = pp.player_id;
    const playerInfo = playerMap.get(playerId);
    const reg = regByPlayer.get(playerId);

    const attributes: PlayerAttribute[] = [];

    if (reg) {
      const regSkills = skillDataMap.get(reg.id);
      if (regSkills) {
        regSkills.forEach((data, skill) => {
          const mapping = SKILL_MAP[skill];
          if (!mapping) return;

          const value = computeWeightedAvg(data.orgValues, data.selfValues);
          if (value === null) return;

          attributes.push({
            skill,
            label: mapping.label,
            name: mapping.name,
            value,
          });
        });
      }
    }

    // Consistent order: sort by label
    attributes.sort((a, b) => a.label.localeCompare(b.label));

    return {
      registration_id: reg?.id ?? "",
      player_id: playerId,
      name: playerInfo?.name ?? "—",
      official_name: playerInfo?.official_name ?? null,
      photo_url: reg?.profile_photo_link ?? null,
      overall: reg?.final_overall ?? null,
      position: potPosition,
      attributes,
      already_purchased: reg ? purchasedSet.has(reg.id) : false,
    };
  });

  return NextResponse.json({
    players: result,
  } satisfies PotAuctionPlayersResponse);
}
