"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { positionLabel } from "@/lib/public/types";
import { useState } from "react";

export function PlayerList({
  players,
}: {
  players: { id: string; name: string; preferred_position: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [page, setPage] = useState(1);
  const playersPerPage = 10;

  async function handleDelete(id: string) {
    const confirmDelete = confirm("Deseja excluir este jogador?");
    if (!confirmDelete) return;

    await supabase.from("players").delete().eq("id", id);

    router.refresh();
  }

  const totalPages = Math.ceil(players.length / playersPerPage);

  const startIndex = (page - 1) * playersPerPage;

  const paginatedPlayers = players.slice(
    startIndex,
    startIndex + playersPerPage,
  );

  return (
    <div className="space-y-4">
      {/* LISTA */}
      <div className="bg-zinc-900 rounded-xl overflow-hidden">
        {paginatedPlayers.map((player) => (
          <div
            key={player.id}
            className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800"
          >
            <div className="flex items-center gap-3">
              {/*
                A etiqueta tem `uppercase`, entao a tela mostra `GOLEIRO` e nao
                `Goleiro` — e e isso mesmo que ela mostrava ANTES da virada do
                vocabulario, quando a coluna guardava a palavra. Sem o rotulo
                aqui a etiqueta passaria a dizer `GOL`, que e outra coisa.

                Nao confundir com as seis etiquetas `uppercase tracking-widest`
                de `games/[id]`, `BestPlayerVoteModal` e `LineupControl`: aquelas
                MOSTRAM a sigla por decisao do usuario, e esta nao e uma delas.
              */}
              <div className="bg-blue-600 text-xs font-bold px-3 py-1 rounded-full uppercase">
                {positionLabel(player.preferred_position)}
              </div>

              <span className="font-medium">{player.name}</span>
            </div>

            <div className="flex gap-2">
              <button
                className="text-sm bg-zinc-700 px-3 py-1 rounded hover:bg-zinc-600"
                onClick={() => router.push(`/players/${player.id}`)}
              >
                Editar
              </button>

              <button
                className="text-sm bg-red-600 px-3 py-1 rounded hover:bg-red-500"
                onClick={() => handleDelete(player.id)}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* PAGINAÇÃO */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-2">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            className="bg-zinc-800 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-zinc-700"
          >
            ← Anterior
          </button>

          <span className="text-sm text-zinc-400">
            Página {page} de {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
            className="bg-zinc-800 px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-zinc-700"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
