import { createClient } from "@/lib/supabase/server";
import { Toaster } from "sonner";
import {
  TeamManagerDraftProvider,
  TeamManagerDraftData,
} from "@/components/TeamManagerDraftContext";
import { TeamManagerLogoutBar } from "@/components/team-manager/TeamManagerLogoutBar";

export const dynamic = "force-dynamic";

export default async function TeamManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return <div className="p-6">Erro user: {userError.message}</div>;
  }

  if (!user) {
    return <div className="p-6">Sem user no server</div>;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return <div className="p-6">Erro profile: {profileError.message}</div>;
  }

  if (!profile) {
    return <div className="p-6">Sem profile</div>;
  }

  if (profile.role === "auction_fiscal") {
    return <div className="p-6">Usuário é auction_fiscal</div>;
  }

  if (profile.role !== "manager") {
    return <div className="p-6">Role inválida: {profile.role}</div>;
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, name, photo_url")
    .eq("user_id", user.id)
    .single();

  if (managerError) {
    return <div className="p-6">Erro manager: {managerError.message}</div>;
  }

  if (!manager) {
    return <div className="p-6">Sem manager para esse user_id</div>;
  }

  const { data: cmRows, error: cmError } = await supabase
    .from("championship_managers")
    .select(
      `id, championship_id, team_id,
       championships ( id, name ),
       teams ( id, name, logo_url )`,
    )
    .eq("manager_id", manager.id)
    .limit(1)
    .order("created_at", { ascending: false });

  if (cmError) {
    return (
      <div className="p-6">Erro championship_managers: {cmError.message}</div>
    );
  }

  const cm = cmRows?.[0] as unknown as
    | {
        id: string;
        championship_id: string;
        team_id: string | null;
        championships: { id: string; name: string } & {
          id: string;
          name: string;
        };
        teams: { id: string; name: string; logo_url: string | null } | null;
      }
    | undefined;

  if (!cm) {
    return <div className="p-6">Sem vínculo em championship_managers</div>;
  }

  if (!cm.championships) {
    return <div className="p-6">Vínculo sem campeonato carregado</div>;
  }

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
      <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
        <TeamManagerLogoutBar />
        <div className="flex-1">{children}</div>
        <Toaster richColors position="top-center" />
      </div>
    </TeamManagerDraftProvider>
  );
}
