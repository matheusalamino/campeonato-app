import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Championship } from "@/types/championship";
import { ChampionshipsTable } from "./components/ChampionshipsTable";
import { parseSeasonYear } from "@/lib/championship-year";

export const dynamic = "force-dynamic";

export default async function ChampionshipsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select("*")
    .is("deleted_at", null);

  const championships = ((data ?? []) as Championship[]).sort(
    (a, b) =>
      parseSeasonYear(b.season, null) - parseSeasonYear(a.season, null) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="container mx-auto py-6 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">Campeonatos</h1>
        <Link
          href="/championships/new"
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-500"
        >
          <Plus className="h-4 w-4" /> Novo
        </Link>
      </div>
      <ChampionshipsTable championships={championships} />
    </div>
  );
}
