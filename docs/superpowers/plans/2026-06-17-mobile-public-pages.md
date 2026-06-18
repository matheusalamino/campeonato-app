# Mobile Public Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build purpose-built mobile layouts for `/copa-do-mundo`, `/champions-league`, `/historico`, `/stats/[id]`, and `/live/[id]` — desktop versions stay pixel-for-pixel unchanged.

**Architecture:** Each page file wraps its existing content in `hidden md:block` and adds a new `md:hidden` sibling with a dedicated mobile component. No user-agent detection, no new routes. Tailwind `md:` breakpoint (768px) controls which tree renders. New files live in `components/mobile/`.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, TypeScript, Lucide React, existing hooks (`usePublicRankings`, `useGroupStandings`, `useChampionshipMatches`)

---

## Task 1: MobileStandingsTab

**Files:**
- Create: `components/mobile/tabs/MobileStandingsTab.tsx`

Context: replicates `StandingsTab` data fetching but renders a compact table with only #, Time, P, J, SG visible by default. A toggle per group expands to show V, E, D, GP, GC inline. Used by both tournament pages and stats page.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import { useChampionshipMatches } from "@/features/hooks/useChampionshipMatches";
import TeamLogo from "@/components/landing/TeamLogo";

const supabase = createClient();

export default function MobileStandingsTab({ championshipId }: { championshipId: string }) {
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { groups: allPhases, loading: matchesLoading } = useChampionshipMatches(championshipId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("phases").select("id, type, order_number")
        .eq("championship_id", championshipId).order("order_number");
      if (cancelled) return;
      setGroupPhaseId(data?.find((p) => p.type === "group")?.id ?? null);
      setResolvedFor(championshipId);
    })();
    return () => { cancelled = true; };
  }, [championshipId]);

  const { standings, groupLabels, loading } = useGroupStandings(championshipId, groupPhaseId);
  const groups = Object.keys(standings).sort((a, b) =>
    (groupLabels[a] ?? a).localeCompare(groupLabels[b] ?? b, "pt-BR"),
  );

  if (resolvedFor !== championshipId || (loading && groups.length === 0)) {
    return <div className="h-44 animate-pulse rounded-xl bg-[#171320]" />;
  }
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Classificação ainda não disponível.</p>;
  }

  const groupPhases = allPhases.filter((p) => p.matches.some((m) => m.groupLabel !== null));
  const groupMatches = groupPhases.flatMap((p) => p.matches.filter((m) => m.groupLabel !== null));

  function toggleExpand(g: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const expanded = expandedGroups.has(g);
        return (
          <div key={g} className="overflow-hidden rounded-xl border border-[var(--gala-line)] bg-[#171320]">
            <p className="px-3 pt-2 pb-1 text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-1)]">
              {groupLabels[g] ?? `Grupo ${g}`}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[8px] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  <th className="w-5 pb-1 pl-3 text-left">#</th>
                  <th className="pb-1 text-left">Time</th>
                  <th className="w-8 pb-1 text-center">P</th>
                  <th className="w-7 pb-1 text-center">J</th>
                  {expanded && (
                    <>
                      <th className="w-7 pb-1 text-center">V</th>
                      <th className="w-7 pb-1 text-center">E</th>
                      <th className="w-7 pb-1 text-center">D</th>
                      <th className="w-8 pb-1 text-center">GP</th>
                      <th className="w-8 pb-1 text-center">GC</th>
                    </>
                  )}
                  <th className="w-9 pb-1 pr-3 text-center">SG</th>
                </tr>
              </thead>
              <tbody>
                {standings[g].map((t, i) => (
                  <tr
                    key={t.championshipTeamId}
                    className={`border-t border-[var(--gala-line)]/60 ${i < 2 ? "text-[var(--gala-gold-1)]" : "text-[var(--gala-ink)]"}`}
                  >
                    <td className={`py-2 pl-3 text-[9px] font-black ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>
                      {i + 1}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo logoUrl={t.logoUrl} name={t.name} size={16} />
                        <span className="max-w-[90px] truncate font-semibold">{t.name}</span>
                      </div>
                    </td>
                    <td className="py-2 text-center text-sm font-black text-[var(--gala-gold-2)]">{t.points}</td>
                    <td className="py-2 text-center">{t.played}</td>
                    {expanded && (
                      <>
                        <td className="py-2 text-center">{t.won}</td>
                        <td className="py-2 text-center">{t.drawn}</td>
                        <td className="py-2 text-center">{t.lost}</td>
                        <td className="py-2 text-center">{t.goalsFor}</td>
                        <td className="py-2 text-center">{t.goalsAgainst}</td>
                      </>
                    )}
                    <td className={`py-2 pr-3 text-center font-bold ${t.goalDifference > 0 ? "text-emerald-400" : t.goalDifference < 0 ? "text-red-400" : "text-[var(--gala-ink-dim)]"}`}>
                      {t.goalDifference > 0 ? `+${t.goalDifference}` : t.goalDifference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() => toggleExpand(g)}
              className="w-full border-t border-[var(--gala-line)]/60 py-2 text-center text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]"
            >
              {expanded ? "↑ Menos colunas" : "↕ Ver V · E · D · GP · GC"}
            </button>
          </div>
        );
      })}

      {!matchesLoading && groupMatches.length > 0 && (
        <div>
          <p className="mb-2 text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            Jogos da Fase de Grupos
          </p>
          <div className="flex flex-col gap-1.5">
            {groupMatches.map((match) => {
              const isFinished = match.status === "FINISHED";
              const isLive = match.status === "IN_PROGRESS";
              const hasScore = match.homeScore !== null && match.awayScore !== null;
              return (
                <div
                  key={match.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                  style={{
                    background: "var(--gala-bg-1)",
                    borderColor: isLive ? "rgba(239,68,68,0.4)" : "var(--gala-line)",
                  }}
                >
                  {match.groupLabel && (
                    <span className="w-9 shrink-0 text-[8px] font-black uppercase tracking-widest text-[var(--gala-gold-2)]">
                      {match.groupLabel}
                    </span>
                  )}
                  <div className="flex flex-1 min-w-0 items-center justify-end gap-1.5">
                    <span className="truncate text-xs font-bold text-white">{match.home.label}</span>
                    <TeamLogo logoUrl={match.home.logoUrl} name={match.home.label} size={18} />
                  </div>
                  <div
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-black tabular-nums"
                    style={{
                      background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
                      color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
                      minWidth: "44px",
                      textAlign: "center",
                    }}
                  >
                    {hasScore ? `${match.homeScore}×${match.awayScore}` : isLive ? "●" : "—"}
                  </div>
                  <div className="flex flex-1 min-w-0 items-center gap-1.5">
                    <TeamLogo logoUrl={match.away.logoUrl} name={match.away.label} size={18} />
                    <span className="truncate text-xs font-bold text-white">{match.away.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add components/mobile/tabs/MobileStandingsTab.tsx
git commit -m "feat: add MobileStandingsTab — compact table with expand for mobile"
```

---

## Task 2: MobileFilteredRankingsTab

**Files:**
- Create: `components/mobile/tabs/MobileFilteredRankingsTab.tsx`

Context: duplicates the filtering logic from `FilteredRankingsTab` but hides all filter chips behind a slide-up filter sheet. The table (with `overflow-x-auto`) is the same as desktop. Two-phase filter state: pending (inside the sheet) vs. applied (drives the table).

- [ ] **Step 1: Create the file**

```tsx
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
      return (b.stats?.[sortKey] ?? 0) - (a.stats?.[sortKey] ?? 0);
    });
    return entries.filter((e) => position !== null || e.combined > 0).slice(0, 30);
  }, [rankings.players, statsMap, selectedStats, position, sortKey]);

  const activeFilterCount =
    (position ? 1 : 0) +
    (selectedStats.length > 1 || selectedStats[0] !== "goals" ? 1 : 0);

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
                        <p className="truncate text-[9px] text-[var(--gala-ink-dim)]">{player.teamName}</p>
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
                onClick={() => { setPendingPosition(null); setPendingStats(["goals"]); }}
                className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold uppercase tracking-wider text-zinc-400 transition-all hover:bg-zinc-800"
              >
                Limpar
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] rounded-xl bg-amber-600 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-amber-500"
              >
                Aplicar{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/mobile/tabs/MobileFilteredRankingsTab.tsx
git commit -m "feat: add MobileFilteredRankingsTab — stats table with slide-up filter sheet"
```

---

## Task 3: MobilePlayersTab

**Files:**
- Create: `components/mobile/tabs/MobilePlayersTab.tsx`

Context: same data/logic as desktop `PlayersTab` but search bar is always visible, team + position filters open in a slide-up sheet. Player cards are 1-column and taller for easier touch targets. Player profile Dialog is identical to desktop.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PlayerRadar from "@/components/PlayerRadar";
import type { PublicPlayer, PublicPlayerStats } from "@/lib/public/types";
import { POSITION_LABELS } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { sumVotePoints } from "@/lib/public/match-stats";

const supabase = createClient();
type SkillRow = { registration_id: string; skill: string; rating: number };

const EMPTY_STATS: Omit<PublicPlayerStats, "registrationId"> = {
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
  decisiveSaves: 0, penaltySaves: 0, fouls: 0, matchesPlayed: 0, minutesPlayed: 0,
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function MobilePlayersTab({
  championshipId,
  rankings,
}: {
  championshipId: string;
  rankings: PublicRankings;
}) {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState("all");
  const [pendingPosition, setPendingPosition] = useState("all");
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [skillsData, setSkillsData] = useState<{ regId: string; rows: SkillRow[] } | null>(null);
  const [votePoints, setVotePoints] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("best_player_votes").select("registration_id, points")
        .eq("championship_id", championshipId);
      setVotePoints(sumVotePoints(data ?? []));
    })();
  }, [championshipId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("public_player_skills").select("registration_id, skill, rating")
        .eq("registration_id", selected.registrationId);
      if (!cancelled) setSkillsData({ regId: selected.registrationId, rows: (data ?? []) as SkillRow[] });
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const skills = selected && skillsData?.regId === selected.registrationId ? skillsData.rows : [];
  const statsById = useMemo(
    () => new Map(rankings.stats.map((s) => [s.registrationId, s])),
    [rankings.stats],
  );
  const teams = useMemo(
    () => [...new Set(rankings.players.map((p) => p.teamName).filter(Boolean))].sort() as string[],
    [rankings.players],
  );
  const positions = useMemo(
    () => [...new Set(rankings.players.map((p) => p.position).filter(Boolean))].sort() as string[],
    [rankings.players],
  );

  const filtered = useMemo(
    () =>
      rankings.players.filter((p) => {
        if (team !== "all" && p.teamName !== team) return false;
        if (position !== "all" && p.position !== position) return false;
        if (search.trim()) {
          const q = normalize(search);
          const hay = normalize(`${p.playerName} ${p.officialName ?? ""} ${p.teamName ?? ""}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [rankings.players, team, position, search],
  );

  const selStats = selected
    ? statsById.get(selected.registrationId) ?? { registrationId: selected.registrationId, ...EMPTY_STATS }
    : null;

  function openSheet() {
    setPendingTeam(team);
    setPendingPosition(position);
    setSheetOpen(true);
  }

  function applyFilters() {
    setTeam(pendingTeam);
    setPosition(pendingPosition);
    setSheetOpen(false);
  }

  const activeFilterCount = (team !== "all" ? 1 : 0) + (position !== "all" ? 1 : 0);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar jogador…"
          className="flex-1 rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-sm placeholder-[#665f73] outline-none focus:border-[var(--gala-gold-3)]"
        />
        <button
          onClick={openSheet}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all"
          style={{
            background: activeFilterCount > 0 ? "rgba(212,160,23,0.12)" : "var(--gala-bg-1)",
            border: activeFilterCount > 0 ? "1px solid var(--gala-gold-2)" : "1px solid var(--gala-line)",
            color: activeFilterCount > 0 ? "var(--gala-gold-2)" : "var(--gala-ink-dim)",
          }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeFilterCount > 0 ? activeFilterCount : ""}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((p) => {
          const s = statsById.get(p.registrationId);
          return (
            <button
              key={p.registrationId}
              onClick={() => setSelected(p)}
              className="gala-panel flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-[var(--gala-gold-3)]/60"
            >
              {p.photoUrl ? (
                <Image
                  src={p.photoUrl}
                  alt={p.playerName}
                  width={44}
                  height={44}
                  className="size-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2a2438] text-xs font-extrabold">
                  {p.playerName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.playerName}</span>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                  <span>{(p.position && (POSITION_LABELS[p.position] ?? p.position)) ?? "—"} ·</span>
                  <span className="truncate">{p.teamName ?? "—"}</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-[10px] text-[var(--gala-ink-dim)]">
                <b className="block text-base text-[var(--gala-gold-2)]">{s?.goals ?? 0}</b> gols
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador encontrado.</p>
        )}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="relative z-10 rounded-t-2xl border-t border-zinc-800 bg-zinc-900 p-5 pb-8">
            <div className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-zinc-700" />
            <div className="mt-2 mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Filtros</h3>
              <button onClick={() => setSheetOpen(false)} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Time</p>
                <div className="flex flex-wrap gap-2">
                  {[{ val: "all", label: "Todos" }, ...teams.map((t) => ({ val: t, label: t }))].map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => setPendingTeam(val)}
                      className="rounded-full px-3 py-1 text-[10px] font-bold transition-all"
                      style={
                        pendingTeam === val
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
                <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Posição</p>
                <div className="flex flex-wrap gap-2">
                  {[{ val: "all", label: "Todas" }, ...positions.map((pos) => ({ val: pos, label: POSITION_LABELS[pos] ?? pos }))].map(({ val, label }) => (
                    <button
                      key={val}
                      onClick={() => setPendingPosition(val)}
                      className="rounded-full px-3 py-1 text-[10px] font-bold transition-all"
                      style={
                        pendingPosition === val
                          ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                          : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setPendingTeam("all"); setPendingPosition("all"); }}
                className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold uppercase tracking-wider text-zinc-400 transition-all hover:bg-zinc-800"
              >
                Limpar
              </button>
              <button
                onClick={applyFilters}
                className="flex-[2] rounded-xl bg-amber-600 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-amber-500"
              >
                Aplicar{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md border-[var(--gala-line)] bg-[#0c0a10] text-white">
          {selected && selStats ? (
            <div>
              <div className="flex items-center gap-3">
                {selected.photoUrl ? (
                  <Image src={selected.photoUrl} alt={selected.playerName} width={56} height={56} className="size-14 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-base font-black text-[#0b0a12]">
                    {selected.playerName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-lg font-extrabold">{selected.playerName}</DialogTitle>
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                    <span>{(selected.position && (POSITION_LABELS[selected.position] ?? selected.position)) ?? "—"} ·</span>
                    <span>{selected.teamName ?? "—"}</span>
                  </p>
                </div>
                {selected.finalOverall !== null ? (
                  <div className="rounded-lg border border-[rgba(212,160,23,.4)] bg-[#171320] px-3 py-1.5 text-center">
                    <span className="gala-gold-text block font-serif text-xl font-extrabold">{selected.finalOverall}</span>
                    <span className="text-[8px] tracking-[2px] text-[var(--gala-ink-dim)]">OVERALL</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {([
                  ["Gols", selStats.goals], ["Assist.", selStats.assists],
                  ["Pts Craque", votePoints.get(selected.registrationId) ?? 0],
                  ["🟨 Amarelos", selStats.yellowCards], ["🟥 Vermelhos", selStats.redCards],
                  ["Faltas", selStats.fouls],
                  ["Defesas", selStats.decisiveSaves], ["Pên. Defend.", selStats.penaltySaves],
                  ["Jogos", selStats.matchesPlayed],
                ] as [string, number][]).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-[var(--gala-line)] bg-[#171320] px-1 py-2">
                    <span className="gala-gold-text block font-serif text-base font-extrabold">{value}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[var(--gala-ink-dim)]">{label}</span>
                  </div>
                ))}
              </div>
              {skills.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[var(--gala-line)] bg-[#171320] p-2">
                  <PlayerRadar data={skills.map((s) => ({ skill: s.skill, label: s.skill, value: s.rating * 20 }))} />
                  <p className="text-center text-[8px] uppercase tracking-[2px] text-[var(--gala-ink-dim)]">Radar de habilidades</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/mobile/tabs/MobilePlayersTab.tsx
git commit -m "feat: add MobilePlayersTab — player list with slide-up filter sheet"
```

---

## Task 4: MobileTournamentShell

**Files:**
- Create: `components/mobile/MobileTournamentShell.tsx`

Context: the mobile root for `/copa-do-mundo` and `/champions-league`. Receives the same props as `TournamentPageShell`. Renders edition chips, a champion strip (only when a specific edition is selected), tab content, and a fixed bottom nav with 5 tabs. The `LandingHeader` from the layout renders above this component and provides the sticky app header.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import type { Champion, PodiumEntry } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import TeamLogo from "@/components/landing/TeamLogo";
import BracketSection from "@/components/landing/BracketSection";
import DisciplineTab from "@/components/landing/DisciplineTab";
import PremiosTab from "@/components/landing/PremiosTab";
import MobileStandingsTab from "@/components/mobile/tabs/MobileStandingsTab";
import MobileFilteredRankingsTab from "@/components/mobile/tabs/MobileFilteredRankingsTab";

type TabId = "classificacao" | "bracket" | "estatisticas" | "disciplina" | "premios";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "classificacao", icon: "🗂️", label: "Class." },
  { id: "bracket", icon: "🗓️", label: "Bracket" },
  { id: "estatisticas", icon: "📊", label: "Stats" },
  { id: "disciplina", icon: "🟨", label: "Discipl." },
  { id: "premios", icon: "🏅", label: "Prêmios" },
];

interface Props {
  tournamentTitle: string;
  editions: Champion[];
  initialPodium: PodiumEntry[];
}

export default function MobileTournamentShell({ tournamentTitle: _tournamentTitle, editions, initialPodium }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(editions[0]?.id ?? null);
  const [tab, setTab] = useState<TabId>("classificacao");

  const isAllEditions = selectedId === null;
  const { rankings, loading } = usePublicRankings(selectedId, 5);

  const selectedEdition = editions.find((e) => e.id === selectedId) ?? null;
  const first = initialPodium.find((p) => p.place === 1);
  const second = initialPodium.find((p) => p.place === 2);
  const third = initialPodium.find((p) => p.place === 3);

  return (
    <div>
      {/* Edition chip row — sticky below LandingHeader (53px) */}
      <div
        className="sticky top-[53px] z-40 flex gap-2 overflow-x-auto px-4 py-3"
        style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}
      >
        <ChipButton label="Todos" active={selectedId === null} onClick={() => setSelectedId(null)} />
        {editions.map((e) => (
          <ChipButton
            key={e.id}
            label={e.season ?? e.name}
            active={selectedId === e.id}
            onClick={() => setSelectedId(e.id)}
          />
        ))}
      </div>

      {/* Champion strip */}
      {!isAllEditions && first && (
        <div
          className="px-4 py-3"
          style={{
            background: "linear-gradient(180deg, rgba(212,160,23,0.06), transparent)",
            borderBottom: "1px solid var(--gala-line)",
          }}
        >
          <p className="mb-1.5 text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            {selectedEdition?.name}{selectedEdition?.season ? ` · ${selectedEdition.season}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamLogo logoUrl={first.logoUrl} name={first.teamName} size={28} />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-[var(--gala-gold-2)]">🏆 Campeão</p>
                <p className="truncate text-sm font-black text-white">{first.teamName}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {second && (
                <div
                  className="rounded-lg px-2.5 py-1.5 text-center"
                  style={{ background: "var(--gala-panel)", border: "1px solid var(--gala-line)" }}
                >
                  <p className="text-[7px] font-black text-[var(--gala-ink-dim)]">🥈 2º</p>
                  <p className="max-w-[60px] truncate text-[10px] font-black text-[var(--gala-ink)]">{second.teamName}</p>
                </div>
              )}
              {third && (
                <div
                  className="rounded-lg px-2.5 py-1.5 text-center"
                  style={{ background: "var(--gala-panel)", border: "1px solid var(--gala-line)" }}
                >
                  <p className="text-[7px] font-black text-[var(--gala-ink-dim)]">🥉 3º</p>
                  <p className="max-w-[60px] truncate text-[10px] font-black text-[var(--gala-ink)]">{third.teamName}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab content — pb-24 clears the fixed bottom nav */}
      <div className="px-4 py-4 pb-24">
        {isAllEditions ? (
          <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
            Selecione uma edição acima para ver classificação, artilheiros, bracket e prêmios.
          </p>
        ) : loading && rankings.players.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "classificacao" && selectedId ? (
          <MobileStandingsTab championshipId={selectedId} />
        ) : tab === "bracket" && selectedId ? (
          <BracketSection championshipId={selectedId} />
        ) : tab === "estatisticas" ? (
          <MobileFilteredRankingsTab rankings={rankings} />
        ) : tab === "disciplina" ? (
          <DisciplineTab rankings={rankings} />
        ) : (
          <PremiosTab rankings={rankings} />
        )}
      </div>

      {/* Bottom navigation — fixed, only when an edition is selected */}
      {!isAllEditions && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex"
          style={{ background: "#0d0b17", borderTop: "1px solid var(--gala-line)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[7px] font-black uppercase tracking-[0.04em] transition-colors"
              style={{ color: tab === t.id ? "var(--gala-gold-1)" : "var(--gala-ink-dim)" }}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all"
      style={
        active
          ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
          : { background: "var(--gala-panel)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
      }
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/mobile/MobileTournamentShell.tsx
git commit -m "feat: add MobileTournamentShell — mobile layout for tournament pages"
```

---

## Task 5: Wire up copa-do-mundo and champions-league

**Files:**
- Modify: `app/(landing)/copa-do-mundo/page.tsx`
- Modify: `app/(landing)/champions-league/page.tsx`

- [ ] **Step 1: Update `app/(landing)/copa-do-mundo/page.tsx`**

Replace the entire file content with:

```tsx
import TournamentPageShell from "@/components/landing/TournamentPageShell";
import MobileTournamentShell from "@/components/mobile/MobileTournamentShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function CopaDomundoPage() {
  const editions = await getChampionshipsByType("copa_do_mundo");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <>
      <div className="hidden md:block">
        <TournamentPageShell
          tournamentTitle="Copa do Mundo Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
      <div className="md:hidden">
        <MobileTournamentShell
          tournamentTitle="Copa do Mundo Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update `app/(landing)/champions-league/page.tsx`**

Replace the entire file content with:

```tsx
import TournamentPageShell from "@/components/landing/TournamentPageShell";
import MobileTournamentShell from "@/components/mobile/MobileTournamentShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function ChampionsLeaguePage() {
  const editions = await getChampionshipsByType("champions_league");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <>
      <div className="hidden md:block">
        <TournamentPageShell
          tournamentTitle="Champions League Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
      <div className="md:hidden">
        <MobileTournamentShell
          tournamentTitle="Champions League Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test at 375px**

Open DevTools, set viewport to 375px. Navigate to `/copa-do-mundo`:
- Desktop (≥768px): shows exactly as before — `TournamentPageShell` with sidebar
- Mobile (<768px): shows edition chips at top, champion strip, 5-tab bottom nav
- Tapping each tab shows correct content
- Selecting a different edition updates the chip + champion strip

- [ ] **Step 5: Commit**

```bash
git add "app/(landing)/copa-do-mundo/page.tsx" "app/(landing)/champions-league/page.tsx"
git commit -m "feat: wire mobile tournament shell into copa-do-mundo and champions-league pages"
```

---

## Task 6: Wire up historico page

**Files:**
- Modify: `app/(landing)/historico/page.tsx`

Context: `/historico` has no tabs or editions — it's a flat historical stats page. The mobile version keeps the same `AllTimePanel` component but uses tighter padding and shows the stat numbers in a 2-column grid instead of a wide `flex-wrap` row.

- [ ] **Step 1: Update `app/(landing)/historico/page.tsx`**

Replace the entire file content with:

```tsx
import AllTimePanel from "@/components/landing/AllTimePanel";
import {
  getAllChampionships,
  getAggregateStats,
  getAllTimeTopScorers,
  getMostTitlesTeams,
} from "@/lib/landing/queries";

export default async function HistoricoPage() {
  const [championships, aggregateStats, topScorers, mostTitlesTeams] = await Promise.all([
    getAllChampionships(),
    getAggregateStats(),
    getAllTimeTopScorers(),
    getMostTitlesTeams(10),
  ]);

  const stats = [
    { value: aggregateStats.seasons, label: "Temporadas" },
    { value: aggregateStats.goals, label: "Gols Totais" },
    { value: aggregateStats.players, label: "Jogadores" },
    { value: aggregateStats.copaDomundoEditions, label: "Edições Copa" },
    { value: aggregateStats.championsLeagueEditions, label: "Edições Champions" },
  ];

  return (
    <>
      {/* Desktop — untouched */}
      <div className="hidden md:block">
        <main className="w-full px-8 py-12 md:px-14">
          <header className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
              ━ ✦ ━ Liga de Futebol Adventista de Sorocaba ━ ✦ ━
            </p>
            <h1
              className="mt-2 font-serif text-4xl font-extrabold sm:text-5xl"
              style={{
                background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Histórico LIFAS
            </h1>
            <p className="mt-1 text-sm text-[var(--gala-ink-dim)]">Todos os tempos · ambos os torneios</p>
          </header>
          <div className="mb-10 flex flex-wrap gap-8">
            {stats.map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <span
                  className="font-serif text-4xl font-extrabold tabular-nums"
                  style={{
                    background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {value}
                </span>
                <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-ink-dim)]">{label}</span>
              </div>
            ))}
          </div>
          <AllTimePanel topScorers={topScorers} mostTitlesTeams={mostTitlesTeams} hallOfChampions={championships} />
        </main>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <main className="w-full px-4 py-8">
          <header className="mb-6">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
              ━ ✦ ━ LIFAS ━ ✦ ━
            </p>
            <h1
              className="mt-1.5 font-serif text-2xl font-extrabold"
              style={{
                background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Histórico LIFAS
            </h1>
            <p className="mt-0.5 text-xs text-[var(--gala-ink-dim)]">Todos os tempos · ambos os torneios</p>
          </header>

          {/* Numbers — 2-column grid on mobile */}
          <div className="mb-8 grid grid-cols-2 gap-4">
            {stats.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col rounded-xl border border-[var(--gala-line)] p-3"
                style={{ background: "var(--gala-bg-1)" }}
              >
                <span
                  className="font-serif text-3xl font-extrabold tabular-nums"
                  style={{
                    background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {value}
                </span>
                <span className="mt-0.5 text-[8px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">{label}</span>
              </div>
            ))}
          </div>

          <AllTimePanel topScorers={topScorers} mostTitlesTeams={mostTitlesTeams} hallOfChampions={championships} />
        </main>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test at 375px**

Open `/historico` at 375px:
- Mobile: tighter padding, numbers in 2-column grid, AllTimePanel sections below
- Desktop (≥768px): identical to before

- [ ] **Step 4: Commit**

```bash
git add "app/(landing)/historico/page.tsx"
git commit -m "feat: add mobile layout for historico page — 2-col stats grid, tighter padding"
```

---

## Task 7: MobileStatsPage

**Files:**
- Create: `components/mobile/MobileStatsPage.tsx`

Context: mobile root for `/stats/[id]`. Receives championship info, rankings, and loading state from the parent page. Three-tab bottom nav: Rankings, Classificação, Jogadores. No champion strip (edition is fixed by URL).

- [ ] **Step 1: Create the file**

```tsx
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
        {loading && rankings.players.length === 0 ? (
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
        style={{ background: "#0d0b17", borderTop: "1px solid var(--gala-line)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/mobile/MobileStatsPage.tsx
git commit -m "feat: add MobileStatsPage — 3-tab bottom nav for public stats on mobile"
```

---

## Task 8: Wire up stats page

**Files:**
- Modify: `app/(public)/stats/[championshipId]/page.tsx`

Context: this is a `"use client"` component that already manages its own state and calls `usePublicRankings`. Wrap the existing `return (` to add the hidden md:block desktop div and the mobile sibling. The desktop code is kept exactly as-is — do not reconstruct it.

- [ ] **Step 1: Add the import**

Read `app/(public)/stats/[championshipId]/page.tsx`. After the last existing import line, add:

```tsx
import MobileStatsPage from "@/components/mobile/MobileStatsPage";
```

- [ ] **Step 2: Wrap the main return statement**

The file has an early `notFound` return (keep it untouched). The main `return (` renders the full page content. Wrap it as follows — keeping every line of the existing JSX exactly as-is inside `<div className="hidden md:block">`:

Find the main `return (` line (the one that begins with `<main` or similar at the top level). Make these two edits using the Edit tool:

**Edit A** — find the opening of the return and add the wrapper opening:
```
return (
```
→
```
return (
  <>
    <div className="hidden md:block">
```

**Edit B** — find the closing of the return statement (the last `)` before the function close, after the last `</main>`) and add the mobile sibling before it:
```
  </main>
);
```
→
```
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
```

After both edits the return structure is:
```
return (
  <>
    <div className="hidden md:block">
      [entire existing desktop JSX — untouched]
    </div>
    <div className="md:hidden">
      <MobileStatsPage ... />
    </div>
  </>
);
```

Note: the variables `championship`, `rankings`, `loading`, and `championshipId` are already in scope from the existing component state — no new declarations needed.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test at 375px**

Open `/stats/[any-championship-id]` at 375px:
- Mobile: shows header, then Rankings tab content. Bottom nav tabs work. Classificação shows compact table with expand button. Jogadores shows search + filter button.
- Desktop (≥768px): unchanged from before.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test at 375px**

Open `/stats/[any-championship-id]` at 375px:
- Mobile: shows header, then Rankings tab content. Bottom nav tabs work. Classificação shows compact table with expand button. Jogadores shows search + filter button.
- Desktop (≥768px): unchanged from before.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/stats/[championshipId]/page.tsx"
git commit -m "feat: wire MobileStatsPage into public stats page"
```

---

## Task 9: LiveMatchCard — replace vw units with responsive values

**Files:**
- Modify: `components/public/LiveMatchCard.tsx`

Context: this component uses `vw` units throughout, sized for a 1080p TV. On a 375px mobile screen, `1.6vw` = 6px (unreadable). Replace each `vw` value with a mobile-first px/rem value and restore the `vw` value at the `md:` breakpoint.

- [ ] **Step 1: Replace `Crest` component sizing**

Find in `LiveMatchCard.tsx`:

```tsx
function Crest({ team }: { team: LiveTeam }) {
  return team.logoUrl ? (
    <Image src={team.logoUrl} alt={team.name} width={88} height={88} className="size-[6.8vw] max-w-[88px] rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/70" />
  ) : (
    <div className="flex size-[6.8vw] max-h-[88px] max-w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-[#1a1524] to-[#0d0a13] text-[2.2vw] font-black ring-2 ring-[var(--gala-gold-3)]/70">
      {team.name.slice(0, 2).toUpperCase()}
    </div>
  );
}
```

Replace with:

```tsx
function Crest({ team }: { team: LiveTeam }) {
  return team.logoUrl ? (
    <Image src={team.logoUrl} alt={team.name} width={88} height={88} className="size-16 md:size-[6.8vw] md:max-w-[88px] rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/70" />
  ) : (
    <div className="flex size-16 md:size-[6.8vw] md:max-h-[88px] md:max-w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-[#1a1524] to-[#0d0a13] text-lg md:text-[2.2vw] font-black ring-2 ring-[var(--gala-gold-3)]/70">
      {team.name.slice(0, 2).toUpperCase()}
    </div>
  );
}
```

- [ ] **Step 2: Replace `TeamColumn` width and text sizing**

Find:

```tsx
function TeamColumn({ team, events, side }: { team: LiveTeam; events: LiveEvent[]; side: "home" | "away" }) {
  const teamEvents = events.filter(
    (e) => e.teamId === team.championshipTeamId && ["GOAL", "OWN_GOAL", "YELLOW_CARD", "RED_CARD"].includes(e.eventType),
  );
  return (
    <div className="flex w-[26vw] flex-col items-center gap-2">
      <Crest team={team} />
      <span className="text-[1.6vw] font-extrabold tracking-[2px]">{team.name.toUpperCase()}</span>
      <span
        className="h-1 w-3/5 rounded"
        style={{ background: team.uniformColor ?? "var(--gala-gold-3)", boxShadow: `0 0 14px ${team.uniformColor ?? "var(--gala-gold-glow)"}` }}
      />
      <div className="mt-1 flex flex-col gap-1 text-center text-[1vw] text-[var(--gala-ink-dim)]" data-side={side}>
```

Replace with:

```tsx
function TeamColumn({ team, events, side }: { team: LiveTeam; events: LiveEvent[]; side: "home" | "away" }) {
  const teamEvents = events.filter(
    (e) => e.teamId === team.championshipTeamId && ["GOAL", "OWN_GOAL", "YELLOW_CARD", "RED_CARD"].includes(e.eventType),
  );
  return (
    <div className="flex flex-1 min-w-0 md:w-[26vw] md:flex-none flex-col items-center gap-2">
      <Crest team={team} />
      <span className="text-sm md:text-[1.6vw] font-extrabold tracking-[2px] text-center truncate w-full">{team.name.toUpperCase()}</span>
      <span
        className="h-1 w-3/5 rounded"
        style={{ background: team.uniformColor ?? "var(--gala-gold-3)", boxShadow: `0 0 14px ${team.uniformColor ?? "var(--gala-gold-glow)"}` }}
      />
      <div className="mt-1 flex flex-col gap-1 text-center text-[10px] md:text-[1vw] text-[var(--gala-ink-dim)]" data-side={side}>
```

- [ ] **Step 3: Replace `ScorePanel` sizing**

Find:

```tsx
function ScorePanel({ home, away }: { home: number; away: number }) {
  return (
    <div className="gala-panel relative mt-[1.2vh] self-start rounded-2xl px-[2.6vw] py-[1.3vw] shadow-[0_14px_44px_rgba(0,0,0,.6)] before:absolute before:inset-x-[12%] before:-top-px before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-[var(--gala-gold-3)] before:to-transparent">
      <div className="flex items-center gap-[1.6vw] font-serif text-[7vw] font-extrabold leading-none">
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{home}</span>
        <span className="text-[2.4vw] font-light text-[var(--gala-gold-3)] [text-shadow:0_0_14px_var(--gala-gold-glow)]">×</span>
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{away}</span>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
function ScorePanel({ home, away }: { home: number; away: number }) {
  return (
    <div className="gala-panel relative mt-2 self-start rounded-2xl px-4 py-2 md:mt-[1.2vh] md:px-[2.6vw] md:py-[1.3vw] shadow-[0_14px_44px_rgba(0,0,0,.6)] before:absolute before:inset-x-[12%] before:-top-px before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-[var(--gala-gold-3)] before:to-transparent">
      <div className="flex items-center gap-3 md:gap-[1.6vw] font-serif text-5xl md:text-[7vw] font-extrabold leading-none">
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{home}</span>
        <span className="text-2xl md:text-[2.4vw] font-light text-[var(--gala-gold-3)] [text-shadow:0_0_14px_var(--gala-gold-glow)]">×</span>
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{away}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `Eyebrow` text sizing**

Find:

```tsx
function Eyebrow({ championshipName, phase }: { championshipName: string; phase: string | null }) {
  return (
    <>
      <div className="flex items-center gap-4 text-[1.2vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-24 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-24 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      {phase ? (
        <div className="-mt-1 text-[1vw] uppercase tracking-[5px] text-[var(--gala-ink-dim)]">
          <b className="font-bold text-[var(--gala-gold-1)]">{phase}</b>
        </div>
      ) : null}
    </>
  );
}
```

Replace with:

```tsx
function Eyebrow({ championshipName, phase }: { championshipName: string; phase: string | null }) {
  return (
    <>
      <div className="flex items-center gap-3 md:gap-4 text-xs md:text-[1.2vw] font-bold uppercase tracking-[4px] md:tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      {phase ? (
        <div className="-mt-1 text-[10px] md:text-[1vw] uppercase tracking-[3px] md:tracking-[5px] text-[var(--gala-ink-dim)]">
          <b className="font-bold text-[var(--gala-gold-1)]">{phase}</b>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Replace live badge and period pill text sizing**

Find (inside the `if (current)` branch):

```tsx
<div className="flex items-center gap-2 rounded-full border border-red-500/45 bg-red-500/10 px-4 py-1 text-[0.9vw] font-extrabold tracking-[2.5px] text-red-300">
```

Replace with:

```tsx
<div className="flex items-center gap-2 rounded-full border border-red-500/45 bg-red-500/10 px-4 py-1 text-[10px] md:text-[0.9vw] font-extrabold tracking-[2.5px] text-red-300">
```

Find:

```tsx
<div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-[var(--gala-line)] bg-[#13101a] px-6 py-1.5 text-[1.1vw] font-bold tracking-wider text-[var(--gala-gold-1)] after:absolute after:left-[-60%] after:top-0 after:h-full after:w-2/5 after:animate-[gala-shine_3.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,246,204,.14)] after:to-transparent">
```

Replace with:

```tsx
<div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-[var(--gala-line)] bg-[#13101a] px-6 py-1.5 text-sm md:text-[1.1vw] font-bold tracking-wider text-[var(--gala-gold-1)] after:absolute after:left-[-60%] after:top-0 after:h-full after:w-2/5 after:animate-[gala-shine_3.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,246,204,.14)] after:to-transparent">
```

Find (penalties display):

```tsx
<div className="text-[1.4vw] font-bold text-[var(--gala-gold-2)]">
```

Replace with:

```tsx
<div className="text-sm md:text-[1.4vw] font-bold text-[var(--gala-gold-2)]">
```

Find (last result / next game text in the `return` without current):

```tsx
<span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Último resultado</span>
```

Replace with:

```tsx
<span className="text-[10px] md:text-[1vw] uppercase tracking-[3px] md:tracking-[4px] text-[var(--gala-ink-dim)]">Último resultado</span>
```

Find:

```tsx
<span className="text-[1.6vw] font-extrabold">{last.home.name.toUpperCase()}</span>
```
(appears twice — for `last.home` and `last.away`)

Replace both with:

```tsx
<span className="text-sm md:text-[1.6vw] font-extrabold">{last.home.name.toUpperCase()}</span>
```
and:
```tsx
<span className="text-sm md:text-[1.6vw] font-extrabold">{last.away.name.toUpperCase()}</span>
```

Find the penalty winner span:

```tsx
<span className="flex items-center gap-[0.6vw] rounded-full border border-[var(--gala-gold-3)]/40 bg-[var(--gala-gold-3)]/10 px-[1.2vw] py-[0.4vh] text-[1.1vw] font-bold text-[var(--gala-gold-1)]">
```

Replace with:

```tsx
<span className="flex items-center gap-2 rounded-full border border-[var(--gala-gold-3)]/40 bg-[var(--gala-gold-3)]/10 px-3 py-1 text-xs md:text-[1.1vw] font-bold text-[var(--gala-gold-1)]">
```

Find (next game section):

```tsx
<span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Próximo jogo</span>
```

Replace with:

```tsx
<span className="text-[10px] md:text-[1vw] uppercase tracking-[3px] md:tracking-[4px] text-[var(--gala-ink-dim)]">Próximo jogo</span>
```

Find (the two `text-[1.6vw]` name spans in the next game section):

```tsx
<span className="text-[1.6vw] font-extrabold">{next.home.name.toUpperCase()}</span>
```
and:
```tsx
<span className="text-[1.6vw] font-extrabold">{next.away.name.toUpperCase()}</span>
```

Replace both with `text-sm md:text-[1.6vw]`.

Find the `vs` separator:

```tsx
<span className="text-[1.2vw] font-light text-[var(--gala-gold-3)]">vs</span>
```

Replace with:

```tsx
<span className="text-sm md:text-[1.2vw] font-light text-[var(--gala-gold-3)]">vs</span>
```

Find the scheduled time:

```tsx
<span className="text-[1.1vw] text-[var(--gala-gold-2)]">
```

Replace with:

```tsx
<span className="text-xs md:text-[1.1vw] text-[var(--gala-gold-2)]">
```

Find the "no game" message:

```tsx
<p className="text-[1.4vw] text-[var(--gala-ink-dim)]">Nenhum jogo programado.</p>
```

Replace with:

```tsx
<p className="text-sm md:text-[1.4vw] text-[var(--gala-ink-dim)]">Nenhum jogo programado.</p>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual test**

Open `/live/[championship-id]` at 375px. Verify:
- Score digits are visible (≥40px)
- Team names are readable
- Events list is legible
- At desktop width (1080px/≥768px): everything looks identical to before

- [ ] **Step 8: Commit**

```bash
git add components/public/LiveMatchCard.tsx
git commit -m "fix: replace vw units in LiveMatchCard with responsive px values for mobile"
```

---

## Task 10: LiveCarousel — add touch swipe support

**Files:**
- Modify: `components/public/LiveCarousel.tsx`

Context: currently navigates via keyboard arrows. Mobile users need touch swipe. Record `touchStartX` on `touchstart`, compare on `touchend`: delta > 50px advances or retreats. Auto-advance timer is unchanged — it already resets on `index` change.

- [ ] **Step 1: Add touch state ref and handlers to `LiveCarousel`**

At the top of the `LiveCarousel` function body, after the existing refs, add:

```tsx
const touchStartX = useRef<number | null>(null);
```

After the `useEffect` for keyboard navigation, add:

```tsx
const handleTouchStart = useCallback((e: React.TouchEvent) => {
  touchStartX.current = e.touches[0].clientX;
}, []);

const handleTouchEnd = useCallback(
  (e: React.TouchEvent) => {
    if (touchStartX.current === null || celebration) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta < -50) setIndex((cur) => nextIndex(cards, cur));
    else if (delta > 50) setIndex((cur) => prevIndex(cards, cur));
  },
  [cards, celebration],
);
```

- [ ] **Step 2: Attach handlers to the root div**

Find:

```tsx
return (
  <div className="relative h-screen w-screen overflow-hidden">
```

Replace with:

```tsx
return (
  <div
    className="relative h-screen w-screen overflow-hidden"
    onTouchStart={handleTouchStart}
    onTouchEnd={handleTouchEnd}
  >
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test on mobile**

Open `/live/[championship-id]` on a real mobile device or Chrome DevTools device mode. Swipe left → next card. Swipe right → previous card. Auto-advance continues as normal when not swiping.

- [ ] **Step 5: Commit**

```bash
git add components/public/LiveCarousel.tsx
git commit -m "feat: add touch swipe navigation to LiveCarousel for mobile"
```
