"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useLoading } from "@/components/ui/loading-provider";
import ManagerModal from "./ManagerModal";
import { ManagerListItem } from "@/types/manager";

export default function ManagersSection({
  championshipId,
  managers,
}: {
  championshipId: string;
  managers: ManagerListItem[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const { startLoading, stopLoading } = useLoading();

  const [openModal, setOpenModal] = useState(false);
  const [selectedManager, setSelectedManager] =
    useState<ManagerListItem | null>(null);

  async function handleUnlink(id: string | null) {
    if (!id) return;

    startLoading();

    await supabase.from("championship_managers").delete().eq("id", id);

    toast.success("Desvinculado do campeonato");
    router.refresh();

    stopLoading();
  }

  return (
    <div className="w-full p-4 md:p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold">Cartolas</h2>

        <button
          onClick={() => {
            setSelectedManager(null);
            setOpenModal(true);
          }}
          className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg"
        >
          + Novo Cartola
        </button>
      </div>

      {/* LISTA */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {managers.map((m) => (
          <div
            key={m.manager.id}
            className="bg-zinc-900 p-4 rounded-2xl space-y-3"
          >
            {/* STATUS */}
            <span
              className={`text-xs px-2 py-1 rounded ${
                m.linked
                  ? "bg-green-600 text-white"
                  : "bg-yellow-600 text-black"
              }`}
            >
              {m.linked ? "Vinculado" : "Não vinculado"}
            </span>

            {/* FOTO */}
            {m.manager.photo_url && (
              <img
                src={m.manager.photo_url}
                className="w-16 h-16 rounded-full object-cover"
              />
            )}

            {/* INFO */}
            <div>
              <p className="font-semibold">{m.manager.name}</p>
              <p className="text-xs text-zinc-400">
                {m.manager.email || "Sem email"}
              </p>
            </div>

            <p className="text-sm text-zinc-400">
              {m.inspirational_phrase || "Sem frase"}
            </p>

            {/* AÇÕES */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedManager(m);
                  setOpenModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm"
              >
                Editar
              </button>

              {m.linked && (
                <button
                  onClick={() => handleUnlink(m.id)}
                  className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded text-sm"
                >
                  Remover vínculo
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      <ManagerModal
        key={selectedManager?.manager.id || "new"}
        open={openModal}
        onClose={() => {
          setOpenModal(false);
          setSelectedManager(null);
        }}
        championshipId={championshipId}
        initialData={selectedManager}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
