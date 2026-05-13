"use client";

import Link from "next/link";
import { Gamepad2, Trophy, BarChart3, ChevronRight, Activity, Crown, Shield } from "lucide-react";
import { useChampionship } from "@/components/ChampionshipContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Dashboard() {
  const { championship } = useChampionship();
  const [championTeam, setChampionTeam] = useState<{name: string, logo_url: string | null} | null>(null);

  useEffect(() => {
    async function loadChampion() {
      if (championship?.champion_team_id) {
        const supabase = createClient();
        const { data } = await supabase.from("teams").select("name, logo_url").eq("id", championship.champion_team_id).single();
        if (data) setChampionTeam(data);
      } else {
        setChampionTeam(null);
      }
    }
    loadChampion();
  }, [championship?.champion_team_id]);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white uppercase tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 text-sm">Gerenciamento central do campeonato.</p>
      </div>

      {/* Champion Banner */}
      {championTeam && (
        <div className="relative overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-900/20 via-yellow-600/10 to-transparent p-8 shadow-[0_0_40px_-10px_rgba(234,179,8,0.2)]">
          <div className="absolute -right-10 -top-10 opacity-10">
            <Crown className="w-64 h-64 text-yellow-500" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-950 border-4 border-yellow-500 shadow-xl overflow-hidden p-1">
              {championTeam.logo_url ? (
                <img src={championTeam.logo_url} alt={championTeam.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <Shield className="h-10 w-10 text-zinc-500" />
              )}
            </div>
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
                <Crown className="w-5 h-5 text-yellow-500" />
                <span className="text-yellow-500 font-black uppercase tracking-[0.3em] text-sm">Campeão</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white">{championTeam.name}</h2>
              <p className="text-yellow-500/70 text-sm mt-1">O grande vencedor do campeonato!</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* JOGOS */}
        <Link 
          href="/games"
          className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-blue-500/50 transition-all duration-300"
        >
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-blue-600/10 rounded-2xl group-hover:bg-blue-600 transition-colors duration-300">
                <Gamepad2 className="h-6 w-6 text-blue-500 group-hover:text-white" />
              </div>
              <Activity className="h-4 w-4 text-emerald-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Jogos</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Acompanhe as partidas em tempo real e resultados.
              </p>
            </div>
            <div className="pt-4 flex items-center text-blue-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Acessar Painel <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* CLASSIFICAÇÃO */}
        <Link 
          href="/championship/standings"
          className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-yellow-500/50 transition-all duration-300"
        >
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-yellow-600/10 rounded-2xl group-hover:bg-yellow-600 transition-colors duration-300">
                <Trophy className="h-6 w-6 text-yellow-500 group-hover:text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Classificação</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Veja a tabela de grupos e posições das equipes.
              </p>
            </div>
            <div className="pt-4 flex items-center text-yellow-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Ver Tabela <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* ESTATÍSTICAS */}
        <Link 
          href="/statistics"
          className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-purple-500/50 transition-all duration-300"
        >
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-purple-600/10 rounded-2xl group-hover:bg-purple-600 transition-colors duration-300">
                <BarChart3 className="h-6 w-6 text-purple-500 group-hover:text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Estatísticas</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Artilharia, assistências e disciplina do campeonato.
              </p>
            </div>
            <div className="pt-4 flex items-center text-purple-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Explorar Dados <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      {/* Decorative background elements */}
      <div className="fixed top-0 right-0 -z-10 h-[500px] w-[500px] bg-blue-600/5 blur-[120px] rounded-full" />
      <div className="fixed bottom-0 left-0 -z-10 h-[400px] w-[400px] bg-purple-600/5 blur-[100px] rounded-full" />
    </div>
  );
}
