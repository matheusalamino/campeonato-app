"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import { useChampionshipMatches } from "@/features/hooks/useChampionshipMatches";
import TeamLogo from "@/components/landing/TeamLogo";

const supabase = createClient();
const HEADERS = ["P", "J", "V", "E", "D", "GP", "GC", "SG"];

export default function StandingsTab({ championshipId }: { championshipId: string }) {
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
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

  const phaseResolved = resolvedFor === championshipId;

  const { standings, groupLabels, loading } = useGroupStandings(championshipId, groupPhaseId);
  // Ordena pelos rótulos (A, B, C…), não pela chave (id do grupo)
  const groups = Object.keys(standings).sort((a, b) =>
    (groupLabels[a] ?? a).localeCompare(groupLabels[b] ?? b, "pt-BR"),
  );

  if (!phaseResolved || (loading && groups.length === 0)) {
    return <div className="h-44 animate-pulse rounded-xl bg-[#171320]" />;
  }
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Classificação ainda não disponível.</p>;
  }

  const groupPhases = allPhases.filter((p) =>
    p.matches.some((m) => m.groupLabel !== null),
  );

  const groupMatches = groupPhases.flatMap((p) =>
    p.matches.filter((m) => m.groupLabel !== null),
  );

  return (
    <div className="space-y-8">
      {/* Group standings tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="overflow-x-auto rounded-xl border border-[var(--gala-line)] bg-[#171320] p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[3px] text-[var(--gala-gold-1)]">
              {groupLabels[g] ?? `Grupo ${g}`}
            </h3>
            <table className="w-full min-w-[420px] text-xs sm:text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  <th className="pb-1 text-left">Time</th>
                  {HEADERS.map((h) => <th key={h} className="pb-1 text-center">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {standings[g].map((t, i) => (
                  <tr key={t.championshipTeamId} className={`border-t border-[var(--gala-line)]/60 ${i < 2 ? "text-[var(--gala-gold-1)]" : ""}`}>
                    <td className="flex items-center gap-2 py-1.5 font-semibold">
                      <span className={`w-4 text-center font-extrabold shrink-0 ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>{i + 1}</span>
                      <TeamLogo logoUrl={t.logoUrl} name={t.name} size={20} />
                      {t.name}
                    </td>
                    <td className="text-center font-extrabold">{t.points}</td>
                    <td className="text-center">{t.played}</td>
                    <td className="text-center">{t.won}</td>
                    <td className="text-center">{t.drawn}</td>
                    <td className="text-center">{t.lost}</td>
                    <td className="text-center">{t.goalsFor}</td>
                    <td className="text-center">{t.goalsAgainst}</td>
                    <td className="text-center">{t.goalDifference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Group-phase match results */}
      {!matchesLoading && groupMatches.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Jogos da Fase de Grupos
          </p>
          <div className="flex flex-col gap-2">
            {groupMatches.map((match) => {
              const isFinished = match.status === "FINISHED";
              const isLive = match.status === "IN_PROGRESS";
              const hasScore = match.homeScore !== null && match.awayScore !== null;
              return (
                <div
                  key={match.id}
                  className="flex items-center gap-3 rounded-xl border px-4 py-3"
                  style={{
                    background: "var(--gala-bg-1)",
                    borderColor: isLive ? "rgba(239,68,68,0.4)" : "var(--gala-line)",
                  }}
                >
                  {match.groupLabel && (
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-[var(--gala-gold-2)] w-12">
                      {match.groupLabel}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                    <span className="truncate text-sm font-bold text-white">{match.home.label}</span>
                    <TeamLogo logoUrl={match.home.logoUrl} name={match.home.label} size={22} />
                  </div>
                  <div
                    className="shrink-0 rounded px-2 py-1 text-sm font-black tabular-nums"
                    style={{
                      background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
                      color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
                      minWidth: "48px",
                      textAlign: "center",
                    }}
                  >
                    {hasScore ? `${match.homeScore} × ${match.awayScore}` : isLive ? "Ao vivo" : "—"}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <TeamLogo logoUrl={match.away.logoUrl} name={match.away.label} size={22} />
                    <span className="truncate text-sm font-bold text-white">{match.away.label}</span>
                  </div>
                  {isLive && (
                    <span className="shrink-0 text-[9px] font-black text-red-400">● AO VIVO</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
