"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChampionship } from "@/components/ChampionshipContext";
import { useLoading } from "@/components/ui/loading-provider";
import { toast } from "sonner";
import PlayersSection from "./PlayersSection";
import { RegistrationWithPlayer } from "@/types/registration";
import { Player } from "@/types/player";

type RegistrationResponse = {
  id: string;
  final_overall: number | null;
  payment_verified: boolean | null;
  player: {
    id: string;
    name: string;
    preferred_position: string;
  };
};

type ChampionshipPlayer = {
  id: string;
  final_overall: number | null;
  payment_verified: boolean | null;
  player: Player;
};

export default function ChampionshipPlayersPage() {
  const supabase = createClient();
  const { championship } = useChampionship();
  const { startLoading, stopLoading } = useLoading();

  const [registrations, setRegistrations] = useState<ChampionshipPlayer[]>([]);

  const championshipId = championship?.id;

  useEffect(() => {
    if (!championshipId) return;

    async function loadPlayers() {
      startLoading();

      // `payment_verified` faz parte do select de proposito: sem ela o campo
      // chega `undefined` a PlayersSection e TODA inscricao aparece como nao
      // conferida -- sem erro e sem sintoma, porque esta string nao passa por
      // typecheck nenhum. Quem a prende e
      // features/registration/players-admin-wiring.test.ts.
      const { data, error } = await supabase
        .from("championship_registrations")
        .select(
          `
          id,
          final_overall,
          payment_verified,
          player:players!inner (
            id,
            name,
            preferred_position
          )
        `,
        )
        .eq("championship_id", championshipId)
        .returns<RegistrationResponse[]>();

      if (error) {
        toast.error("Erro ao carregar jogadores");
        console.error(error);
        stopLoading();
        return;
      }

      const formatted: ChampionshipPlayer[] =
        data?.map((item) => ({
          id: item.id,
          final_overall: item.final_overall,
          payment_verified: item.payment_verified,
          player: item.player,
        })) || [];

      // 🔥 ordenação
      formatted.sort((a, b) =>
        a.player.name.localeCompare(b.player.name, "pt-BR"),
      );

      setRegistrations(formatted);
      stopLoading();
    }

    loadPlayers();
  }, [championshipId]); // ✅ sem loop

  // ❌ Sem campeonato selecionado
  if (!championship) {
    return (
      <div className="text-zinc-400">
        Selecione um campeonato no menu lateral
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <div className="w-full">
        <PlayersSection
          championshipId={championship.id}
          registrations={registrations}
          role="admin"
        />
      </div>
    </div>
  );
}
