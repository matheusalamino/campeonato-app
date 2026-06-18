"use client";

import { useState } from "react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import RankingsTab from "@/components/public/stats/RankingsTab";
import MobileStandingsTab from "@/components/mobile/tabs/MobileStandingsTab";
import MobilePlayersTab from "@/components/mobile/tabs/MobilePlayersTab";

type TabId = "rankings" | "standings" | "players";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "rankings", icon: "🏆", label: "Rankings" },
  { id: "standings", icon: "📊", label: "Class." },
  { id: "players", icon: "👤", label: "Jogadores" },
];

interface Props {
  championshipId: string;
  championship: { name: string; season: string | null } | null;
  rankings: PublicRankings;
  loading: boolean;
}

export default function MobileStatsPage({ championshipId, championship, rankings, loading }: Props) {
  const [tab, setTab] = useState<TabId>("rankings");

  return (
    <div>
      <div className="px-4 pt-6 pb-3 text-center">
        <p className="text-[9px] font-bold uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━&ensp;Estatísticas Oficiais&ensp;━ ✦ ━
        </p>
        <h1 className="gala-gold-text mt-1 font-serif text-xl font-extrabold">
          {championship?.name ?? "…"}
        </h1>
        <p className="mt-0.5 text-[10px] text-[var(--gala-ink-dim)]">
          {championship?.season ? `Temporada ${championship.season} · ` : ""}atualizado em tempo real
        </p>
      </div>

      <div className="px-4 pb-24">
        {loading && rankings.players.length === 0 && tab === "rankings" ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "rankings" ? (
          <div className="gala-panel rounded-xl p-4">
            <RankingsTab rankings={rankings} />
          </div>
        ) : tab === "standings" ? (
          <MobileStandingsTab championshipId={championshipId} />
        ) : (
          <MobilePlayersTab championshipId={championshipId} rankings={rankings} />
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex"
        style={{ background: "#0d0b17", borderTop: "1px solid var(--gala-line)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[7px] font-black uppercase tracking-[0.04em] transition-colors"
            style={{ color: tab === t.id ? "var(--gala-gold-1)" : "var(--gala-ink-dim)" }}
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
