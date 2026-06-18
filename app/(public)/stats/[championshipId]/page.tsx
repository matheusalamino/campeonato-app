"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import RankingsTab from "@/components/public/stats/RankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import PlayersTab from "@/components/public/stats/PlayersTab";
import MobileStatsPage from "@/components/mobile/MobileStatsPage";

const supabase = createClient();

type TabId = "rankings" | "standings" | "players";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "rankings", label: "🏆 Rankings" },
  { id: "standings", label: "📊 Classificação" },
  { id: "players", label: "👤 Jogadores" },
];

export default function PublicStatsPage() {
  const params = useParams<{ championshipId: string }>();
  const championshipId = params.championshipId;
  const [tab, setTab] = useState<TabId>("rankings");
  const [championship, setChampionship] = useState<{ name: string; season: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("championships").select("name, season").eq("id", championshipId).maybeSingle();
      if (error) return; // falha de rede: não marca como inexistente
      if (!data) setNotFound(true);
      else setChampionship(data);
    })();
  }, [championshipId]);

  // topN alto: a aba Rankings mostra top 3 com "Ver todos" expandindo a lista completa
  const { rankings, loading } = usePublicRankings(championshipId, 50);

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="gala-gold-text text-center font-serif text-3xl">Campeonato não encontrado</p>
      </main>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <main className="mx-auto min-h-screen max-w-5xl px-4 pb-16">
          <header className="pt-8 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[4px] text-[var(--gala-gold-2)]">
              ━ ✦ ━&ensp;Estatísticas Oficiais&ensp;━ ✦ ━
            </p>
            <h1 className="gala-gold-text mt-1 font-serif text-2xl font-extrabold sm:text-3xl">
              {championship?.name ?? "…"}
            </h1>
            <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
              {championship?.season ? `Temporada ${championship.season} · ` : ""}atualizado em tempo real
            </p>
            <nav className="mt-5 flex gap-1 overflow-x-auto pb-1 justify-start sm:justify-center" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-t-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                    tab === t.id
                      ? "gala-panel border-b-transparent text-[var(--gala-gold-1)]"
                      : "text-[var(--gala-ink-dim)] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </header>

          <section
            className={`gala-panel rounded-b-xl rounded-tr-xl p-4 sm:p-5 ${tab !== "rankings" ? "rounded-tl-xl" : ""}`}
          >
            {loading && rankings.players.length === 0 && tab === "rankings" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl bg-[#171320]" />
                ))}
              </div>
            ) : tab === "rankings" ? (
              <RankingsTab rankings={rankings} />
            ) : tab === "standings" ? (
              <StandingsTab championshipId={championshipId} />
            ) : (
              <PlayersTab championshipId={championshipId} rankings={rankings} />
            )}
          </section>
        </main>
      </div>
      <div className="md:hidden">
        <MobileStatsPage
          championshipId={championshipId}
          championship={championship}
          rankings={rankings}
          loading={loading}
        />
      </div>
    </>
  );
}
