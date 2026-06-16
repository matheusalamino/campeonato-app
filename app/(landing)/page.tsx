import HeroCarousel from "@/components/landing/HeroCarousel";
import HomeNumbersBar from "@/components/landing/HomeNumbersBar";
import HomeTournamentCards from "@/components/landing/HomeTournamentCards";
import TopScorersPreview from "@/components/landing/TopScorersPreview";
import {
  getRecentChampions,
  getAggregateStats,
  getLatestSeasonTopScorers,
  getLatestChampionByType,
} from "@/lib/landing/queries";

export default async function LandingPage() {
  const [recentChampions, stats, { scorers, seasonName, tournamentType }, latest] =
    await Promise.all([
      getRecentChampions(4),
      getAggregateStats(),
      getLatestSeasonTopScorers(5),
      getLatestChampionByType(),
    ]);

  const statsHref =
    tournamentType === "copa_do_mundo" ? "/copa-do-mundo" : "/champions-league";

  return (
    <main>
      <HeroCarousel recentChampions={recentChampions} />
      <HomeTournamentCards
        copaDomundo={latest.copaDomundo}
        championsLeague={latest.championsLeague}
      />
      <HomeNumbersBar stats={stats} />
      <section className="px-8 py-12 md:px-14">
        <TopScorersPreview
          scorers={scorers}
          seasonName={seasonName}
          statsHref={statsHref}
        />
      </section>
    </main>
  );
}
