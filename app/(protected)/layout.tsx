import { getUserRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "sonner";
import { LoadingProvider } from "@/components/ui/loading-provider";
import { ChampionshipProvider } from "@/components/ChampionshipContext";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRole();

  if (!role) {
    redirect("/login");
  }

  if (role === "manager") {
    redirect("/team-manager");
  }

  return (
    <LoadingProvider>
      <ChampionshipProvider>
        <div className="flex flex-col md:flex-row min-h-screen bg-zinc-950 text-white">
          <Sidebar role={role} />
          <main className="flex-1 p-4 md:p-8">{children}</main>
          <Toaster richColors position="top-right" />
        </div>
      </ChampionshipProvider>
    </LoadingProvider>
  );
}
