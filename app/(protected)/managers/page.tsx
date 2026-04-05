"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChampionship } from "@/components/ChampionshipContext";
import { useLoading } from "@/components/ui/loading-provider";
import { toast } from "sonner";
import ManagersSection from "./ManagersSection";
import { Manager, ChampionshipManager, ManagerListItem } from "@/types/manager";

type ManagerWithRelations = Manager & {
  championship_managers: ChampionshipManager[];
};

export default function ManagersPage() {
  const supabase = createClient();
  const { championship } = useChampionship();
  const { startLoading, stopLoading } = useLoading();

  const [managers, setManagers] = useState<ManagerListItem[]>([]);

  useEffect(() => {
    if (!championship?.id) return;

    async function load() {
      startLoading();

      const { data, error } = await supabase
        .from("managers")
        .select(
          `
          id,
          name,
          email,
          cpf,
          photo_url,
          championship_managers (
            id,
            championship_id,
            inspirational_phrase,
            team_id
          )
        `,
        )
        .returns<ManagerWithRelations[]>();

      if (error) {
        toast.error("Erro ao carregar cartolas");
        stopLoading();
        return;
      }

      const formatted: ManagerListItem[] =
        data?.map((m) => {
          const relation = m.championship_managers.find(
            (c) => c.championship_id === championship?.id,
          );

          return {
            manager: m,
            id: relation?.id || null,
            inspirational_phrase: relation?.inspirational_phrase || null,
            linked: !!relation,
          };
        }) || [];

      setManagers(formatted);
      stopLoading();
    }

    load();
  }, [championship?.id]);

  if (!championship) {
    return <div className="text-zinc-400">Selecione um campeonato</div>;
  }

  return (
    <div className="h-full flex">
      <ManagersSection championshipId={championship.id} managers={managers} />
    </div>
  );
}
