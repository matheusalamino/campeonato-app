"use client";

import type { TeamStanding } from "@/features/hooks/useGroupStandings";

type Props = {
  championshipName: string;
  standings: Record<string, TeamStanding[]>; // por grupo (useGroupStandings)
  groupLabels: Record<string, string>;
};

const HEADERS = ["P", "J", "V", "E", "D", "GP", "GC", "SG"];

export default function StandingsCard({ championshipName, standings, groupLabels }: Props) {
  const groups = Object.keys(standings).sort();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vh] px-[4vw]">
      <div className="flex items-center gap-4 text-[1.1vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      <h2 className="gala-gold-text font-serif text-[3vw] font-extrabold">Classificação</h2>

      <div className={`grid w-full gap-[2vw] ${groups.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[60vw]"}`}>
        {groups.map((g) => (
          <div key={g} className="gala-panel rounded-2xl p-[1.2vw]">
            <h3 className="mb-2 text-[1.1vw] font-bold uppercase tracking-[3px] text-[var(--gala-gold-1)]">
              {groupLabels[g] ?? `Grupo ${g}`}
            </h3>
            <table className="w-full text-[1vw]">
              <thead>
                <tr className="text-[0.8vw] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  <th className="pb-1 text-left">Time</th>
                  {HEADERS.map((h) => (
                    <th key={h} className="pb-1 text-center">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings[g].map((t, i) => (
                  <tr
                    key={t.championshipTeamId}
                    className={`border-t border-[var(--gala-line)]/60 ${i < 2 ? "text-[var(--gala-gold-1)]" : "text-[var(--gala-ink)]"}`}
                  >
                    <td className="flex items-center gap-2 py-[0.45vw] font-semibold">
                      <span className={`w-5 text-center font-extrabold ${i < 2 ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>
                        {i + 1}
                      </span>
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
    </div>
  );
}
