"use client";

import { useState, useMemo } from "react";
import {
  Shield,
  Clock,
  ChevronRight,
  Activity,
  Calendar,
} from "lucide-react";
import { useMatchList, type MatchListItem } from "@/features/hooks/useMatchList";
import { useChampionship } from "@/components/ChampionshipContext";
import { cn } from "@/lib/utils";

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, period }: { status: string; period: string }) {
  if (status === "COMPLETED") {
    return <span className="text-[10px] font-black text-zinc-500 uppercase">Fim</span>;
  }
  if (status === "IN_PROGRESS") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-[10px] font-black text-emerald-500 uppercase">Ao Vivo</span>
      </div>
    );
  }
  return null;
}

// ─── Match Row ────────────────────────────────────────────────────────────────
function MatchRow({ match }: { match: MatchListItem }) {
  const isInProgress = match.status === "IN_PROGRESS";
  const isCompleted = match.status === "COMPLETED";
  const showScore = isInProgress || isCompleted;

  const timeLabel = match.scheduledAt
    ? new Date(match.scheduledAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  return (
    <div className="group flex items-center gap-4 py-3 px-4 hover:bg-white/[0.02] transition-colors border-b border-zinc-900/50 last:border-0">
      {/* Time / Status */}
      <div className="w-16 flex flex-col items-center justify-center border-r border-zinc-800 pr-4">
        <span className={cn(
          "text-xs font-bold tabular-nums",
          isInProgress ? "text-emerald-500" : "text-zinc-400"
        )}>
          {timeLabel}
        </span>
        <StatusBadge status={match.status} period={match.currentPeriod} />
      </div>

      {/* Teams & Score */}
      <div className="flex-1 flex items-center justify-between gap-6">
        {/* Home */}
        <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
          <span className={cn(
            "text-sm font-bold truncate uppercase tracking-wide transition-colors",
            match.home.type !== "team" ? "text-zinc-600" : "text-zinc-200 group-hover:text-white"
          )}>
            {match.home.label}
          </span>
          <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
            {match.home.logoUrl ? <img src={match.home.logoUrl} className="h-full w-full object-cover" /> : <Shield className="h-4 w-4 text-zinc-600" />}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="w-20 flex items-center justify-center bg-zinc-900/80 py-1.5 rounded-lg border border-zinc-800">
          {showScore ? (
            <div className="flex items-center gap-2 tabular-nums">
              <span className={cn("text-lg font-black", isInProgress ? "text-white" : "text-zinc-400")}>{match.homeScore}</span>
              <span className="text-xs text-zinc-700">x</span>
              <span className={cn("text-lg font-black", isInProgress ? "text-white" : "text-zinc-400")}>{match.awayScore}</span>
            </div>
          ) : (
            <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">vs</span>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
            {match.away.logoUrl ? <img src={match.away.logoUrl} className="h-full w-full object-cover" /> : <Shield className="h-4 w-4 text-zinc-600" />}
          </div>
          <span className={cn(
            "text-sm font-bold truncate uppercase tracking-wide transition-colors",
            match.away.type !== "team" ? "text-zinc-600" : "text-zinc-200 group-hover:text-white"
          )}>
            {match.away.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GamesPage() {
  const { championship } = useChampionship();
  const { items, loading } = useMatchList();
  const [activeTab, setActiveTab] = useState<"all" | "live">("all");

  const groupedByRound = useMemo(() => {
    const filtered = items.filter(m => activeTab === "all" || m.status === "IN_PROGRESS");
    const rounds: Record<string, MatchListItem[]> = {};
    
    filtered.forEach(m => {
      const key = `${m.phaseName}|${m.roundNumber || 1}`;
      if (!rounds[key]) rounds[key] = [];
      rounds[key].push(m);
    });

    return Object.entries(rounds)
      .map(([key, matches]) => {
        const [phaseName, round] = key.split("|");
        return { phaseName, round: parseInt(round), matches };
      })
      .sort((a, b) => {
        // Sort by phase order if available, or name
        const phaseA = items.find(m => m.phaseName === a.phaseName)?.phaseOrder ?? 0;
        const phaseB = items.find(m => m.phaseName === b.phaseName)?.phaseOrder ?? 0;
        return phaseA - phaseB || a.round - b.round;
      });
  }, [items, activeTab]);

  if (!championship) {
    return (
      <div className="p-8 text-center text-zinc-500">Selecione um campeonato.</div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{championship.name}</span>
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Jogos</h1>
        </div>

        {/* Toggle */}
        <div className="flex p-1 bg-zinc-900 rounded-xl border border-zinc-800">
          <button onClick={() => setActiveTab("all")}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", activeTab === "all" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500")}>
            Todos
          </button>
          <button onClick={() => setActiveTab("live")}
            className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2", activeTab === "live" ? "bg-red-600 text-white" : "text-zinc-500")}>
            Ao Vivo
            {items.some(m => m.status === "IN_PROGRESS") && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-12">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-900/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : groupedByRound.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <Activity className="h-12 w-12 text-zinc-800 mx-auto" />
            <p className="text-zinc-500 text-sm font-medium">Nenhum jogo encontrado para este filtro.</p>
          </div>
        ) : (
          groupedByRound.map((group, idx) => (
            <div key={`${group.phaseName}-${group.round}`} className="space-y-4">
              <div className="flex items-center gap-4 px-2">
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">
                  {group.phaseName} — Rodada {group.round}
                </span>
                <div className="h-px w-full bg-gradient-to-r from-blue-500/20 to-transparent" />
              </div>
              
              <div className="bg-zinc-950/50 border border-zinc-900 rounded-3xl overflow-hidden shadow-2xl">
                {group.matches.map(match => (
                  <MatchRow key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
