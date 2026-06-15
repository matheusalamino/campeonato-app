import SeasonStatsPanel from "@/components/landing/SeasonStatsPanel";
import { getAllChampionships } from "@/lib/landing/queries";

export default async function StatisticsPage() {
  const championships = await getAllChampionships();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10">
      <header className="mb-10 text-center">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Official Statistics ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-3xl font-extrabold sm:text-4xl"
          style={{
            background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS Statistics
        </h1>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          All-time records and season highlights · updated in real time
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <SeasonStatsPanel championships={championships} />
        {/* AllTimePanel added in Task 9 */}
      </div>
    </main>
  );
}
