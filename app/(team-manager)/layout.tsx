import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import {
  TeamManagerDraftProvider,
  TeamManagerDraftData,
} from "@/components/TeamManagerDraftContext";

export const dynamic = "force-dynamic";

export default async function TeamManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "manager") redirect("/login");

  const { data: manager } = await supabase
    .from("managers")
    .select("id, name, photo_url")
    .eq("user_id", user.id)
    .single();

  if (!manager) redirect("/login");

  const { data: cmRows } = await supabase
    .from("championship_managers")
    .select(
      `id, championship_id, team_id,
       championships ( id, name ),
       teams ( id, name, logo_url )`,
    )
    .eq("manager_id", manager.id)
    .limit(1)
    .order("created_at", { ascending: false });

  const cm = cmRows?.[0] as
    | {
        id: string;
        championship_id: string;
        team_id: string | null;
        championships: { id: string; name: string } | null;
        teams: { id: string; name: string; logo_url: string | null } | null;
      }
    | undefined;

  if (!cm || !cm.championships) redirect("/login");

  const draftData: TeamManagerDraftData = {
    managerId: manager.id,
    managerName: manager.name,
    managerPhotoUrl: manager.photo_url ?? null,
    championshipManagerId: cm.id,
    championshipId: cm.championship_id,
    championshipName: cm.championships.name,
    teamId: cm.teams?.id ?? null,
    teamName: cm.teams?.name ?? null,
    teamLogoUrl: cm.teams?.logo_url ?? null,
  };

  return (
    <TeamManagerDraftProvider data={draftData}>
      <div className="min-h-screen bg-zinc-950 text-white">
        {children}
        <Toaster richColors position="top-center" />
      </div>
    </TeamManagerDraftProvider>
  );
}
