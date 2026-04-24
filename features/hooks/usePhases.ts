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

    if (error || !data) return null;

    // Update related settings without recreating structural data (matches/slots).
    // Full restructure requires delete + create — handled by the UI layer.
    if (dto.type === "group" && dto.groupSettings) {
      await supabase
        .from("phase_group_settings")
        .update({
          teams_per_group: dto.groupSettings.teams_per_group,
          round_type: dto.groupSettings.round_type,
          matches_per_pair: dto.groupSettings.matches_per_pair,
          number_of_groups: dto.groupSettings.number_of_groups,
        })
        .eq("phase_id", dto.id);
    }

    if (dto.type === "knockout" && dto.knockoutSettings) {
      await supabase
        .from("phase_knockout_settings")
        .update({
          number_of_matches: dto.knockoutSettings.number_of_matches,
          is_home_away: dto.knockoutSettings.is_home_away,
          auto_fill: dto.knockoutSettings.auto_fill,
        })
        .eq("phase_id", dto.id);
    }

    await reload();
    return data;
  }

  /**
   * Removes a phase and ALL related data in dependency order.
   *
   * The ON DELETE CASCADE migration handles this automatically in the DB,
   * but we also do it manually here so it works even before the migration
   * is applied, and to avoid relying solely on implicit cascade behaviour.
   */
  async function deletePhase(id: string): Promise<{ error: string | null }> {
    // 1. Fetch all knockout_matches for this phase so we can delete their children
    const { data: matches, error: matchErr } = await supabase
      .from("knockout_matches")
      .select("id")
      .eq("phase_id", id);

    if (matchErr) return { error: matchErr.message };

    const matchIds = (matches ?? []).map((m: { id: string }) => m.id);

    if (matchIds.length > 0) {
      // 1a. match_slots
      const { error: msErr } = await supabase
        .from("match_slots")
        .delete()
        .in("match_id", matchIds);
      if (msErr) return { error: msErr.message };

      // 1b. knockout_match_sources
      const { error: kmsErr } = await supabase
        .from("knockout_match_sources")
        .delete()
        .in("knockout_match_id", matchIds);
      if (kmsErr) return { error: kmsErr.message };

      // 1c. knockout_matches
      const { error: kmErr } = await supabase
        .from("knockout_matches")
        .delete()
        .in("id", matchIds);
      if (kmErr) return { error: kmErr.message };
    }

    // 2. group_slots
    const { error: gsErr } = await supabase
      .from("group_slots")
      .delete()
      .eq("phase_id", id);
    if (gsErr) return { error: gsErr.message };

    // 3. groups
    const { error: grErr } = await supabase
      .from("groups")
      .delete()
      .eq("phase_id", id);
    if (grErr) return { error: grErr.message };

    // 4. phase_group_settings
    const { error: pgsErr } = await supabase
      .from("phase_group_settings")
      .delete()
      .eq("phase_id", id);
    if (pgsErr) return { error: pgsErr.message };

    // 5. phase_knockout_settings
    const { error: pksErr } = await supabase
      .from("phase_knockout_settings")
      .delete()
      .eq("phase_id", id);
    if (pksErr) return { error: pksErr.message };

    // 6. phase itself
    const { error: phErr } = await supabase
      .from("phases")
      .delete()
      .eq("id", id);
    if (phErr) return { error: phErr.message };

    await reload();
    return { error: null };
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
