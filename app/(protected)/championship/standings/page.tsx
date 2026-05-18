"use client";

import { useState, useCallback } from "react";
import { useChampionship } from "@/components/ChampionshipContext";
import { usePhases } from "@/features/hooks/usePhases";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import { Shield, Trophy, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StandingsPage() {
  const { championship } = useChampionship();
  const { phases, loading: loadingPhases } = usePhases(championship?.id || null);
  
  // Filter only group phases
  const groupPhases = phases.filter(p => p.type === "group");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // If no phase selected and group phases exist, select the first one
  const activePhaseId = selectedPhaseId || groupPhases[0]?.id || null;
  const { standings, loading: loadingStandings, reload } = useGroupStandings(championship?.id || null, activePhaseId);

  const handleReload = useCallback(async () => {
    await reload();
    setLastUpdated(new Date());
  }, [reload]);

  if (!championship) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-zinc-500">
        <Shield className="h-10 w-10 opacity-30" />
        <p className="text-sm">Selecione um campeonato no menu lateral</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {championship.name}
          </p>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Classificação
          </h1>
          {lastUpdated && (
            <p className="text-[10px] text-zinc-600">
              Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Manual refresh button */}
          <button
            onClick={() => void handleReload()}
            disabled={loadingStandings}
            title="Atualizar classificação"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-400 hover:border-zinc-600 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingStandings && "animate-spin")} />
            Atualizar
          </button>

          {/* Phase tabs (only when there are multiple group phases) */}
          {groupPhases.length > 1 && (
            <div className="flex gap-2">
              {groupPhases.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPhaseId(p.id)}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold transition-all",
                    activePhaseId === p.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadingPhases || loadingStandings ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-zinc-900/50 border border-zinc-800" />
          ))}
        </div>
      ) : groupPhases.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Info className="h-8 w-8 opacity-40" />
          <p className="text-sm">Nenhuma fase de grupos cadastrada neste campeonato.</p>
        </div>
      ) : (
        <div className="grid gap-8">
          {Object.entries(standings).map(([groupId, teams]) => (
            <div key={groupId} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
              <div className="bg-zinc-900/50 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-300">
                  Grupo {teams[0]?.name?.split(' ')[0] === 'Grupo' ? '' : (phases.find(p => p.id === activePhaseId)?.name || '')} 
                  {/* Note: logic to show group name could be more robust */}
                </h3>
                <span className="text-[10px] text-zinc-500 font-medium">JOGARES / PONTOS</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/50 bg-zinc-900/20 text-zinc-500">
                      <th className="px-4 py-3 font-medium w-12 text-center">#</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-2 py-3 font-medium text-center w-10">PJ</th>
                      <th className="px-2 py-3 font-medium text-center w-10">V</th>
                      <th className="px-2 py-3 font-medium text-center w-10">E</th>
                      <th className="px-2 py-3 font-medium text-center w-10">D</th>
                      <th className="px-2 py-3 font-medium text-center w-10 hidden sm:table-cell">GP</th>
                      <th className="px-2 py-3 font-medium text-center w-10 hidden sm:table-cell">GC</th>
                      <th className="px-2 py-3 font-medium text-center w-10">SG</th>
                      <th className="px-4 py-3 font-bold text-center w-12 text-white bg-zinc-900/40">PTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/30">
                    {teams.map((t, idx) => (
                      <tr key={t.championshipTeamId} className={cn(
                        "hover:bg-zinc-900/40 transition-colors group",
                        idx < 2 ? "bg-emerald-500/[0.02]" : "" // Highlight qualification zone (dummy logic)
                      )}>
                        <td className="px-4 py-4 text-center">
                          <span className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-black",
                            idx === 0 ? "bg-yellow-500/20 text-yellow-500" : 
                            idx === 1 ? "bg-zinc-400/20 text-zinc-400" :
                            "text-zinc-600"
                          )}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-zinc-700/50 overflow-hidden">
                              {t.logoUrl ? (
                                <img src={t.logoUrl} alt={t.name} className="h-full w-full object-cover" />
                              ) : (
                                <Shield className="h-4 w-4 text-zinc-600" />
                              )}
                            </div>
                            <span className="font-bold text-zinc-200 group-hover:text-white transition-colors">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums">{t.played}</td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums">{t.won}</td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums">{t.drawn}</td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums">{t.lost}</td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums hidden sm:table-cell">{t.goalsFor}</td>
                        <td className="px-2 py-4 text-center text-zinc-400 tabular-nums hidden sm:table-cell">{t.goalsAgainst}</td>
                        <td className={cn(
                          "px-2 py-4 text-center font-medium tabular-nums",
                          t.goalDifference > 0 ? "text-emerald-400" : t.goalDifference < 0 ? "text-red-400" : "text-zinc-500"
                        )}>
                          {t.goalDifference > 0 ? `+${t.goalDifference}` : t.goalDifference}
                        </td>
                        <td className="px-4 py-4 text-center font-black text-white bg-zinc-900/20 tabular-nums">{t.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info footer */}
      <div className="rounded-xl bg-zinc-900/30 p-4 border border-zinc-800 flex gap-3 items-start">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-zinc-400 uppercase">Regras da Fase</p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            A classificação é atualizada em tempo real com base nos jogos finalizados. 
            Critérios de desempate configurados: Pontos {'>'} Saldo de Gols {'>'} Gols Marcados.
          </p>
        </div>
      </div>
    </div>
  );
}
