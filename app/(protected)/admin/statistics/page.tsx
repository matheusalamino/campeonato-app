import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Estatisticas() {
  const supabase = await createClient();
  const { data: goals } = await supabase
    .from("match_events")
    .select("player_id, players(name)")
    .eq("type", "GOAL");

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Estatísticas</h2>

      <div className="grid grid-cols-2 gap-8">
        <div className="bg-zinc-900 p-6 rounded-xl">
          <h3 className="text-xl mb-4">Artilharia</h3>
          {goals?.map((g, i) => (
            <div key={i}>{g.players[0].name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
