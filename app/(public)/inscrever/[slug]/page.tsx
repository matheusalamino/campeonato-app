import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupOption } from "@/types/championship";
import RegistrationWizard from "./RegistrationWizard";
import RestOverlay from "./RestOverlay";
import ClosedNotice from "./ClosedNotice";
import NotOpenNotice from "./NotOpenNotice";
import InscreverHeader from "./InscreverHeader";

export const dynamic = "force-dynamic";

export default async function InscreverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: champ } = await supabase
    .from("championships")
    .select("id, name, slug, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options, registration_image_url, pix_key, pix_merchant_name, pix_merchant_city")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!champ) notFound();

  const { count } = await supabase
    .from("championship_registrations")
    .select("id", { count: "exact", head: true })
    .eq("championship_id", champ.id);

  const championship = {
    ...champ,
    registration_group_options: (champ.registration_group_options ?? []) as GroupOption[],
  };
  const liveCount = count ?? 0;

  // The Sabbath "rest" view is a full-screen modal experience — no header.
  if (champ.status === "rest") {
    return <RestOverlay championship={championship} liveCount={liveCount} />;
  }

  let view;
  if (champ.status === "subscribing") {
    view = <RegistrationWizard championship={championship} liveCount={liveCount} />;
  } else if (champ.status === "subscribed") {
    view = <ClosedNotice name={champ.name} />;
  } else {
    view = <NotOpenNotice />;
  }

  return (
    <>
      <InscreverHeader />
      {view}
    </>
  );
}
