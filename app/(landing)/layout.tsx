import { createClient } from "@/lib/supabase/server";
import LandingShell from "./LandingShell";
import type { ReactNode } from "react";

export default async function LandingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  // Find a championship that has an in-progress match right now
  const { data: liveMatch } = await supabase
    .from("knockout_matches")
    .select("phase_id")
    .eq("status", "IN_PROGRESS")
    .limit(1)
    .maybeSingle();

  let liveChampionshipId: string | null = null;
  if (liveMatch?.phase_id) {
    const { data: phase } = await supabase
      .from("phases")
      .select("championship_id")
      .eq("id", liveMatch.phase_id)
      .maybeSingle();
    liveChampionshipId = phase?.championship_id ?? null;
  }

  return <LandingShell liveChampionshipId={liveChampionshipId}>{children}</LandingShell>;
}
