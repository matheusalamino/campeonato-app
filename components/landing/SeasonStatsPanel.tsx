"use client";

import { useState } from "react";
import type { Champion } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import RankingsTab from "@/components/public/stats/RankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import PlayersTab from "@/components/public/stats/PlayersTab";
import BracketSection from "@/components/landing/BracketSection";
import PlayerAvatar from "@/components/landing/PlayerAvatar";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";

type TabId = "rankings" | "standings" | "discipline" | "players" | "bracket";

const TABS: { id: TabId; label: string }[] = [
  { id: "rankings", label: "🏆 Rankings" },
  { id: "standings", label: "📊 Classificação" },
  { id: "discipline", label: "🟨 Disciplina" },
  { id: "players", label: "👤 Jogadores" },
  { id: "bracket", label: "🗓️ Caminho ao Título" },
];

interface SeasonStatsPanelProps {
  championships: Champion[];
}

export default function SeasonStatsPanel({ championships }: SeasonStatsPanelProps) {
  const years = [
    ...new Set(
      championships.map((c) => c.season).filter((s): s is string => s !== null)
    ),
  ]
    .sort()
    .reverse();

  const [selectedYear, setSelectedYear] = useState<string | null>(years[0] ?? null);
  const [selectedId, setSelectedId] = useState<string>(championships[0]?.id ?? "");
  const [tab, setTab] = useState<TabId>("rankings");
  const { rankings, loading } = usePublicRankings(selectedId || null, 50);

  const filtered = selectedYear
    ? championships.filter((c) => c.season === selectedYear)
    : championships;

  const selected = championships.find((c) => c.id === selectedId);

  function handleYearChange(year: string | null) {
    setSelectedYear(year);
    const next = year ? championships.filter((c) => c.season === year) : championships;
    if (next.length > 0 && !next.find((c) => c.id === selectedId)) {
      setSelectedId(next[0].id);
    }
    setTab("rankings");
  }

  return (
    <div>
      {/* Year filter */}
      {years.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => handleYearChange(null)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all"
            style={
              selectedYear === null
                ? {
                    background: "rgba(212,160,23,0.12)",
                    border: "1px solid var(--gala-gold-2)",
                    color: "var(--gala-gold-2)",
                  }
                : {
                    background: "var(--gala-bg-1)",
                    border: "1px solid var(--gala-line)",
                    color: "var(--gala-ink-dim)",
                  }
            }
          >
            Todos
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => handleYearChange(y)}
              className="shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all"
              style={
                selectedYear === y
                  ? {
                      background: "rgba(212,160,23,0.12)",
                      border: "1px solid var(--gala-gold-2)",
                      color: "var(--gala-gold-2)",
                    }
                  : {
                      background: "var(--gala-bg-1)",
                      border: "1px solid var(--gala-line)",
                      color: "var(--gala-ink-dim)",
                    }
              }
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Season pills */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedId(c.id);
              setTab("rankings");
            }}
            className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-all"
            style={
              c.id === selectedId
                ? {
                    background: "rgba(212,160,23,0.12)",
                    border: "1px solid var(--gala-gold-2)",
                    color: "var(--gala-gold-2)",
                  }
                : {
                    background:
                      "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
                    border: "1px solid var(--gala-line)",
                    color: "var(--gala-ink-dim)",
                  }
            }
          >
            {c.season ?? c.name}
          </button>
        ))}
      </div>

      {/* Season name */}
      {selected && (
        <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          {selected.name}
          {selected.season ? ` · ${selected.season}` : ""}
          {selected.championName ? ` · Campeão: ${selected.championName}` : ""}
        </p>
      )}

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
                    background:
                      "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "rankings" ? (
          <RankingsTab rankings={rankings} />
        ) : tab === "standings" ? (
          <StandingsTab championshipId={selectedId} />
        ) : tab === "discipline" ? (
          <DisciplineTab rankings={rankings} />
        ) : tab === "players" ? (
          <PlayersTab championshipId={selectedId} rankings={rankings} />
        ) : (
          <CaminhoAoTitulo championshipId={selectedId} />
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
    .sort(
      (a, b) =>
        b.yellowCards + b.redCards * 2 - (a.yellowCards + a.redCards * 2)
    );

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
            <span className="flex-1 text-sm font-bold text-white">
              {p?.playerName ?? "Desconhecido"}
            </span>
            <span className="text-[10px] text-[var(--gala-ink-dim)]">{p?.teamName}</span>
            <span className="flex items-center gap-1 text-sm font-black">
              {s.yellowCards > 0 && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-black"
                  style={{ background: "#ca8a04", color: "#050507" }}
                >
                  {s.yellowCards} 🟨
                </span>
              )}
              {s.redCards > 0 && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-black"
                  style={{ background: "#dc2626", color: "white" }}
                >
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
