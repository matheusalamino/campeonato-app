import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";

/**
 * Atualiza `final_overall` a partir de autoavaliação e notas dos organizadores.
 * - Com auto + org: mesma média ponderada de antes (5% auto, 95% org).
 * - Só auto: org efetivo = auto (comportamento anterior).
 * - Só org: overall usa 100% da média dos organizadores (auto não existia e o fluxo antigo não atualizava).
 */
export async function recalculateOverallWithClient(
  supabase: SupabaseClient,
  registrationId: string,
) {
  const { data: self } = await supabase
    .from("self_evaluations")
    .select("rating")
    .eq("registration_id", registrationId);

  const { data: org } = await supabase
    .from("organizer_evaluations")
    .select("rating")
    .eq("registration_id", registrationId);

  const selfRatings = self ?? [];
  const orgRatings = org ?? [];
  const hasSelf = selfRatings.length > 0;
  const hasOrg = orgRatings.length > 0;

  if (!hasSelf && !hasOrg) return;

  const autoAvg = hasSelf
    ? selfRatings.reduce((sum, r) => sum + r.rating, 0) / selfRatings.length
    : 0;

  const orgAvgFromRows = hasOrg
    ? orgRatings.reduce((sum, r) => sum + r.rating, 0) / orgRatings.length
    : autoAvg;

  let score: number;
  if (hasSelf) {
    const orgAvg = hasOrg ? orgAvgFromRows : autoAvg;
    score = (autoAvg / 5) * 0.05 + (orgAvg / 5) * 0.95;
  } else {
    score = orgAvgFromRows / 5;
  }

  const overall = Math.round(76 + score * 18);

  await supabase
    .from("championship_registrations")
    .update({ final_overall: overall })
    .eq("id", registrationId);
}

export async function recalculateOverall(registrationId: string) {
  const supabase = createClient();
  await recalculateOverallWithClient(supabase, registrationId);
}
