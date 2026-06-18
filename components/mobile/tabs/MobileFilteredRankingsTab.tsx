"use client";

import { useState, useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { POSITION_LABELS } from "@/lib/public/types";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

type StatKey = "goals" | "assists" | "decisiveSaves" | "penaltySaves" | "fouls" | "matchesPlayed" | "minutesPlayed";
type SortKey = StatKey | "combined";

const STAT_OPTS: { key: StatKey; label: string }[] = [
  { key: "goals", label: "Gols" },
  { key: "assists", label: "Assistências" },
  { key: "decisiveSaves", label: "Defesas" },
  { key: "penaltySaves", label: "Def. Pênalti" },
  { key: "fouls", label: "Faltas" },
  { key: "matchesPlayed", label: "Jogos" },
  { key: "minutesPlayed", label: "Minutos" },
];

const POSITIONS = Object.entries(POSITION_LABELS).map(([k, v]) => ({ key: k, label: v }));

export default function MobileFilteredRankingsTab({ rankings }: { rankings: PublicRankings }) {
  const [position, setPosition] = useState<string | null>(null);
  const [selectedStats, setSelectedStats] = useState<StatKey[]>(["goals"]);
  const [sortKey, setSortKey] = useState<SortKey>("combined");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<string | null>(null);
  const [pendingStats, setPendingStats] = useState<StatKey[]>(["goals"]);

  function openSheet() {
    setPendingPosition(position);
    setPendingStats(selectedStats);
    setSheetOpen(true);
  }

  function applyFilters() {
    setPosition(pendingPosition);
    setSelectedStats(pendingStats.length === 0 ? ["goals"] : pendingStats);
    setSortKey("combined");
    setSheetOpen(false);
  }

  function togglePendingStat(key: StatKey) {
    setPendingStats((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next.length === 0 ? [key] : next;
      }
      return [...prev, key];
    });
  }

  const statsMap = useMemo(
    () => new Map(rankings.stats.map((s) => [s.registrationId, s])),
    [rankings.stats],
  );

  const rows = useMemo(() => {
    let entries = rankings.players.map((p) => {
      const s = statsMap.get(p.registrationId);
      const combined = s ? selectedStats.reduce((sum, k) => sum + (s[k] ?? 0), 0) : 0;
      return { player: p, stats: s, combined };
    });
    if (position) entries = entries.filter((e) => e.player.position === position);
    entries.sort((a, b) => {
      if (sortKey === "combined") return b.combined - a.combined;
      const sk = sortKey as StatKey;
      return (b.stats?.[sk] ?? 0) - (a.stats?.[sk] ?? 0);
    });
    return entries.filter((e) => position !== null || e.combined > 0).slice(0, 30);
  }, [rankings.players, statsMap, selectedStats, position, sortKey]);

  const activeFilterCount =
    (position ? 1 : 0) +
    (selectedStats.length > 1 || selectedStats[0] !== "goals" ? 1 : 0);

  const pendingFilterCount =
    (pendingPosition ? 1 : 0) +
    (pendingStats.length > 1 || pendingStats[0] !== "goals" ? 1 : 0);

  if (rankings.players.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum dado disponível.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">
          {rows.length} jogadores
        </p>
        <button
          type="button"
          onClick={openSheet}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all"
          style={{
            background: activeFilterCount > 0 ? "rgba(212,160,23,0.12)" : "var(--gala-bg-1)",
            border: activeFilterCount > 0 ? "1px solid var(--gala-gold-2)" : "1px solid var(--gala-line)",
            color: activeFilterCount > 0 ? "var(--gala-gold-2)" : "var(--gala-ink-dim)",
          }}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filtrar{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador com estes filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--gala-line)]">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}>
                <th className="w-6 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">Jogador</th>
                {selectedStats.length > 1 && (
                  <th
                    className="cursor-pointer px-3 py-2 text-center text-[10px] font-black uppercase tracking-[2px] transition-colors hover:text-[var(--gala-gold-2)]"
                    style={{ color: sortKey === "combined" ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
                    onClick={() => setSortKey("combined")}
                  >
                    Total
                  </th>
                )}
                {selectedStats.map((key) => {
                  const opt = STAT_OPTS.find((o) => o.key === key)!;
                  return (
                    <th
                      key={key}
                      className="cursor-pointer px-3 py-2 text-center text-[10px] font-black uppercase tracking-[2px] transition-colors hover:text-[var(--gala-gold-2)]"
                      style={{ color: sortKey === key ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
                      onClick={() => setSortKey(key)}
                    >
                      {opt.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, stats, combined }, i) => (
                <tr
                  key={player.registrationId}
                  className="border-b transition-colors hover:bg-[rgba(212,160,23,0.04)]"
                  style={{ borderColor: "var(--gala-line)" }}
                >
                  <td className="px-3 py-2.5 text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        photoUrl={player.photoUrl}
                        name={player.playerName}
                        sizeClass="h-7 w-7"
                        textSizeClass="text-[8px]"
                        isFirst={i === 0}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-white">{player.playerName}</p>
                        <p className="truncate text-[9px] text-[var(--gala-ink-dim)]">
                          {player.teamName}
                          {player.position && (
                            <span className="ml-1 opacity-60">· {POSITION_LABELS[player.position] ?? player.position}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  {selectedStats.length > 1 && (
                    <td className="px-3 py-2.5 text-center font-black tabular-nums text-[var(--gala-gold-1)]">
                      {combined}
                    </td>
                  )}
                  {selectedStats.map((key) => (
                    <td key={key} className="px-3 py-2.5 text-center font-bold tabular-nums text-[var(--gala-ink)]">
                      {stats?.[key] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="relative z-10 rounded-t-2xl border-t border-zinc-800 bg-zinc-900 p-5 pb-8">
            <div className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-700" />
            <div className="mt-2 mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Filtros</h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Posição</p>
                <div className="flex flex-wrap gap-2">
                  {[{ key: null, label: "Todas" }, ...POSITIONS].map(({ key, label }) => (
                    <button
                      key={key ?? "all"}
                      type="button"
                      onClick={() => setPendingPosition(key)}
                      className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-all"
                      style={
                        pendingPosition === key
                          ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                          : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Estatística</p>
                <div className="flex flex-wrap gap-2">
                  {STAT_OPTS.map(({ key, label }) => {
                    const active = pendingStats.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePendingStat(key)}
                        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-all"
                        style={
                          active
                            ? { background: "rgba(212,160,23,0.18)", border: "1px solid var(--gala-gold-3)", color: "var(--gala-gold-1)" }
                            : { background: "var(--gala-bg-1)", border: "1px dashed var(--gala-line)", color: "var(--gala-ink-dim)" }
                        }
                      >
                        {active ? "✓ " : ""}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setPendingPosition(null); setPendingStats(["goals"]); }}
                className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold uppercase tracking-wider text-zinc-400 transition-all hover:bg-zinc-800"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="flex-[2] rounded-xl bg-amber-600 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-amber-500"
              >
                Aplicar{pendingFilterCount > 0 ? ` (${pendingFilterCount})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
