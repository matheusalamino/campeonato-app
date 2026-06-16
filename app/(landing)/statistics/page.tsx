import StatisticsShell from "@/components/landing/StatisticsShell";
import {
  getAllChampionships,
  getAggregateStats,
  getAllTimeTopScorers,
  getMostTitlesTeams,
} from "@/lib/landing/queries";

export default async function StatisticsPage() {
  const [championships, aggregateStats, topScorers, mostTitlesTeams] = await Promise.all([
    getAllChampionships(),
    getAggregateStats(),
    getAllTimeTopScorers(),
    getMostTitlesTeams(10),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
      <header className="mb-10">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Estatísticas Oficiais ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-3xl font-extrabold sm:text-4xl"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Estatísticas LIFAS
        </h1>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          Recordes históricos e destaques da temporada · atualizado em tempo real
        </p>
      </header>

      <StatisticsShell
        championships={championships}
        aggregateStats={aggregateStats}
        topScorers={topScorers}
        mostTitlesTeams={mostTitlesTeams}
      />
    </main>
  );
}
