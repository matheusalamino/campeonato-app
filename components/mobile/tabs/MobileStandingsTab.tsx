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
