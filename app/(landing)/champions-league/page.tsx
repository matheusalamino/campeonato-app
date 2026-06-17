import TournamentPageShell from "@/components/landing/TournamentPageShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function ChampionsLeaguePage() {
  const editions = await getChampionshipsByType("champions_league");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <TournamentPageShell
      tournamentTitle="Champions League Sorocaba"
      editions={editions}
      initialPodium={initialPodium}
    />
  );
}
