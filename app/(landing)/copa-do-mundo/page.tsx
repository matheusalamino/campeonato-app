import TournamentPageShell from "@/components/landing/TournamentPageShell";
import { getChampionshipsByType, getPodiumByChampionship } from "@/lib/landing/queries";

export default async function CopaDomundoPage() {
  const editions = await getChampionshipsByType("copa_do_mundo");
  const initialPodium = editions[0]
    ? await getPodiumByChampionship(editions[0].id)
    : [];

  return (
    <TournamentPageShell
      tournamentTitle="Copa do Mundo Sorocaba"
      editions={editions}
      initialPodium={initialPodium}
    />
  );
}
