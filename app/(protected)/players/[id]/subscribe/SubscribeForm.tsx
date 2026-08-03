"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import StarRating from "./StarRating";
import { Player } from "@/types/player";
import { Championship } from "@/types/championship";
import { reconcileCapacityAction } from "@/app/(protected)/championships/actions";

const skillsLinha = [
  "visao",
  "controle",
  "finalizacao",
  "velocidade",
  "desarme",
  "drible",
];

const skillsGol = [
  "reposicao",
  "comunicacao",
  "posicionamento",
  "reflexo",
  "jogoAereo",
  "agilidade",
];

export default function InscricaoForm({
  player,
  championships,
}: {
  player: Player;
  championships: Championship[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const skills =
    player.preferred_position === "Goleiro" ? skillsGol : skillsLinha;

  const [championshipId, setChampionshipId] = useState("");

  const [selfRatings, setSelfRatings] = useState(
    Object.fromEntries(skills.map((s) => [s, 1])),
  );

  async function handleSubmit() {
    if (!championshipId) {
      alert("Selecione o campeonato");
      return;
    }

    // 1️⃣ cria registro principal
    const { data: registration, error } = await supabase
      .from("championship_registrations")
      .insert({
        championship_id: championshipId,
        player_id: player.id,
      })
      .select()
      .single();

    if (error) {
      alert("Jogador já inscrito.");
      return;
    }

    // 2️⃣ salva autoavaliação
    const selfRows = skills.map((skill) => ({
      registration_id: registration.id,
      skill,
      rating: selfRatings[skill],
    }));

    await supabase.from("self_evaluations").insert(selfRows);

    // Re-check capacity: closes subscriptions if the championship just filled up.
    await reconcileCapacityAction(championshipId);

    alert("Inscrição realizada com sucesso!");
    router.push(`/players/${player.id}`);
    router.refresh();
  }

  return (
    <div className="bg-zinc-900 p-6 rounded-2xl space-y-6">
      <select
        className="bg-zinc-800 p-2 rounded w-full"
        value={championshipId}
        onChange={(e) => setChampionshipId(e.target.value)}
      >
        <option value="">Selecione o campeonato</option>
        {championships.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <h3 className="text-xl font-bold">Avaliações</h3>

      {skills.map((skill) => (
        <div key={skill} className="grid grid-cols-3 gap-4 mb-3">
          <span className="capitalize">{skill}</span>

          <StarRating
            value={selfRatings[skill]}
            onChange={(value) =>
              setSelfRatings({
                ...selfRatings,
                [skill]: value,
              })
            }
          />
        </div>
      ))}

      <button
        onClick={handleSubmit}
        className="bg-green-600 px-6 py-2 rounded-xl"
      >
        Confirmar Inscrição
      </button>
    </div>
  );
}
