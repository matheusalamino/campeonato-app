import { createClient } from "@/lib/supabase/server";
import { shouldCloseForCapacity } from "@/features/championships/capacity";
import type { ChampionshipStatus } from "@/types/championship";

/**
 * Re-check a championship's registration count after a subscription is created.
 * Flips `subscribing` -> `subscribed` once players + waitlist capacity is reached.
 * No-op otherwise. Safe to call from client code via a Server Action wrapper.
 */
export async function reconcileChampionshipCapacity(
  championshipId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: championship } = await supabase
    .from("championships")
    .select("status, max_players, max_waitlist_players")
    .eq("id", championshipId)
    .is("deleted_at", null)
    .single();

  if (!championship) return;

  const { count } = await supabase
    .from("championship_registrations")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", championshipId);

  const shouldClose = shouldCloseForCapacity({
    status: championship.status as ChampionshipStatus,
    registrationCount: count ?? 0,
    maxPlayers: championship.max_players,
    maxWaitlist: championship.max_waitlist_players,
  });

  if (shouldClose) {
    await supabase
      .from("championships")
      .update({ status: "subscribed" })
      .eq("id", championshipId);
  }
}
