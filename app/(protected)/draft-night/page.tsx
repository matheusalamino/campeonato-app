"use client";

import { useChampionship } from "@/components/ChampionshipContext";
import { useEffect, useState } from "react";

// ── TYPES ─────────────────────────────
type PotPlayer = {
  id: string;
  name: string;
};

type Pot = {
  pot_number: number;
  position: string;
  players: PotPlayer[];
};

export default function DraftNightPage() {
  const { championship } = useChampionship();

  const [pots, setPots] = useState<Pot[]>([]);
  const [expandedPot, setExpandedPot] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // ── GENERATE POTS ─────────────────────────────
  async function handleGeneratePots() {
    if (!championship?.id) return;

    setLoading(true);

    const res = await fetch("/api/draft/generate-pots", {
      method: "POST",
      body: JSON.stringify({ championshipId: championship.id }),
    });

    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      alert(data.error);
      return;
    }

    // 🔥 reload depois de gerar
    await loadPots(championship.id);
  }

  // ── FUNÇÃO SEGURA (fora do effect NÃO chama setState direto) ──
  async function loadPots(championshipId: string) {
    const res = await fetch(
      `/api/draft/get-pots?championshipId=${championshipId}`,
    );

    const data = await res.json();

    if (!res.ok) return;

    return data.pots as Pot[];
  }

  // ── LOAD ON START ─────────────────────────────
  useEffect(() => {
    if (!championship?.id) return;

    let isMounted = true;

    async function init() {
      if (!championship?.id) return;

      const potsData = await loadPots(championship.id);

      if (isMounted && potsData) {
        setPots(potsData);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [championship?.id]);

  // ── RENDER ─────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* HEADER */}
      <div className="bg-zinc-900 p-6 rounded-2xl space-y-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold">Noite de Gala</h1>

        <p className="text-zinc-400 max-w-xl">
          Configure e inicie o Draft da Copa do Mundo Sorocaba.
        </p>

        <button
          onClick={() => {
            if (!championship?.id) return;

            window.open(`/present?championshipId=${championship.id}`, "_blank");
          }}
          className="bg-yellow-600 hover:bg-yellow-400 text-black font-semibold px-6 py-3 rounded-xl transition w-fit"
        >
          Iniciar Draft
        </button>
      </div>

      {/* CONFIG CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CARD POTES */}
        <div className="bg-zinc-900 p-5 rounded-2xl space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Potes</h2>

            <button
              onClick={handleGeneratePots}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-400 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? "Gerando..." : "Sortear"}
            </button>
          </div>

          {/* LISTA DE POTES */}
          <div className="space-y-2">
            {pots.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum pote gerado ainda.</p>
            )}

            {pots.map((pot, index) => (
              <div
                key={`${pot.position}-${pot.pot_number}-${index}`}
                className="bg-zinc-800 rounded-xl p-3 cursor-pointer hover:bg-zinc-700 transition"
                onClick={() =>
                  setExpandedPot(expandedPot === index ? null : index)
                }
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">
                    Pote {String.fromCharCode(65 + index)} • {pot.position}
                  </span>

                  <span className="text-xs text-zinc-400">
                    {pot.players.length} jogadores
                  </span>
                </div>

                {expandedPot === index && (
                  <div className="mt-3 space-y-1 border-t border-zinc-700 pt-2">
                    {pot.players.map((player) => (
                      <div key={player.id} className="text-sm text-zinc-300">
                        • {player.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* FUTUROS CARDS */}
        <div className="bg-zinc-900 p-5 rounded-2xl shadow-lg flex items-center justify-center text-zinc-500">
          Outras configurações em breve...
        </div>
      </div>
    </div>
  );
}
