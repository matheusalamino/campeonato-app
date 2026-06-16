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

  return (
    <main className="w-full px-8 py-12 md:px-14">
      {/* Header */}
      <header className="mb-10">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Liga de Futebol Adventista de Sorocaba ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-4xl font-extrabold sm:text-5xl"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Histórico LIFAS
        </h1>
        <p className="mt-1 text-sm text-[var(--gala-ink-dim)]">
          Todos os tempos · ambos os torneios
        </p>
      </header>

      {/* Extended numbers bar */}
      <div className="mb-10 flex flex-wrap gap-8">
        {[
          { value: aggregateStats.seasons, label: "Temporadas" },
          { value: aggregateStats.goals, label: "Gols Totais" },
          { value: aggregateStats.players, label: "Jogadores" },
          { value: aggregateStats.copaDomundoEditions, label: "Edições Copa" },
          { value: aggregateStats.championsLeagueEditions, label: "Edições Champions" },
        ].map(({ value, label }) => (
          <div key={label} className="flex flex-col">
            <span
              className="font-serif text-4xl font-extrabold tabular-nums"
              style={{
                background:
                  "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {value}
            </span>
            <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-ink-dim)]">
              {label}
            </span>
          </div>
        ))}
      </div>

      <AllTimePanel
        topScorers={topScorers}
        mostTitlesTeams={mostTitlesTeams}
        hallOfChampions={championships}
      />
    </main>
  );
}
