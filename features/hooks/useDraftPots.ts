"use client";

import { useEffect, useEffectEvent, useState } from "react";

export type DraftPot = {
  pot_number: number;
  position: string;
  pot_order: number;
  max_managers: number;
  pot_letter: string; // derived: A, B, C… by pot_order rank
  player_count: number;
};

// Shape returned by /api/draft/get-pots
type ApiPotGroup = {
  pot_number: number;
  position: string;
  pot_order: number;
  max_managers: number;
  players?: unknown[];
  average_overall?: number;
};

// The API wraps the array inside { pots: [...] }
type ApiResponse = {
  pots: ApiPotGroup[];
};

export function useDraftPots(championshipId: string) {
  const [pots, setPots] = useState<DraftPot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Eventos de efeito: encapsulam updates de estado
  const startLoading = useEffectEvent(() => {
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!championshipId) return;
    startLoading();

    fetch(
      `/api/draft/get-pots?championshipId=${encodeURIComponent(championshipId)}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Erro ao buscar potes");
        }
        return res.json() as Promise<ApiResponse | ApiPotGroup[]>;
      })
      .then((raw) => {
        // Handle both { pots: [...] } and plain array shapes defensively
        const list: ApiPotGroup[] = Array.isArray(raw)
          ? raw
          : ((raw as ApiResponse).pots ?? []);

        // Sort by pot_order to assign letters A, B, C…
        const sorted = [...list].sort((a, b) => a.pot_order - b.pot_order);

        const mapped: DraftPot[] = sorted.map((p, i) => ({
          pot_number: p.pot_number,
          position: p.position,
          pot_order: p.pot_order,
          max_managers: p.max_managers ?? 0,
          pot_letter: String.fromCharCode(65 + i),
          player_count: Array.isArray(p.players) ? p.players.length : 0,
        }));

        setPots(mapped);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setLoading(false);
      });
  }, [championshipId]);

  return { pots, loading, error };
}
