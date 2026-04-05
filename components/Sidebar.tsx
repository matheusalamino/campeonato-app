"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useChampionship } from "./ChampionshipContext";

type Championship = {
  id: string;
  name: string;
};

export function Sidebar({ role }: { role: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [championships, setChampionships] = useState<Championship[]>([]);

  const { championship, setChampionship } = useChampionship();

  // 🔄 Carregar campeonatos
  useEffect(() => {
    async function loadChampionships() {
      const { data } = await supabase
        .from("championships")
        .select("id, name")
        .order("name");

      setChampionships(data || []);

      const savedId = localStorage.getItem("championshipId");

      if (savedId && data) {
        const found = data.find((c) => c.id === savedId);
        if (found) setChampionship(found);
      }
    }

    loadChampionships();
  }, [supabase, setChampionship]);

  // 🚪 Logout
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* MOBILE BUTTON */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 bg-zinc-800 p-2 rounded-lg"
      >
        ☰
      </button>

      {/* OVERLAY */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
        fixed md:static
        top-0 left-0
        h-full w-72
        bg-zinc-900 border-r border-zinc-800
        p-6 flex flex-col
        transform transition-transform duration-300
        z-50
        ${open ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0
      `}
      >
        {/* HEADER + SELECT */}
        <div className="mb-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">🏆 Campeonato</h1>
            <p className="text-sm text-zinc-400">Gerenciamento Profissional</p>
          </div>

          {/* SELECT CAMPEONATO */}
          <select
            value={championship?.id || ""}
            onChange={(e) => {
              const selected = championships.find(
                (c) => c.id === e.target.value,
              );

              setChampionship(selected || null);

              if (selected) {
                localStorage.setItem("championshipId", selected.id);
              }
            }}
            className="bg-zinc-800 p-2 rounded w-full text-sm"
          >
            <option value="">Selecionar campeonato</option>

            {championships.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* MENU */}
        <nav className="flex flex-col gap-2">
          {/* CAMPEONATO */}
          <div className="mt-4 text-xs text-zinc-500 px-2">Campeonato</div>

          {/* DASHBOARD */}
          <Link
            href="/"
            className={`px-4 py-2 rounded-lg ${
              isActive("/") ? "bg-blue-600 text-white" : "text-zinc-400"
            }`}
          >
            Dashboard
          </Link>

          <Link
            href="/championship/teams"
            className={`px-4 py-2 rounded-lg ${
              isActive("/championship/teams")
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Times
          </Link>

          <Link
            href="/championship/players"
            className={`px-4 py-2 rounded-lg ${
              isActive("/championship/players")
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Jogadores
          </Link>

          <Link
            href="/statistics"
            className={`px-4 py-2 rounded-lg ${
              isActive("/statistics")
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Estatísticas
          </Link>

          <Link
            href="/draft-night"
            className={`px-4 py-2 rounded-lg ${
              isActive("/draft")
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            Noite de Gala
          </Link>

          {/* CADASTROS */}
          <div className="mt-4 text-xs text-zinc-500 px-2">Cadastros</div>

          <Link
            href="/teams"
            className="px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded"
          >
            Times
          </Link>

          <Link
            href="/players"
            className="px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded"
          >
            Jogadores
          </Link>

          <Link
            href="/managers"
            className="px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded"
          >
            Cartolas
          </Link>
        </nav>

        {/* FOOTER */}
        <div className="mt-auto pt-6 border-t border-zinc-800 space-y-4">
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-500 py-2 rounded-lg text-sm"
          >
            Sair
          </button>

          <div className="text-xs text-zinc-500 text-center">
            v1.0 • Campeonato App
          </div>
        </div>
      </aside>
    </>
  );
}
