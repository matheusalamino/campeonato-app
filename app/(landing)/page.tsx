import HeroSection from "@/components/landing/HeroSection";
import StatsChips from "@/components/landing/StatsChips";
import TopScorersPreview from "@/components/landing/TopScorersPreview";
import { getRecentChampions, getAggregateStats, getLatestSeasonTopScorers } from "@/lib/landing/queries";

export default async function LandingPage() {
  const [recentChampions, stats, { scorers, seasonName }] = await Promise.all([
    getRecentChampions(4),
    getAggregateStats(),
    getLatestSeasonTopScorers(5),
  ]);

  const chips = [
    { value: stats.seasons, label: "Seasons" },
    { value: stats.goals, label: "Goals Scored" },
    { value: stats.players, label: "Players" },
  ];

  return (
    <main>
      <HeroSection recentChampions={recentChampions} />

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <p className="mb-6 text-center text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          By the numbers
        </p>
        <StatsChips chips={chips} />
        <TopScorersPreview scorers={scorers} seasonName={seasonName} />
      </section>
    </main>
  );
}
