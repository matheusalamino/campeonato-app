"use client";

import { useState } from "react";
import type { Champion, AllTimeScorer, MostTitlesTeam } from "@/lib/landing/queries";
import AllTimePanel from "@/components/landing/AllTimePanel";
import ChampionshipTabs from "@/components/landing/ChampionshipTabs";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

interface StatisticsShellProps {
  championships: Champion[];
  topScorers: AllTimeScorer[];
  mostTitlesTeams: MostTitlesTeam[];
}

export default function StatisticsShell({
  championships,
  topScorers,
  mostTitlesTeams,
}: StatisticsShellProps) {
  // null = "Todos os Campeonatos"
  const [selectedId, setSelectedId] = useState<string | null>(
    championships[0]?.id ?? null
  );

  const selected = championships.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      {/* Global championship filter */}
      <div className="mb-8 flex flex-wrap gap-2">
        <FilterPill
          label="🏆 Histórico"
          active={selectedId === null}
          onClick={() => setSelectedId(null)}
        />
        {championships.map((c) => (
          <FilterPill
            key={c.id}
            label={c.season ? `${c.name} · ${c.season}` : c.name}
            active={selectedId === c.id}
            onClick={() => setSelectedId(c.id)}
          />
        ))}
      </div>

      {/* Content */}
      {selectedId === null || selected === null ? (
        <AllTimePanel
          topScorers={topScorers}
          mostTitlesTeams={mostTitlesTeams}
          hallOfChampions={championships}
        />
      ) : (
        <ChampionshipTabs championship={selected} />
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-all"
      style={
        active
          ? {
              background: "rgba(212,160,23,0.12)",
              border: "1px solid var(--gala-gold-2)",
              color: "var(--gala-gold-2)",
            }
          : {
              background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
              border: "1px solid var(--gala-line)",
              color: "var(--gala-ink-dim)",
            }
      }
    >
      {label}
    </button>
  );
}
