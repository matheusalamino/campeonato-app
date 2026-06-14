"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";

const supabase = createClient();
const HEADERS = ["P", "J", "V", "E", "D", "GP", "GC", "SG"];

export default function StandingsTab({ championshipId }: { championshipId: string }) {
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("phases").select("id, type, order_number")
        .eq("championship_id", championshipId).order("order_number");
      setGroupPhaseId(data?.find((p) => p.type === "group")?.id ?? null);
    })();
  }, [championshipId]);

  const { standings, groupLabels, loading } = useGroupStandings(championshipId, groupPhaseId);
  const groups = Object.keys(standings).sort();

  if (loading && groups.length === 0) {
    return <div className="h-44 animate-pulse rounded-xl bg-[#171320]" />;
  }
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Classificação ainda não disponível.</p>;
  }

  return (
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
                    <span className={`w-4 text-center font-extrabold ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>{i + 1}</span>
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
  );
}
