import StatsChips from "@/components/landing/StatsChips";
import type { AggregateStats, AllTimeScorer, MostTitlesTeam, Champion } from "@/lib/landing/queries";

interface AllTimePanelProps {
  aggregateStats: AggregateStats;
  topScorers: AllTimeScorer[];
  mostTitlesTeams: MostTitlesTeam[];
  hallOfChampions: Champion[];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
      {children}
    </p>
  );
}

export default function AllTimePanel({
  aggregateStats,
  topScorers,
  mostTitlesTeams,
  hallOfChampions,
}: AllTimePanelProps) {
  const chips = [
    { value: aggregateStats.seasons, label: "Seasons" },
    { value: aggregateStats.goals, label: "Goals" },
    { value: aggregateStats.players, label: "Players" },
  ];

  return (
    <aside className="flex flex-col gap-8">
      {/* Aggregate chips */}
      <section>
        <SectionTitle>By the numbers</SectionTitle>
        <StatsChips chips={chips} />
      </section>

      {/* All-time top scorers */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>All-Time Top Scorers</SectionTitle>
        {topScorers.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No data yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topScorers.map((scorer, i) => (
              <li key={scorer.playerName} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-black"
                  style={{
                    background: i === 0
                      ? "linear-gradient(135deg, var(--gala-gold-1), var(--gala-gold-3))"
                      : "var(--gala-bg-1)",
                    color: i === 0 ? "#050507" : "white",
                    border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
                  }}
                >
                  {scorer.playerName.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">{scorer.playerName}</span>
                <span className="font-black tabular-nums text-[var(--gala-gold-2)]">
                  {scorer.totalGoals} ⚽
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Most championships won */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Most Championships Won</SectionTitle>
        {mostTitlesTeams.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No data yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mostTitlesTeams.map((team, i) => (
              <li key={team.teamName} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-white">{team.teamName}</span>
                <span className="font-black text-[var(--gala-gold-2)]">
                  {team.titles}× 🏆
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hall of champions */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Hall of Champions</SectionTitle>
        {hallOfChampions.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No championships yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hallOfChampions.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
              >
                <span
                  className="text-xs font-black"
                  style={{ color: "var(--gala-gold-2)", minWidth: "2.5rem" }}
                >
                  {c.season ?? "—"}
                </span>
                <span className="flex-1 truncate text-sm text-white">
                  {c.championName ?? <span className="text-[var(--gala-ink-dim)]">TBD</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
