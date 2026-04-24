"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpCircle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function TeamManagerLogoutBar() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full shrink-0 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm safe-top">
      <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center justify-end gap-2 px-4 py-3">
        <Link
          href="/faq"
          prefetch={false}
          aria-label="Regras e FAQ do Draft"
          title="Regras e FAQ do Draft"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:border-amber-600/60 hover:text-amber-200 active:scale-[0.98]"
        >
          <HelpCircle className="size-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">FAQ</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:border-zinc-600 active:scale-[0.98]"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Sair
        </button>
      </div>
    </header>
  );
}
