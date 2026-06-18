import TournamentPageShell from "@/components/landing/TournamentPageShell";
import MobileTournamentShell from "@/components/mobile/MobileTournamentShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function ChampionsLeaguePage() {
  const editions = await getChampionshipsByType("champions_league");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <>
      <div className="hidden md:block">
        <TournamentPageShell
          tournamentTitle="Champions League Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
      <div className="md:hidden">
        <MobileTournamentShell
          tournamentTitle="Champions League Sorocaba"
          editions={editions}
          initialPodium={initialPodium}
        />
      </div>
    </>
  );
}
