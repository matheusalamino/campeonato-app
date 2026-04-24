"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import StarRating from "../[id]/subscribe/StarRating";
import { recalculateOverall } from "@/lib/overall";
import { useLoading } from "@/components/ui/loading-provider";
import { toast } from "sonner";
import { skill_labels } from "@/lib/skills";
import { Player } from "@/types/player";

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

type ChampionshipPlayer = {
  id: string;
  final_overall: number | null;
  player: Player;
};

export default function EvaluateModal({
  registration,
  onClose,
  onEvaluated,
}: {
  registration: ChampionshipPlayer;
  onClose: () => void;
  onEvaluated: (registrationId: string) => void;
}) {
  const supabase = createClient();
  const player = registration.player as Player;

  const { startLoading, stopLoading } = useLoading();

  const [photo, setPhoto] = useState<string | null>(null);

  const skills =
    player?.preferred_position === "Goleiro" ? skillsGol : skillsLinha;

  const [ratings, setRatings] = useState(
    Object.fromEntries(skills.map((s) => [s, 1])),
  );

  useEffect(() => {
    async function loadPhoto() {
      const { data } = await supabase
        .from("championship_registrations")
        .select("profile_photo_link")
        .eq("id", registration.id)
        .single();

      setPhoto(data?.profile_photo_link ?? null);
    }

    loadPhoto();
  }, [registration.id]);

  async function handleSave() {
    startLoading();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Usuário não autenticado");
      stopLoading();
      return;
    }

    const rows = skills.map((skill) => ({
      registration_id: registration.id,
      organizer_id: user.id,
      skill,
      rating: ratings[skill],
    }));

    const { error } = await supabase.from("organizer_evaluations").insert(rows);

    await recalculateOverall(registration.id);

    if (error) {
      toast.error("Erro ao salvar avaliação");
      console.error(error);
      stopLoading();
      return;
    }

    toast.success("Avaliação salva com sucesso");

    onEvaluated(registration.id);
    onClose();

    stopLoading();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 p-6 md:p-8 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-6">
        {/* FOTO */}
        <div className="flex flex-col items-center gap-4">
          {photo ? (
            <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full bg-zinc-800 border-4 border-zinc-700 overflow-hidden">
              <Image
                src={photo}
                alt="Foto jogador"
                fill
                unoptimized
                className="object-contain"
                sizes="(max-width: 768px) 96px, 128px"
              />
            </div>
          ) : (
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400">
              Sem foto
            </div>
          )}

          <h2 className="text-xl md:text-3xl font-bold text-center">
            Avaliar {player?.name}
          </h2>
        </div>

        {/* SKILLS */}
        <div className="space-y-4">
          {skills.map((skill) => (
            <div
              key={skill}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <span className="capitalize text-sm md:text-base">
                {skill_labels[skill as keyof typeof skill_labels]}
              </span>

              <StarRating
                value={ratings[skill]}
                onChange={(value: number) =>
                  setRatings({
                    ...ratings,
                    [skill]: value,
                  })
                }
              />
            </div>
          ))}
        </div>

        {/* BUTTONS */}
        <div className="flex flex-col md:flex-row justify-end gap-3 pt-4">
          <button
            onClick={onClose}
            className="bg-zinc-700 hover:bg-zinc-400 cursor-pointer px-4 py-2 rounded-lg transition w-full md:w-auto"
          >
            Cancelar
          </button>

          <button
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-400 cursor-pointer px-4 py-2 rounded-lg transition w-full md:w-auto"
          >
            Salvar avaliação
          </button>
        </div>
      </div>
    </div>
  );
}
