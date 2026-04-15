"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTeamManagerDraft } from "@/components/TeamManagerDraftContext";
import { FootballField } from "@/components/team-manager/FootballField";

const supabase = createClient();

type SquadPlayer = {
  id: string;
  name: string;
  position: string;
  overall: number | null;
  purchasePrice: number | null;
};

export default function SquadPage() {
  const router = useRouter();
  const ctx = useTeamManagerDraft();

  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!ctx.teamId) {
        setLoading(false);
        return;
      }

      const { data: ctRow } = await supabase
        .from("championship_teams")
        .select("id")
        .eq("championship_id", ctx.championshipId)
        .eq("team_id", ctx.teamId)
        .single();

      if (!ctRow) {
        setLoading(false);
        return;
      }

      const { data: teamPlayers } = await supabase
        .from("championship_team_players")
        .select(
          `id,
           registration_id,
           championship_registrations (
             id,
             final_overall,
             player_id,
             players ( id, name, preferred_position )
           )`,
        )
        .eq("championship_team_id", ctRow.id);

      const { data: purchases } = await supabase
        .from("draft_player_purchases")
        .select("registration_id, purchase_price")
        .eq("championship_manager_id", ctx.championshipManagerId);

      const purchaseMap = new Map<string, number>();
      for (const p of purchases ?? []) {
        purchaseMap.set(p.registration_id, p.purchase_price);
      }

      const mapped: SquadPlayer[] = (teamPlayers ?? [])
        .map((tp) => {
          const raw = tp.championship_registrations as unknown;
          const reg = (Array.isArray(raw) ? raw[0] : raw) as {
            id: string;
            final_overall: number | null;
            player_id: string;
            players:
              | { id: string; name: string; preferred_position: string }
              | { id: string; name: string; preferred_position: string }[]
              | null;
          } | null;

          if (!reg) return null;

          const player = Array.isArray(reg.players)
            ? reg.players[0]
            : reg.players;
          if (!player) return null;

          return {
            id: player.id,
            name: player.name,
            position: player.preferred_position,
            overall: reg.final_overall,
            purchasePrice: purchaseMap.get(reg.id) ?? null,
          };
        })
        .filter(Boolean) as SquadPlayer[];

      setPlayers(mapped);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [ctx.teamId, ctx.championshipId, ctx.championshipManagerId]);

  const positionCounts = players.reduce(
    (acc, p) => {
      const pos =
        p.position === "Goleiro"
          ? "GOL"
          : p.position === "Zagueiro"
            ? "ZAG"
            : p.position === "Meia"
              ? "MEI"
              : "ATA";
      acc[pos] = (acc[pos] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-14 z-30 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Meu Time</h1>
          <span className="ml-auto text-sm text-zinc-400 tabular-nums">
            {players.length}/10 jogadores
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full space-y-5">
        {loading ? (
          <p className="text-center text-zinc-500 py-12">Carregando...</p>
        ) : (
          <>
            <FootballField players={players} />

            {/* Position summary */}
            <div className="grid grid-cols-4 gap-2">
              {(["GOL", "ZAG", "MEI", "ATA"] as const).map((pos) => (
                <div
                  key={pos}
                  className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-center"
                >
                  <p className="text-xs text-zinc-400">{pos}</p>
                  <p className="text-lg font-bold tabular-nums">
                    {positionCounts[pos] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
