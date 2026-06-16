"use client";

import { useState } from "react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import FilteredRankingsTab from "@/components/landing/FilteredRankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import BracketSection from "@/components/landing/BracketSection";
import PremiosTab from "@/components/landing/PremiosTab";
import DisciplineTab from "@/components/landing/DisciplineTab";

type TabId = "classificacao" | "artilheiros" | "disciplina" | "bracket" | "premios";

const TABS: { id: TabId; label: string }[] = [
  { id: "classificacao", label: "🗂️ Classificação" },
  { id: "artilheiros", label: "📊 Artilheiros" },
  { id: "disciplina", label: "🟨 Disciplina" },
  { id: "bracket", label: "🗓️ Bracket" },
  { id: "premios", label: "🏅 Prêmios" },
];

interface TournamentTabsProps {
  championshipId: string;
  rankings: PublicRankings;
  loading: boolean;
}

export default function TournamentTabs({ championshipId, rankings, loading }: TournamentTabsProps) {
  const [tab, setTab] = useState<TabId>("classificacao");

  return (
    <div className="flex flex-col">
      {/* Sticky tab bar */}
      <nav
        className="sticky z-30 flex overflow-x-auto px-6 md:px-10 border-b border-[var(--gala-line)]"
        style={{ background: "rgba(5,5,7,0.92)", backdropFilter: "blur(12px)", top: "53px" }}
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="shrink-0 px-5 py-4 text-[11px] font-black uppercase tracking-wide transition-colors"
            style={
              tab === t.id
                ? { color: "var(--gala-gold-1)", borderBottom: "2px solid var(--gala-gold-2)" }
                : { color: "var(--gala-ink-dim)", borderBottom: "2px solid transparent" }
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="px-6 py-8 md:px-10">
        {loading && rankings.players.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-[var(--gala-bg-1)]" />
            ))}
          </div>
        ) : tab === "classificacao" ? (
          <StandingsTab championshipId={championshipId} />
        ) : tab === "artilheiros" ? (
          <FilteredRankingsTab rankings={rankings} />
        ) : tab === "disciplina" ? (
          <DisciplineTab rankings={rankings} />
        ) : tab === "bracket" ? (
          <BracketSection championshipId={championshipId} />
        ) : (
          <PremiosTab rankings={rankings} />
        )}
      </div>
    </div>
  );
}
