import { ChampionshipForm } from "../components/ChampionshipForm";

export default function NewChampionshipPage() {
  return (
    <div className="container mx-auto py-6 md:py-10">
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Criar Campeonato</h1>
      <ChampionshipForm mode="create" />
    </div>
  );
}
