import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRow } from "@/lib/supabase/require-row";
import type { GroupOption } from "@/types/championship";
import RegistrationWizard from "./RegistrationWizard";
import RestOverlay from "./RestOverlay";
import ClosedNotice from "./ClosedNotice";
import NotOpenNotice from "./NotOpenNotice";
import NotYetNotice from "./NotYetNotice";
import InscreverHeader from "./InscreverHeader";
import { registrationGate } from "@/features/registration/registration-gate";
import { sabbathStatus } from "@/features/registration/sabbath";
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
  const now = new Date();

  // A janela de sabado nao depende do campeonato, entao as duas consultas vao
  // juntas. Esta pagina e `force-dynamic`: o RTT economizado e em todo
  // carregamento, e nao uma vez so.
  const [champResult, sabbathWindow] = await Promise.all([
    supabase
      .from("championships")
      .select("id, name, slug, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options, registration_image_url, pix_key, pix_merchant_name, pix_merchant_city, max_extra_tickets, registration_start_date, registration_end_date")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle(),
    getSabbathWindow(now),
  ]);

  // `requireRow` e nao `champResult.data`: a consulta que falha tambem devolve
  // `data: null`, e le-la direto faria a falha se passar por slug inexistente.
  //
  // O resultado sai INTEIRO do Promise.all (`champResult`, e nao
  // `{ data: champ }`) justamente para o `error` chegar aqui: desestruturar o
  // `data` na linha do await descartaria o erro antes de qualquer um poder olhar.
  const champ = requireRow(champResult, "campeonato");

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

  // A decisao do sabado mora inteira em `sabbathStatus`, e nao aqui: montada a
  // mao nesta pagina ela nao teria teste de comportamento nenhum. O que sobra
  // aqui e fiacao, e quem a segura e o teste de fonte em
  // features/registration/sabbath-page-wiring.test.ts.
  //
  // Nao e o unico trecho do fluxo sem teste: `getSabbathWindow` tambem nao tem
  // — `services/**` esta fora do vitest —, e o docblock dele diz o que isso
  // custa e o que olhar antes de editar aquela consulta.
  const { pause, sunsetAt } = sabbathStatus(now, sabbathWindow);
  const gate = registrationGate(champ, now, pause);

  // O instante vai com o relogio que o calculou. O wizard tica no aparelho do
  // jogador, e o aparelho pode estar minutos errado nos dois sentidos — sem o
  // carimbo daqui, a faixa e o corte do pagamento erram junto com ele. Ver
  // `NextSunset` em features/registration/sabbath.ts.
  const nextSunset = sunsetAt ? { at: sunsetAt, serverNow: now.toISOString() } : null;

  // O repouso de sabado e uma experiencia modal de tela cheia — sem header.
  if (gate.view === "rest") {
    return <RestOverlay championship={championship} liveCount={liveCount} endsAt={gate.endsAt} />;
  }

  let view;
  switch (gate.view) {
    case "wizard":
      view = <RegistrationWizard championship={championship} liveCount={liveCount} nextSunset={nextSunset} />;
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
