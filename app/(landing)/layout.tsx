import { createClient } from "@/lib/supabase/server";
import LandingShell from "./LandingShell";
import type { ReactNode } from "react";

export default async function LandingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  return <LandingShell liveChampionshipId={data?.id ?? null}>{children}</LandingShell>;
}
