"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLoading } from "@/components/ui/loading-provider";
import { toast } from "sonner";

export default function TeamsSection({
  championshipId,
  teams,
  role,
}: {
  championshipId: string;
  teams: { id: string; name: string; logo_url?: string }[];
  role: string;
}) {
  const router = useRouter();
  const [allTeams, setAllTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<{
    championshipTeamId: string;
  } | null>(null);

  const supabase = createClient();
  const { startLoading, stopLoading } = useLoading();

  useEffect(() => {
    async function loadTeams() {
      const { data: all } = await supabase.from("teams").select("id, name");

      if (!all) return;

      const available = all.filter(
        (team) => !teams.some((t) => t.id === team.id),
      );

      setAllTeams(available);
    }

    loadTeams();
  }, [teams.length]); // 🔥 evita loop

  async function addTeam() {
    startLoading();

    if (!selectedTeam) {
      toast.error("Selecione um time");
      stopLoading();
      return;
    }

    const { error } = await supabase.from("championship_teams").insert({
      championship_id: championshipId,
      team_id: selectedTeam,
    });

    if (error) {
      toast.error("Erro ao adicionar time");
      stopLoading();
      return;
    }

    setSelectedTeam("");
    router.refresh();
    stopLoading();
  }

  async function removeTeam(championshipTeamId: string) {
    startLoading();

    const { error } = await supabase
      .from("championship_teams")
      .delete()
      .eq("id", championshipTeamId);

    if (error) {
      toast.error("Erro ao remover time");
      stopLoading();
      return;
    }

    toast.success("Time removido");
    router.refresh();
    stopLoading();
  }

  return (
    <div className="bg-zinc-900 p-6 rounded-2xl space-y-6 h-full shadow-lg">
      <h2 className="text-xl md:text-2xl font-bold">Times</h2>

      {/* ADD TEAM */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4">
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="bg-zinc-800 p-2 rounded w-full md:w-auto"
        >
          <option value="">Selecione um time</option>

          {allTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {role === "admin" && (
          <button
            onClick={addTeam}
            className="bg-green-600 hover:bg-green-400 cursor-pointer w-full md:w-auto px-4 py-2 rounded-lg transition"
          >
            Adicionar
          </button>
        )}
      </div>

      {/* LIST */}
      <div className="space-y-3">
        {teams.length === 0 && (
          <p className="text-zinc-400">Nenhum time adicionado.</p>
        )}

        {teams.map((team) => (
          <div
            key={team.id}
            className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-zinc-800 px-4 py-3 rounded-xl"
          >
            <div className="flex items-center gap-3">
              {team.logo_url ? (
                <Image
                  src={team.logo_url}
                  alt={team.name}
                  width={40}
                  height={40}
                  className="w-10 h-10 object-cover rounded-full border border-zinc-600"
                />
              ) : (
                <div className="w-10 h-10 bg-zinc-700 rounded-full" />
              )}

              <span className="font-medium">{team.name}</span>
            </div>

            {role === "admin" && (
              <button
                onClick={() =>
                  setConfirmRemove({ championshipTeamId: team.id })
                }
                className="bg-red-600 hover:bg-red-400 cursor-pointer px-4 py-1.5 rounded-lg text-sm transition w-full md:w-auto"
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>

      {/* MODAL */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Confirmar remoção</h3>

            <p className="text-sm text-zinc-400">
              Tem certeza que deseja remover este time do campeonato?
            </p>

            <div className="flex flex-col md:flex-row justify-end gap-3 pt-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="bg-zinc-700 hover:bg-zinc-400 cursor-pointer px-4 py-2 rounded-lg text-sm transition w-full md:w-auto"
              >
                Cancelar
              </button>

              <button
                onClick={() => removeTeam(confirmRemove.championshipTeamId)}
                className="bg-red-600 hover:bg-red-400 cursor-pointer px-4 py-2 rounded-lg text-sm transition w-full md:w-auto"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
