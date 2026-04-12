"use client";

import { useState } from "react";
import { useChampionship } from "@/components/ChampionshipContext";
import { usePhases } from "@/features/hooks/usePhases";
import { CreatePhaseForm } from "@/components/CreatePhaseForm";
import type { Phase } from "@/types/championship";

export default function SettingsPage() {
  const { championship } = useChampionship();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);

  const { phases, loading, deletePhase } = usePhases(championship?.id || null);

  if (!championship) {
    return <div className="p-6 text-zinc-400">Selecione um campeonato</div>;
  }

  function handleCloseModal() {
    setIsOpen(false);
    setSelectedPhase(null);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {/* CARD */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Estrutura do Campeonato</h2>

          <button
            onClick={() => {
              setSelectedPhase(null);
              setIsOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium shadow"
          >
            Criar Fase
          </button>
        </div>

        {/* LOADING */}
        {loading && <p>Carregando...</p>}

        {/* EMPTY */}
        {!loading && phases.length === 0 && (
          <p className="text-zinc-500">Nenhuma fase criada</p>
        )}

        {/* LISTA */}
        <div className="space-y-2">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="flex justify-between items-center bg-zinc-800 p-3 rounded"
            >
              <div>
                <p className="font-medium">{phase.name}</p>
                <p className="text-xs text-zinc-400">
                  {phase.abbreviation} • {phase.type} • Ordem:{" "}
                  {phase.order_number}
                </p>
              </div>

              {/* AÇÕES */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedPhase(phase);
                    setIsOpen(true);
                  }}
                  className="px-3 py-1 text-xs bg-yellow-600 rounded hover:bg-yellow-500"
                >
                  Editar
                </button>

                <button
                  onClick={() => {
                    const confirmDelete = confirm(
                      "Tem certeza que deseja remover esta fase?",
                    );
                    if (confirmDelete) {
                      deletePhase(phase.id);
                    }
                  }}
                  className="px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-500"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* OVERLAY */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleCloseModal}
          />

          {/* MODAL CONTENT */}
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* OVERLAY */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={handleCloseModal}
            />

            {/* MODAL */}
            <div className="relative bg-zinc-900 rounded-xl w-full max-w-5xl h-[90vh] border border-zinc-800 shadow-xl flex flex-col">
              {/* HEADER */}
              <div className="p-6 border-b border-zinc-800">
                <h2 className="text-lg font-semibold">
                  {selectedPhase ? "Editar Fase" : "Criar Fase"}
                </h2>
              </div>

              {/* BODY (SCROLL) */}
              <div className="flex-1 overflow-y-auto p-6">
                <CreatePhaseForm
                  onClose={handleCloseModal}
                  phase={selectedPhase}
                />
              </div>
              {/* FOOTER */}
              <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-zinc-700 rounded"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  form="create-phase-form"
                  className="px-4 py-2 bg-blue-600 rounded"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
