"use client";

import { useState } from "react";
import type { Champion } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import FilteredRankingsTab from "@/components/landing/FilteredRankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import BracketSection from "@/components/landing/BracketSection";
import PremiosTab from "@/components/landing/PremiosTab";
import PlayerAvatar from "@/components/landing/PlayerAvatar";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";

type TabId = "rankings" | "standings" | "discipline" | "premios" | "bracket";

const TABS: { id: TabId; label: string }[] = [
  { id: "rankings", label: "📊 Rankings" },
  { id: "standings", label: "🗂️ Classificação" },
  { id: "discipline", label: "🟨 Disciplina" },
  { id: "premios", label: "🏅 Prêmios" },
  { id: "bracket", label: "🗓️ Caminho ao Título" },
];

interface ChampionshipTabsProps {
  championship: Champion;
}

export default function ChampionshipTabs({ championship }: ChampionshipTabsProps) {
  const [tab, setTab] = useState<TabId>("rankings");
  const { rankings, loading } = usePublicRankings(championship.id, 10);

  return (
    <div>
      {/* Championship header */}
      <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
        {championship.name}
        {championship.season ? ` · ${championship.season}` : ""}
        {championship.championName ? ` · Campeão: ${championship.championName}` : ""}
      </p>

      {/* Tabs */}
      <nav className="mb-0 flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              tab === t.id
                ? "border border-b-transparent text-[var(--gala-gold-1)]"
                : "text-[var(--gala-ink-dim)] hover:text-white"
            }`}
            style={
              tab === t.id
                ? {
                    background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
                    borderColor: "var(--gala-line)",
                  }
                : {}
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab panel */}
      <div
        className="rounded-b-xl rounded-tr-xl p-4 sm:p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        {loading && rankings.players.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "rankings" ? (
          <FilteredRankingsTab rankings={rankings} />
        ) : tab === "standings" ? (
          <StandingsTab championshipId={championship.id} />
        ) : tab === "discipline" ? (
          <DisciplineTab rankings={rankings} />
        ) : tab === "premios" ? (
          <PremiosTab rankings={rankings} />
        ) : (
          <CaminhoAoTitulo championshipId={championship.id} />
        )}
      </div>
    </div>
  );
}

function CaminhoAoTitulo({ championshipId }: { championshipId: string }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          Fase de Grupos
        </p>
        <StandingsTab championshipId={championshipId} />
      </div>
      <div>
        <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          Fase Eliminatória
        </p>
        <BracketSection championshipId={championshipId} />
      </div>
    </div>
  );
}

function DisciplineTab({ rankings }: { rankings: PublicRankings }) {
  const byCards = [...rankings.stats]
    .filter((s) => s.yellowCards > 0 || s.redCards > 0)
    .sort((a, b) => b.yellowCards + b.redCards * 2 - (a.yellowCards + a.redCards * 2));

  const playerMap = new Map(rankings.players.map((p) => [p.registrationId, p]));

  if (byCards.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
        Nenhum dado de disciplina ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {byCards.slice(0, 20).map((s) => {
        const p = playerMap.get(s.registrationId);
        return (
          <div
            key={s.registrationId}
            className="flex items-center gap-3 rounded-xl border border-[var(--gala-line)] bg-[#171320] px-4 py-3"
          >
            <PlayerAvatar
              photoUrl={p?.photoUrl ?? null}
              name={p?.playerName ?? "?"}
              sizeClass="h-7 w-7"
              textSizeClass="text-[9px]"
            />
            <span className="flex-1 text-sm font-bold text-white">{p?.playerName ?? "Desconhecido"}</span>
            <span className="text-[10px] text-[var(--gala-ink-dim)]">{p?.teamName}</span>
            <span className="flex items-center gap-1">
              {s.yellowCards > 0 && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: "#ca8a04", color: "#050507" }}>
                  {s.yellowCards} 🟨
                </span>
              )}
              {s.redCards > 0 && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: "#dc2626", color: "white" }}>
                  {s.redCards} 🟥
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
