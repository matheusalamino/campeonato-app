"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Phase,
  CreatePhaseDTO,
  UpdatePhaseDTO,
} from "@/types/championship";

export function usePhases(championshipId: string | null) {
  const supabase = createClient();

  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!championshipId) return;

    let isMounted = true;

    async function fetchPhases() {
      setLoading(true);

      const { data } = await supabase
        .from("phases")
        .select("*")
        .eq("championship_id", championshipId)
        .order("order_number");

      if (isMounted && data) {
        setPhases(data);
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    fetchPhases();

    return () => {
      isMounted = false;
    };
  }, [championshipId, supabase]);

  async function reload(): Promise<void> {
    if (!championshipId) return;

    setLoading(true);

    const { data } = await supabase
      .from("phases")
      .select("*")
      .eq("championship_id", championshipId)
      .order("order_number");

    if (data) setPhases(data);

    setLoading(false);
  }

  async function createPhase(dto: CreatePhaseDTO): Promise<Phase | null> {
    const { data, error } = await supabase
      .from("phases")
      .insert(dto)
      .select()
      .single();

    if (!error && data) {
      await reload();
      return data;
    }

    return null;
  }

  async function updatePhase(dto: UpdatePhaseDTO): Promise<Phase | null> {
    const { data, error } = await supabase
      .from("phases")
      .update({
        name: dto.name,
        type: dto.type,
        order_number: dto.order_number,
        abbreviation: dto.abbreviation,
        is_home_away: dto.is_home_away,
      })
      .eq("id", dto.id)
      .select()
      .single();

    if (!error && data) {
      await reload();
      return data;
    }

    return null;
  }

  async function deletePhase(id: string): Promise<void> {
    const { error } = await supabase.from("phases").delete().eq("id", id);

    if (!error) {
      await reload();
    }
  }

  return {
    phases,
    loading,
    createPhase,
    updatePhase,
    deletePhase,
    reload,
  };
}
