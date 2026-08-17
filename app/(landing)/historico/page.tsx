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

  const stats = [
    { value: aggregateStats.seasons, label: "Temporadas" },
    { value: aggregateStats.goals, label: "Gols Totais" },
    { value: aggregateStats.players, label: "Jogadores" },
    { value: aggregateStats.copaDomundoEditions, label: "Edições Copa" },
    { value: aggregateStats.championsLeagueEditions, label: "Edições Champions" },
  ];

  const gradientStyle = {
    background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
    WebkitBackgroundClip: "text" as const,
    backgroundClip: "text" as const,
    color: "transparent",
  };

  return (
    <>
      {/* Desktop — untouched */}
      <div className="hidden md:block">
        <main className="w-full px-8 py-12 md:px-14">
          <header className="mb-10">
            <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
              ━ ✦ ━ Liga de Futebol Adventista de Sorocaba ━ ✦ ━
            </p>
            <h1 className="mt-2 font-serif text-4xl font-extrabold sm:text-5xl" style={gradientStyle}>
              Histórico LIFAS
            </h1>
            <p className="mt-1 text-sm text-[var(--gala-ink-dim)]">Todos os tempos · ambos os torneios</p>
          </header>
          <div className="mb-10 flex flex-wrap gap-8">
            {stats.map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <span className="font-serif text-4xl font-extrabold tabular-nums" style={gradientStyle}>
                  {value}
                </span>
                <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-ink-dim)]">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <AllTimePanel topScorers={topScorers} mostTitlesTeams={mostTitlesTeams} hallOfChampions={championships} />
        </main>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <main className="w-full px-4 py-8">
          <header className="mb-6">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
              ━ ✦ ━ LIFAS ━ ✦ ━
            </p>
            <h1 className="mt-1.5 font-serif text-2xl font-extrabold" style={gradientStyle}>
              Histórico LIFAS
            </h1>
            <p className="mt-0.5 text-xs text-[var(--gala-ink-dim)]">Todos os tempos · ambos os torneios</p>
          </header>

          <div className="mb-8 grid grid-cols-2 gap-4">
            {stats.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col rounded-xl border border-[var(--gala-line)] p-3"
                style={{ background: "var(--gala-bg-1)" }}
              >
                <span className="font-serif text-3xl font-extrabold tabular-nums" style={gradientStyle}>
                  {value}
                </span>
                <span className="mt-0.5 text-[8px] font-black uppercase tracking-[2px] text-[var(--gala-ink-dim)]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <AllTimePanel topScorers={topScorers} mostTitlesTeams={mostTitlesTeams} hallOfChampions={championships} />
        </main>
      </div>
    </>
  );
}
