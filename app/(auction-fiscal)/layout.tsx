import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { TeamManagerLogoutBar } from "@/components/team-manager/TeamManagerLogoutBar";

export const dynamic = "force-dynamic";

export default async function AuctionFiscalLayout({
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

  if (
    !profile ||
    (profile.role !== "auction_fiscal" && profile.role !== "admin")
  ) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <TeamManagerLogoutBar />
      <div className="flex-1">{children}</div>
      <Toaster richColors position="top-center" />
    </div>
  );
}
