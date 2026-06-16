"use client";

import { useState, useMemo } from "react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { POSITION_LABELS } from "@/lib/public/types";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

type StatKey = "goals" | "assists" | "decisiveSaves" | "penaltySaves" | "fouls" | "matchesPlayed";

const STAT_OPTS: { key: StatKey; label: string }[] = [
  { key: "goals", label: "Gols" },
  { key: "assists", label: "Assistências" },
  { key: "decisiveSaves", label: "Defesas" },
  { key: "penaltySaves", label: "Def. Pênalti" },
  { key: "fouls", label: "Faltas" },
  { key: "matchesPlayed", label: "Jogos" },
];

const POSITIONS = Object.entries(POSITION_LABELS).map(([k, v]) => ({ key: k, label: v }));

type SortKey = StatKey | "combined";

export default function FilteredRankingsTab({ rankings }: { rankings: PublicRankings }) {
  const [position, setPosition] = useState<string | null>(null);
  const [selectedStats, setSelectedStats] = useState<StatKey[]>(["goals"]);
  const [sortKey, setSortKey] = useState<SortKey>("combined");

  const playerMap = useMemo(
    () => new Map(rankings.players.map((p) => [p.registrationId, p])),
    [rankings.players]
  );

  const statsMap = useMemo(
    () => new Map(rankings.stats.map((s) => [s.registrationId, s])),
    [rankings.stats]
  );

  function toggleStat(key: StatKey) {
    setSelectedStats((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((k) => k !== key);
        return next.length === 0 ? [key] : next; // always keep at least one
      }
      return [...prev, key];
    });
    setSortKey("combined");
  }

  const cols = selectedStats.length === 1 ? selectedStats : selectedStats;

  const rows = useMemo(() => {
    let entries = rankings.players.map((p) => {
      const s = statsMap.get(p.registrationId);
      const combined = s
        ? selectedStats.reduce((sum, k) => sum + (s[k] ?? 0), 0)
        : 0;
      return { player: p, stats: s, combined };
    });

    if (position) entries = entries.filter((e) => e.player.position === position);

    entries.sort((a, b) => {
      if (sortKey === "combined") return b.combined - a.combined;
      const va = a.stats?.[sortKey] ?? 0;
      const vb = b.stats?.[sortKey] ?? 0;
      return vb - va;
    });

    // When position is filtered, show all players in that position (even zero-stat ones)
    // so that e.g. "Goleiro + Goals" still shows goalkeepers who haven't scored
    return entries
      .filter((e) => position !== null || e.combined > 0)
      .slice(0, 30);
  }, [rankings.players, statsMap, selectedStats, position, sortKey]);

  if (rankings.players.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum dado disponível.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Position filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setPosition(null)}
          className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-all"
          style={
            position === null
              ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
              : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
          }
        >
          Todas posições
        </button>
        {POSITIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPosition(position === key ? null : key)}
            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-all"
            style={
              position === key
                ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stat filter chips */}
      <div className="flex flex-wrap gap-2">
        {STAT_OPTS.map(({ key, label }) => {
          const active = selectedStats.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggleStat(key)}
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

      {/* Table */}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador com estes filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--gala-line)]">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)] w-6">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">Jogador</th>
                {cols.length > 1 && (
                  <th
                    className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-[2px] cursor-pointer transition-colors hover:text-[var(--gala-gold-2)]"
                    style={{ color: sortKey === "combined" ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
                    onClick={() => setSortKey("combined")}
                  >
                    Total
                  </th>
                )}
                {cols.map((key) => {
                  const opt = STAT_OPTS.find((o) => o.key === key)!;
                  return (
                    <th
                      key={key}
                      className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-[2px] cursor-pointer transition-colors hover:text-[var(--gala-gold-2)]"
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
                        <p className="truncate font-bold text-white text-[12px]">{player.playerName}</p>
                        <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">
                          {player.teamName}
                          {player.position && (
                            <span className="ml-1 opacity-60">· {POSITION_LABELS[player.position] ?? player.position}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  {cols.length > 1 && (
                    <td className="px-3 py-2.5 text-center font-black text-[var(--gala-gold-1)] tabular-nums">
                      {combined}
                    </td>
                  )}
                  {cols.map((key) => (
                    <td key={key} className="px-3 py-2.5 text-center font-bold tabular-nums" style={{ color: "var(--gala-ink)" }}>
                      {stats?.[key] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
