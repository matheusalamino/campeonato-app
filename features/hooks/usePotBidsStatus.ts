"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PotBidsStatusResponse } from "@/app/api/draft/pot-bids-status/route";

export type { PotBidsStatusResponse } from "@/app/api/draft/pot-bids-status/route";

type Params = {
  championshipId: string;
  potNumber: number;
  potPosition: string;
  enabled?: boolean;
  intervalMs?: number;
};

type State = {
  data: PotBidsStatusResponse | null;
  loading: boolean;
  error: string | null;
};

export function usePotBidsStatus({
  championshipId,
  potNumber,
  potPosition,
  enabled = true,
  intervalMs = 3000,
}: Params): State & { refetch: () => void } {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });

  const isMounted = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (!enabled || !championshipId || !potNumber || !potPosition) return;

    try {
      const url = `/api/draft/pot-bids-status?championshipId=${encodeURIComponent(championshipId)}&potNumber=${potNumber}&potPosition=${encodeURIComponent(potPosition)}`;
      const res = await fetch(url);
      if (!isMounted.current) return;

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setState((p) => ({
          ...p,
          loading: false,
          error: body.error ?? "Erro ao buscar lances",
        }));
        return;
      }

      const data = (await res.json()) as PotBidsStatusResponse;
      if (!isMounted.current) return;
      setState({ data, loading: false, error: null });
    } catch (err: unknown) {
      if (!isMounted.current) return;
      setState((p) => ({
        ...p,
        loading: false,
        error: err instanceof Error ? err.message : "Erro de rede",
      }));
    }
  }, [championshipId, potNumber, potPosition, enabled]);

  useEffect(() => {
    isMounted.current = true;

    if (!enabled) {
      // Stop polling but preserve the last known snapshot so consumers
      // can keep rendering the final ranking after `revealed = true`.
      setState((p) => ({ ...p, loading: false, error: null }));
      return;
    }

    setState((p) => ({ ...p, loading: p.data === null, error: null }));
    void fetch_();

    intervalRef.current = setInterval(() => {
      void fetch_();
    }, intervalMs);

    return () => {
      isMounted.current = false;
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetch_, enabled, intervalMs]);

  return { ...state, refetch: fetch_ };
}
