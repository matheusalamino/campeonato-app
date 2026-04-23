"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTeamManagerDraft } from "@/components/TeamManagerDraftContext";
import { PlayerSearchCard } from "@/components/team-manager/PlayerSearchCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const supabase = createClient();

type PlayerItem = {
  registrationId: string;
  name: string;
  position: string;
  overall: number | null;
  photoUrl: string | null;
  isPurchased: boolean;
  purchasePrice: number | null;
};

export default function SearchAndFavoritePlayersPage() {
  const router = useRouter();
  const ctx = useTeamManagerDraft();

  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("Todos");
  const playersRef = useRef<PlayerItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    let loadingTurnedOn = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      loadingTurnedOn = true;

      try {
        const [regRes, favRes, purRes] = await Promise.all([
          supabase
            .from("championship_registrations")
            .select(
              `id, final_overall, profile_photo_link, players!inner ( name, preferred_position )`,
            )
            .eq("championship_id", ctx.championshipId),
          supabase
            .from("draft_player_favorites")
            .select("registration_id")
            .eq("championship_manager_id", ctx.championshipManagerId),
          supabase
            .from("draft_player_purchases")
            .select("registration_id, purchase_price")
            .eq("championship_id", ctx.championshipId),
        ]);

        if (cancelled) return;

        const purchaseByReg = new Map<string, number>();
        for (const row of purRes.data ?? []) {
          purchaseByReg.set(
            row.registration_id as string,
            row.purchase_price as number,
          );
        }

        const mapped: PlayerItem[] = (regRes.data ?? []).map((r) => {
          const player = Array.isArray(r.players) ? r.players[0] : r.players;
          const rid = r.id as string;
          const price = purchaseByReg.get(rid);
          return {
            registrationId: rid,
            name: player?.name ?? "–",
            position: player?.preferred_position ?? "–",
            overall: r.final_overall,
            photoUrl: (r.profile_photo_link as string | null) ?? null,
            isPurchased: purchaseByReg.has(rid),
            purchasePrice: price ?? null,
          };
        });

        mapped.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

        if (cancelled) return;

        setPlayers(mapped);
        playersRef.current = mapped;
        setFavoriteIds(new Set((favRes.data ?? []).map((f) => f.registration_id)));
      } finally {
        if (loadingTurnedOn) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx.championshipId, ctx.championshipManagerId]);

  const toggleFavorite = useCallback(
    async (registrationId: string) => {
      const player = playersRef.current.find(
        (p) => p.registrationId === registrationId,
      );
      if (player?.isPurchased && !favoriteIds.has(registrationId)) {
        return;
      }

      const isFav = favoriteIds.has(registrationId);

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(registrationId);
        else next.add(registrationId);
        return next;
      });

      if (isFav) {
        await supabase
          .from("draft_player_favorites")
          .delete()
          .eq("championship_manager_id", ctx.championshipManagerId)
          .eq("registration_id", registrationId);
      } else {
        await supabase.from("draft_player_favorites").insert({
          championship_manager_id: ctx.championshipManagerId,
          registration_id: registrationId,
        });
      }
    },
    [favoriteIds, ctx.championshipManagerId],
  );

  const positions = useMemo(() => {
    const set = new Set(players.map((p) => p.position));
    return ["Todos", ...Array.from(set).sort()];
  }, [players]);

  const filtered = useMemo(() => {
    let list = players;

    if (positionFilter !== "Todos") {
      list = list.filter((p) => p.position === positionFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    return list;
  }, [players, positionFilter, search]);

  const favorites = useMemo(
    () => filtered.filter((p) => favoriteIds.has(p.registrationId)),
    [filtered, favoriteIds],
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
          <h1 className="text-lg font-semibold">Jogadores</h1>
        </div>
      </header>

      {/* Search + Filters */}
      <div className="sticky top-28 z-20 bg-zinc-950/90 backdrop-blur-sm px-4 py-3 border-b border-zinc-800 space-y-3">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar jogador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {positions.map((pos) => (
              <button
                key={pos}
                onClick={() => setPositionFilter(pos)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition ${
                  positionFilter === pos
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <p className="text-center text-zinc-500 py-12">Carregando...</p>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full bg-zinc-900 border border-zinc-800 mb-3">
              <TabsTrigger value="all" className="flex-1 text-xs">
                Todos ({filtered.length})
              </TabsTrigger>
              <TabsTrigger value="favorites" className="flex-1 text-xs">
                Favoritos ({favorites.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500 py-8">
                    Nenhum jogador encontrado.
                  </p>
                ) : (
                  filtered.map((p) => (
                    <PlayerSearchCard
                      key={p.registrationId}
                      name={p.name}
                      position={p.position}
                      overall={p.overall}
                      photoUrl={p.photoUrl}
                      isPurchased={p.isPurchased}
                      purchasePrice={p.purchasePrice}
                      isFavorite={favoriteIds.has(p.registrationId)}
                      onToggleFavorite={() => toggleFavorite(p.registrationId)}
                    />
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="favorites">
              <div className="space-y-2">
                {favorites.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500 py-8">
                    Nenhum favorito adicionado.
                  </p>
                ) : (
                  favorites.map((p) => (
                    <PlayerSearchCard
                      key={p.registrationId}
                      name={p.name}
                      position={p.position}
                      overall={p.overall}
                      photoUrl={p.photoUrl}
                      isPurchased={p.isPurchased}
                      purchasePrice={p.purchasePrice}
                      isFavorite
                      onToggleFavorite={() => toggleFavorite(p.registrationId)}
                    />
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
