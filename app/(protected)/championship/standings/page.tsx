"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChampionship } from "@/components/ChampionshipContext";
import { usePhases } from "@/features/hooks/usePhases";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import { useDisciplinary } from "@/features/hooks/useDisciplinary";
import { Shield, Trophy, Info, RefreshCw, ShieldAlert, User } from "lucide-react";
import { cn } from "@/lib/utils";

const supabase = createClient();

export default function StandingsPage() {
  const { championship } = useChampionship();
  const { phases, loading: loadingPhases } = usePhases(championship?.id || null);

  // ── Standings tab state ──────────────────────────────────────────────────
  const groupPhases = phases.filter(p => p.type === "group");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const activePhaseId = selectedPhaseId || groupPhases[0]?.id || null;
  const { standings, groupLabels, loading: loadingStandings, reload } = useGroupStandings(championship?.id || null, activePhaseId);

  const handleReload = useCallback(async () => {
    await reload();
    setLastUpdated(new Date());
  }, [reload]);

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"standings" | "disciplinary">("standings");

  // ── Disciplinary tab state ───────────────────────────────────────────────
  const [discPhaseId, setDiscPhaseId] = useState<string | null>(null);
  const [discTeamId, setDiscTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const { bookedPlayers, suspensions: disciplinarySuspensions, cardHistory, loading: loadingDisc } =
    useDisciplinary(championship?.id || null, discPhaseId, discTeamId);

  // Lazy-load teams when disciplinary tab is first opened
  useEffect(() => {
    if (activeTab !== "disciplinary" || !championship?.id || teams.length > 0 || loadingTeams) return;
    setLoadingTeams(true);
    const fetchTeams = async () => {
      const { data } = await supabase
        .from("championship_teams")
        .select("id, teams(name)")
        .eq("championship_id", championship.id);
      setTeams(
        (data ?? []).map(ct => {
          const t = ct.teams as { name: string } | { name: string }[] | null;
          const name = (Array.isArray(t) ? t[0]?.name : t?.name) ?? "—";
          return { id: ct.id, name };
        })
      );
      setLoadingTeams(false);
    };
    void fetchTeams();
  }, [activeTab, championship?.id, teams.length, loadingTeams]);

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
            {activeTab === "standings" ? (
              <><Trophy className="h-6 w-6 text-yellow-500" /> Classificação</>
            ) : (
              <><ShieldAlert className="h-6 w-6 text-red-500" /> Disciplina</>
            )}
          </h1>
          {activeTab === "standings" && lastUpdated && (
            <p className="text-[10px] text-zinc-600">
              Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
        </div>

        {activeTab === "standings" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleReload()}
              disabled={loadingStandings}
              title="Atualizar classificação"
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-400 hover:border-zinc-600 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loadingStandings && "animate-spin")} />
              Atualizar
            </button>
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
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
        <button
          onClick={() => setActiveTab("standings")}
          className={cn(
            "rounded-lg px-4 py-2 text-xs font-bold transition-all",
            activeTab === "standings" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
          )}
        >
          Classificação
        </button>
        <button
          onClick={() => setActiveTab("disciplinary")}
          className={cn(
            "rounded-lg px-4 py-2 text-xs font-bold transition-all",
            activeTab === "disciplinary" ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white"
          )}
        >
          Disciplina
        </button>
      </div>

      {/* ── Standings tab content ──────────────────────────────────────────── */}
      {activeTab === "standings" && (
        <>
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
                      {groupLabels[groupId] ?? "Grupo"}
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
                            idx < 2 ? "bg-emerald-500/[0.02]" : ""
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
        </>
      )}

      {/* ── Disciplinary tab content ───────────────────────────────────────── */}
      {activeTab === "disciplinary" && (
        <div className="space-y-8">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-3">
            <select
              value={discPhaseId ?? ""}
              onChange={e => setDiscPhaseId(e.target.value || null)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 focus:outline-none focus:border-zinc-600"
            >
              <option value="">Todas as fases</option>
              {phases.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              value={discTeamId ?? ""}
              onChange={e => setDiscTeamId(e.target.value || null)}
              disabled={loadingTeams}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
            >
              <option value="">Todos os times</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {loadingDisc ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-zinc-900/50 border border-zinc-800" />
              ))}
            </div>
          ) : (
            <>
              {/* Section A: Pendurados */}
              <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  🟡 Pendurados ({bookedPlayers.length})
                </h2>
                {bookedPlayers.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-zinc-600 text-sm">
                    Nenhum jogador pendurado nesta seleção.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {bookedPlayers.map(p => (
                      <div key={p.registrationId} className="flex flex-col items-center gap-2 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 w-36">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 overflow-hidden ring-2 ring-yellow-500/30">
                          {p.playerPhoto ? (
                            <img src={p.playerPhoto} alt={p.playerName} className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-zinc-600" />
                          )}
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-white leading-tight">{p.playerName}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">{p.teamName}</p>
                          <p className="text-[10px] text-yellow-500/80 mt-1 leading-tight">{p.lastYellowMatchName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section B: Suspensos */}
              <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  🚫 Suspensos ({disciplinarySuspensions.length})
                </h2>
                {disciplinarySuspensions.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-zinc-600 text-sm">
                    Nenhuma suspensão nesta seleção.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/40 text-zinc-500 text-xs">
                          <th className="px-4 py-3 text-left font-medium">Jogador</th>
                          <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Motivo</th>
                          <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Partida suspensa</th>
                          <th className="px-4 py-3 text-center font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/30">
                        {disciplinarySuspensions.map(s => (
                          <tr key={s.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 overflow-hidden shrink-0">
                                  {s.playerPhoto ? (
                                    <img src={s.playerPhoto} alt={s.playerName} className="h-full w-full object-cover" />
                                  ) : (
                                    <User className="h-4 w-4 text-zinc-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-zinc-200 text-xs">{s.playerName}</p>
                                  <p className="text-[10px] text-zinc-500">{s.teamName}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400 hidden sm:table-cell">
                              {s.reason === "red_card" ? "Cartão Vermelho" : "Dois Amarelos"}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400 hidden md:table-cell">
                              {s.suspendedMatchName ?? <span className="text-zinc-600 italic">A definir</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                s.served
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-amber-500/10 text-amber-500"
                              )}>
                                {s.served ? "Cumprida" : "Pendente"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section C: Histórico de Cartões */}
              <div className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">
                  📋 Histórico de Cartões
                </h2>
                {cardHistory.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-zinc-600 text-sm">
                    Nenhum cartão registrado nesta seleção.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/40 text-zinc-500 text-xs">
                          <th className="px-4 py-3 text-left font-medium">Jogador</th>
                          <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Time</th>
                          <th className="px-2 py-3 text-center font-medium w-12">🟡</th>
                          <th className="px-2 py-3 text-center font-medium w-12">🔴</th>
                          <th className="px-4 py-3 text-center font-medium hidden sm:table-cell">Suspensões</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/30">
                        {cardHistory.map(h => (
                          <tr key={h.registrationId} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 overflow-hidden shrink-0">
                                  {h.playerPhoto ? (
                                    <img src={h.playerPhoto} alt={h.playerName} className="h-full w-full object-cover" />
                                  ) : (
                                    <User className="h-4 w-4 text-zinc-600" />
                                  )}
                                </div>
                                <p className="font-bold text-zinc-200 text-xs">{h.playerName}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400 hidden sm:table-cell">{h.teamName}</td>
                            <td className="px-2 py-3 text-center font-bold text-yellow-400 tabular-nums">{h.yellowCount}</td>
                            <td className="px-2 py-3 text-center font-bold text-red-400 tabular-nums">{h.redCount}</td>
                            <td className="px-4 py-3 text-center text-zinc-400 tabular-nums hidden sm:table-cell">{h.servedSuspensions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
