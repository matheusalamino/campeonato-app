import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Championship } from "@/types/championship";
import { ChampionshipForm } from "../../components/ChampionshipForm";

export const dynamic = "force-dynamic";

export default async function EditChampionshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!data) notFound();

  return (
    <div className="container mx-auto py-6 md:py-10">
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Editar Campeonato</h1>
      <ChampionshipForm mode="edit" initial={data as Championship} />
    </div>
  );
}
