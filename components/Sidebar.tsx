"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useChampionship } from "./ChampionshipContext";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChampionshipCombobox } from "./ChampionshipCombobox";
import type { Championship as ChampionshipModel } from "@/types/championship";

type Championship = {
  id: string;
  name: string;
  season: string | null;
  created_at: string | null;
  champion_team_id: string | null;
};

export function Sidebar({ role }: { role: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() =>
    pathname.startsWith("/championship/settings"),
  );
  const [championships, setChampionships] = useState<Championship[]>([]);

  const { championship, setChampionship } = useChampionship();

  // 🔄 Carregar campeonatos
  useEffect(() => {
    async function loadChampionships() {
      const { data } = await supabase
        .from("championships")
        .select("id, name, season, created_at, champion_team_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

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
  const isSettingsRoute = pathname.startsWith("/championship/settings");
  const isSettingsExpanded = isSettingsRoute || settingsOpen;

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
          <ChampionshipCombobox
            items={championships}
            value={championship?.id ?? ""}
            onSelect={(id) => {
              const selected = championships.find((c) => c.id === id) ?? null;
              // Local row carries season/created_at as `string | null`; the context
              // Championship types them as optional strings, so cast at the boundary.
              setChampionship(selected as ChampionshipModel | null);
              if (selected) localStorage.setItem("championshipId", selected.id);
            }}
          />
        </div>

        {/* MENU */}
        <nav className="flex flex-col gap-2">
          {/* CAMPEONATO */}
          <div className="mt-4 text-xs text-zinc-500 px-2">Campeonato</div>

          {/* DASHBOARD */}
          <Link
            href="/dashboard"
            className={`px-4 py-2 rounded-lg ${
              isActive("/dashboard") ? "bg-blue-600 text-white" : "text-zinc-400"
            }`}
          >
            Dashboard
          </Link>

          <button
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
            className={`flex items-center justify-between px-4 py-2 rounded-lg text-left ${
              isSettingsRoute
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <span>Configurações</span>
            {isSettingsExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {isSettingsExpanded && (
            <div className="ml-3 flex flex-col gap-1 border-l border-zinc-800 pl-3">
              <Link
                href="/championship/settings"
                className={`px-4 py-2 rounded-lg text-sm ${
                  isActive("/championship/settings")
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                Fases
              </Link>

              <Link
                href="/championship/settings/games"
                className={`px-4 py-2 rounded-lg text-sm ${
                  isActive("/championship/settings/games")
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                Jogos
              </Link>
            </div>
          )}

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

          {role === "admin" && (
            <Link
              href="/championships"
              className="px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded"
            >
              Campeonatos
            </Link>
          )}
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
