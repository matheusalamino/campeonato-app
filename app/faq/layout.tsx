import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "FAQ · Regulamento do Draft",
  description:
    "Regras, multas, potes, carta especial e fluxo completo do Draft da Copa do Mundo Sorocaba.",
};

async function resolveBackHref() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "manager") return "/team-manager";
    if (profile?.role === "auction_fiscal") return "/auction-fiscal";
    if (profile?.role === "admin") return "/dashboard";
    return "/";
  } catch {
    return null;
  }
}

export default async function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const backHref = await resolveBackHref();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="sticky top-0 z-50 w-full shrink-0 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm safe-top">
        <div className="mx-auto flex min-h-14 w-full max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-zinc-200 transition hover:text-amber-200"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-amber-700/40 bg-amber-900/20 text-xs font-bold text-amber-300">
              CMS
            </span>
            <span className="hidden sm:inline">Copa do Mundo Sorocaba</span>
          </Link>

          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:border-zinc-600 active:scale-[0.98]"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Voltar ao painel</span>
              <span className="sm:hidden">Voltar</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:border-amber-600/60 hover:text-amber-200 active:scale-[0.98]"
            >
              <LogIn className="size-4 shrink-0" aria-hidden />
              Entrar
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
