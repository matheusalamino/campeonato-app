"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import EvaluateModal from "../../players/components/EvaluateModal";
import PlayerRadarModal from "../../players/components/PlayerRadarModal";
import { toast } from "sonner";
import { useLoading } from "@/components/ui/loading-provider";
import { RegistrationWithPlayer } from "@/types/registration";
import { Player } from "@/types/player";

type ChampionshipPlayer = {
  id: string;
  final_overall: number | null;
  player: Player;
};

export default function PlayersSection({
  championshipId,
  registrations,
  role,
}: {
  championshipId: string;
  registrations: ChampionshipPlayer[];
  role: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { startLoading, stopLoading } = useLoading();

  const [selectedRegistration, setSelectedRegistration] =
    useState<ChampionshipPlayer | null>(null);

  const [radarPlayer, setRadarPlayer] = useState<ChampionshipPlayer | null>(
    null,
  );

  const [confirmRemove, setConfirmRemove] = useState<ChampionshipPlayer | null>(
    null,
  );

  const [evaluatedRegistrations, setEvaluatedRegistrations] = useState<
    string[]
  >([]);

  const [filter, setFilter] = useState<"all" | "evaluated" | "not_evaluated">(
    "all",
  );

  const [importErrors, setImportErrors] = useState<
    { line: number; error: string }[]
  >([]);

  const [page, setPage] = useState(1);

  const playersPerPage = 5;

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id || null);
    }

    loadUser();
  }, []);

  useEffect(() => {
    async function loadEvaluations() {
      if (!userId) return;

      const { data } = await supabase
        .from("organizer_evaluations")
        .select("registration_id")
        .eq("organizer_id", userId);

      const ids = [...new Set(data?.map((e) => e.registration_id))];

      setEvaluatedRegistrations(ids || []);
    }

    loadEvaluations();
  }, [userId]);

  let filteredRegistrations = registrations;

  if (filter === "evaluated") {
    filteredRegistrations = registrations.filter((r) =>
      evaluatedRegistrations.includes(r.id),
    );
  }

  if (filter === "not_evaluated") {
    filteredRegistrations = registrations.filter(
      (r) => !evaluatedRegistrations.includes(r.id),
    );
  }

  const totalPages = Math.ceil(filteredRegistrations.length / playersPerPage);

  const startIndex = (page - 1) * playersPerPage;

  const paginatedRegistrations = filteredRegistrations.slice(
    startIndex,
    startIndex + playersPerPage,
  );

  async function removePlayer(registrationId: string) {
    startLoading();

    const { error } = await supabase
      .from("championship_registrations")
      .delete()
      .eq("id", registrationId);

    if (error) {
      toast.error("Erro ao remover jogador");
      stopLoading();
      return;
    }

    toast.success("Jogador removido");

    setConfirmRemove(null);

    router.refresh();

    stopLoading();
  }

  async function handleImport(file: File) {
    startLoading();
    setImporting(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("championshipId", championshipId);

    const res = await fetch("/api/import-players", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erro ao importar");
      stopLoading();
      return;
    }

    if (data.errorCount > 0) {
      console.log("Erros:", data.errors);

      toast.warning(
        `${data.successCount} importados, ${data.errorCount} com erro`,
      );

      // 👉 aqui você pode salvar no state pra exibir
      setImportErrors(data.errors);
    } else {
      toast.success(`Importados ${data.successCount} jogadores`);
    }

    setImporting(false);
    router.refresh();
    stopLoading();
  }

  return (
    <div className="bg-zinc-900 p-4 md:p-6 rounded-2xl space-y-6">
      <h2 className="text-xl md:text-2xl font-bold">Jogadores Inscritos</h2>

      {/* IMPORTAÇÃO CSV */}
      {role === "admin" && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="bg-green-600 hover:bg-green-400 cursor-pointer px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar CSV"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
              }}
            />

            <span className="text-xs text-zinc-400">
              Importar inscrições em massa
            </span>

            {importErrors.length > 0 && (
              <div className="bg-red-900/40 border border-red-500 rounded-lg p-4 space-y-2">
                <h3 className="text-red-400 font-semibold">
                  Erros na importação ({importErrors.length})
                </h3>

                <div className="max-h-40 overflow-auto text-sm space-y-1">
                  {importErrors.map((err, i) => (
                    <div key={i} className="text-red-300">
                      Linha {err.line}: {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* BARRA DE PROGRESSO */}
          {importing && (
            <div className="w-full bg-zinc-800 rounded-lg h-3 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* FILTER */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
        <span className="text-sm text-zinc-400">Avaliado:</span>

        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as "all" | "evaluated" | "not_evaluated")
          }
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full md:w-auto"
        >
          <option value="all">Todos</option>
          <option value="evaluated">Sim</option>
          <option value="not_evaluated">Não</option>
        </select>
      </div>

      {/* LIST */}
      <div className="space-y-3">
        {paginatedRegistrations.map((reg) => {
          const player = reg.player;

          return (
            <div
              key={reg.id}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-zinc-800 px-4 py-3 rounded-xl"
            >
              <div>
                <p className="font-semibold">{player.name}</p>

                <p className="text-sm text-zinc-400">
                  {player.preferred_position}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {evaluatedRegistrations.includes(reg.id) && (
                  <button
                    onClick={() => setRadarPlayer(reg)}
                    className="bg-blue-600 hover:bg-blue-400 cursor-pointer px-4 py-1.5 rounded-lg text-sm"
                  >
                    Análise
                  </button>
                )}

                {!evaluatedRegistrations.includes(reg.id) && (
                  <button
                    onClick={() => setSelectedRegistration(reg)}
                    className="bg-zinc-700 hover:bg-zinc-400 cursor-pointer px-4 py-1.5 rounded-lg text-sm"
                  >
                    Avaliar
                  </button>
                )}

                {role === "admin" && (
                  <button
                    onClick={() => setConfirmRemove(reg)}
                    className="bg-red-600 hover:bg-red-400 cursor-pointer px-4 py-1.5 rounded-lg text-sm"
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center items-center gap-3">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="bg-zinc-800 hover:bg-zinc-400 cursor-pointer px-3 py-1.5 rounded-lg text-sm"
          >
            ←
          </button>

          <span className="text-sm text-zinc-400">
            Página {page} de {totalPages}
          </span>

          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="bg-zinc-800 hover:bg-zinc-400 cursor-pointer px-3 py-1.5 rounded-lg text-sm"
          >
            →
          </button>
        </div>
      )}

      {/* REMOVE MODAL */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Confirmar remoção</h3>

            <p className="text-sm text-zinc-400">
              Tem certeza que deseja remover este jogador?
            </p>

            <div className="flex flex-col md:flex-row justify-end gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="bg-zinc-700 hover:bg-zinc-400 cursor-pointer px-4 py-2 rounded-lg text-sm w-full md:w-auto"
              >
                Cancelar
              </button>

              <button
                onClick={() => removePlayer(confirmRemove.id)}
                className="bg-red-600 hover:bg-red-400 cursor-pointer px-4 py-2 rounded-lg text-sm w-full md:w-auto"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRegistration && (
        <EvaluateModal
          registration={selectedRegistration}
          onClose={() => setSelectedRegistration(null)}
          onEvaluated={(registrationId: string) => {
            setEvaluatedRegistrations((prev) => [...prev, registrationId]);
            router.refresh();
          }}
        />
      )}

      {radarPlayer && radarPlayer.player && (
        <PlayerRadarModal
          registrationId={radarPlayer.id}
          playerName={radarPlayer.player.name}
          position={radarPlayer.player.preferred_position}
          overall={radarPlayer.final_overall || 0}
          onClose={() => setRadarPlayer(null)}
        />
      )}
    </div>
  );
}
