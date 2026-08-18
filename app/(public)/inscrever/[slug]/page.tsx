import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupOption } from "@/types/championship";
import RegistrationWizard from "./RegistrationWizard";
import RestOverlay from "./RestOverlay";
import ClosedNotice from "./ClosedNotice";
import NotOpenNotice from "./NotOpenNotice";
import InscreverHeader from "./InscreverHeader";

export const dynamic = "force-dynamic";

/**
 * Preview do link. A inscricao circula por WhatsApp e Instagram, entao o link
 * precisa chegar com titulo, descricao e imagem — o campeonato ja guarda a
 * imagem em `registration_image_url`.
 *
 * Usa o client anon, nao o service-role: sao dados que `anon` ja le, e assim o
 * preview nao depende da chave secreta.
 */
export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("championships")
      .select("name, description, registration_image_url")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) return { title: "Inscrição" };

    const title = `Inscrição · ${data.name}`;
    const description = data.description || `Faça sua inscrição para ${data.name}.`;
    const images = data.registration_image_url ? [data.registration_image_url] : undefined;

    return {
      title,
      description,
      openGraph: { title, description, images, type: "website" },
      twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
    };
  } catch {
    return { title: "Inscrição" };
  }
}

export default async function InscreverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: champ } = await supabase
    .from("championships")
    .select("id, name, slug, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options, registration_image_url, pix_key, pix_merchant_name, pix_merchant_city, max_extra_tickets")
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
