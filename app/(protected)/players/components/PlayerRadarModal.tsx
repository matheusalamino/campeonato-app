"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PlayerRadar from "@/components/PlayerRadar";
import { calculateRadar } from "@/lib/calculateRadar";
import { recalculateOverall } from "@/lib/overall";
import { useLoading } from "@/components/ui/loading-provider";
import { skill_labels } from "@/lib/skills";

type Evaluation = {
  skill: string;
  label: string;
  value: number;
};

export default function PlayerRadarModal({
  registrationId,
  playerName,
  position,
  overall,
  onClose,
}: {
  registrationId: string;
  playerName: string;
  position: string;
  overall?: number;
  onClose: () => void;
}) {
  const supabase = createClient();

  const [data, setData] = useState<Evaluation[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [currentOverall, setCurrentOverall] = useState<number | undefined>(
    overall,
  );
  const [recalculatingOverall, setRecalculatingOverall] = useState(false);

  const { startLoading, stopLoading } = useLoading();

  useEffect(() => {
    async function load() {
      const { data: evaluations } = await supabase
        .from("organizer_evaluations")
        .select("*")
        .eq("registration_id", registrationId);

      const radarData = calculateRadar(evaluations || [], position);

      const formattedData = radarData.map((item) => ({
        ...item,
        label:
          skill_labels[item.skill as keyof typeof skill_labels] || item.skill,
      }));

      setData(formattedData);

      const { data: registration } = await supabase
        .from("championship_registrations")
        .select("profile_photo_link")
        .eq("id", registrationId)
        .single();

      setPhoto(registration?.profile_photo_link ?? null);
    }

    load();
  }, [registrationId, position]);

  async function handleRecalculate() {
    startLoading();
    setRecalculatingOverall(true);

    await recalculateOverall(registrationId);

    const { data } = await supabase
      .from("championship_registrations")
      .select("final_overall")
      .eq("id", registrationId)
      .single();

    setCurrentOverall(data?.final_overall);

    setRecalculatingOverall(false);
    stopLoading();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 p-6 md:p-8 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            {photo ? (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center overflow-hidden">
                <img
                  src={photo}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs md:text-sm">
                Sem foto
              </div>
            )}

            <div>
              <h2 className="text-lg md:text-2xl font-bold">{playerName}</h2>
              <p className="text-zinc-400 text-sm md:text-base">{position}</p>
            </div>
          </div>

          {currentOverall != null && (
            <div className="text-left md:text-right">
              <div className="text-3xl md:text-4xl font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg inline-block">
                {currentOverall}
              </div>

              <div className="text-xs text-zinc-400 tracking-wider">
                OVERALL
              </div>
            </div>
          )}
        </div>

        {/* RADAR */}
        <div className="flex justify-center">
          <div className="w-full max-w-sm md:max-w-md">
            <PlayerRadar data={data} />
          </div>
        </div>

        {/* BUTTONS */}
        <div className="mt-6 flex flex-col md:flex-row justify-between gap-3">
          <button
            onClick={handleRecalculate}
            disabled={recalculatingOverall}
            className="bg-blue-600 hover:bg-blue-400 cursor-pointer px-4 py-2 rounded-lg transition disabled:opacity-50 w-full md:w-auto"
          >
            {recalculatingOverall ? "Calculando..." : "Recalcular Overall"}
          </button>

          <button
            onClick={onClose}
            className="bg-zinc-700 hover:bg-zinc-400 cursor-pointer px-4 py-2 rounded-lg transition w-full md:w-auto"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
