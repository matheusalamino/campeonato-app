import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupOption } from "@/types/championship";
import RegistrationWizard from "./RegistrationWizard";
import RestOverlay from "./RestOverlay";
import ClosedNotice from "./ClosedNotice";
import NotOpenNotice from "./NotOpenNotice";
import NotYetNotice from "./NotYetNotice";
import InscreverHeader from "./InscreverHeader";
import { registrationGate } from "@/features/registration/registration-gate";
import { sabbathView } from "@/features/registration/sabbath";
import { getSabbathWindow } from "@/services/public-registration";

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
    .select("id, name, slug, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options, registration_image_url, pix_key, pix_merchant_name, pix_merchant_city, max_extra_tickets, registration_start_date, registration_end_date")
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

  // A decisao do sabado mora inteira em `sabbathView`, e nao aqui: montada a
  // mao nesta pagina, ela nao teria teste nenhum — este e o unico trecho do
  // fluxo que a suite nao alcanca.
  const now = new Date();
  const { pause, sunsetAt } = sabbathView(now, await getSabbathWindow(now));
  const gate = registrationGate(champ, now, pause);

  // O repouso de sabado e uma experiencia modal de tela cheia — sem header.
  if (gate.view === "rest") {
    return <RestOverlay championship={championship} liveCount={liveCount} endsAt={gate.endsAt} />;
  }

  let view;
  switch (gate.view) {
    case "wizard":
      view = <RegistrationWizard championship={championship} liveCount={liveCount} sunsetAt={sunsetAt} />;
      break;
    case "not_yet":
      view = <NotYetNotice name={champ.name} opensAt={gate.opensAt} />;
      break;
    case "ended_by_deadline":
      view = <ClosedNotice name={champ.name} reason="deadline" endedAt={gate.endedAt} />;
      break;
    case "ended_by_capacity":
      view = <ClosedNotice name={champ.name} reason="capacity" />;
      break;
    case "not_open":
      view = <NotOpenNotice />;
      break;
    default:
      gate satisfies never;
  }

  return (
    <>
      <InscreverHeader />
      {view}
    </>
  );
}
