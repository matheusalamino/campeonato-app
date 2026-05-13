"use client";

import { useState } from "react";
import { Shield, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchDetail, MatchPlayer, MatchLineupPlayer } from "@/features/hooks/useMatchDetail";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const supabase = createClient();

interface LineupControlProps {
  detail: MatchDetail;
  onSaved: () => void;
}

export function LineupControl({ detail, onSaved }: LineupControlProps) {
  const [activeTab, setActiveTab] = useState<"home" | "away">("home");
  const [saving, setSaving] = useState(false);

  const team = activeTab === "home" ? detail.homeTeam : detail.awayTeam;
  const players = activeTab === "home" ? detail.homePlayers : detail.awayPlayers;
  const teamLineup = detail.lineups.filter((l) => l.championshipTeamId === team.championshipTeamId);

  // Local state for editing
  const [localStarters, setLocalStarters] = useState<Set<string>>(() => new Set(teamLineup.filter(l => l.isStarter).map(l => l.playerId)));
  const [localCaptain, setLocalCaptain] = useState<string | null>(() => teamLineup.find(l => l.isCaptain)?.playerId ?? null);

  // Update local state when tab changes
  const switchTab = (tab: "home" | "away") => {
    setActiveTab(tab);
    const newTeam = tab === "home" ? detail.homeTeam : detail.awayTeam;
    const newLineup = detail.lineups.filter((l) => l.championshipTeamId === newTeam.championshipTeamId);
    setLocalStarters(new Set(newLineup.filter(l => l.isStarter).map(l => l.playerId)));
    setLocalCaptain(newLineup.find(l => l.isCaptain)?.playerId ?? null);
  };

  const toggleStarter = (playerId: string) => {
    const next = new Set(localStarters);
    if (next.has(playerId)) {
      next.delete(playerId);
      if (localCaptain === playerId) setLocalCaptain(null);
    } else {
      next.add(playerId);
    }
    setLocalStarters(next);
  };

  const setCaptain = (playerId: string) => {
    if (!localStarters.has(playerId)) {
      toast.error("O capitão precisa ser um titular.");
      return;
    }
    setLocalCaptain(playerId);
  };

  const saveLineup = async () => {
    setSaving(true);
    
    // First delete existing lineups for this team in this match
    await supabase.from("match_lineups")
      .delete()
      .eq("knockout_match_id", detail.match.id)
      .eq("championship_team_id", team.championshipTeamId);

    if (localStarters.size > 0) {
      // Insert new
      const inserts = Array.from(localStarters).map((playerId) => ({
        knockout_match_id: detail.match.id,
        championship_team_id: team.championshipTeamId,
        player_id: playerId,
        is_starter: true,
        is_captain: localCaptain === playerId,
      }));
      
      const { error } = await supabase.from("match_lineups").insert(inserts);
      
      if (error) {
        toast.error("Erro ao salvar escalação.");
        setSaving(false);
        return;
      }
    }
    
    toast.success("Escalação salva com sucesso!");
    setSaving(false);
    onSaved(); // trigger reload in parent
  };

  // Status computation
  const homeLineupCount = detail.lineups.filter(l => l.championshipTeamId === detail.homeTeam.championshipTeamId && l.isStarter).length;
  const awayLineupCount = detail.lineups.filter(l => l.championshipTeamId === detail.awayTeam.championshipTeamId && l.isStarter).length;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-300">
          <Users className="h-4 w-4 text-zinc-500" />
          Escalação Inicial
        </h3>
        <div className="flex items-center gap-3">
          <StatusBadge team={detail.homeTeam.name} count={homeLineupCount} />
          <StatusBadge team={detail.awayTeam.name} count={awayLineupCount} />
        </div>
      </div>

      <div className="flex border-b border-zinc-800">
        <button onClick={() => switchTab("home")} className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all", activeTab === "home" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900")}>
          {detail.homeTeam.name}
        </button>
        <button onClick={() => switchTab("away")} className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-l border-zinc-800", activeTab === "away" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900")}>
          {detail.awayTeam.name}
        </button>
      </div>

      <div className="p-4 bg-zinc-900/30">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-zinc-500 font-medium">Selecione os titulares e defina um capitão.</p>
          <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded-full">{localStarters.size} Titulares</span>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
          {players.map(p => {
            const isStarter = localStarters.has(p.registrationId);
            const isCaptain = localCaptain === p.registrationId;
            return (
              <div key={p.registrationId} className={cn("flex items-center justify-between p-2 rounded-lg border transition-all", isStarter ? "bg-blue-600/10 border-blue-500/30" : "bg-zinc-900 border-zinc-800/50 hover:border-zinc-700")}>
                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 border border-zinc-700">
                    {isStarter && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
                  </div>
                  <input type="checkbox" checked={isStarter} onChange={() => toggleStarter(p.registrationId)} className="sr-only" />
                  <div className="flex flex-col">
                    <span className={cn("text-sm font-bold", isStarter ? "text-white" : "text-zinc-400")}>{p.name}</span>
                    {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                  </div>
                </label>
                {isStarter && (
                  <button onClick={() => setCaptain(p.registrationId)} className={cn("px-2 py-1 rounded text-xs font-bold transition-all ml-2", isCaptain ? "bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.4)]" : "bg-zinc-800 text-zinc-500 hover:text-yellow-500")}>
                    CAPITÃO
                  </button>
                )}
              </div>
            );
          })}
          {players.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">Nenhum jogador cadastrado neste time.</p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800">
          <button onClick={saveLineup} disabled={saving} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-all disabled:opacity-50 uppercase tracking-wider">
            {saving ? "Salvando..." : `Salvar Escalação do ${team.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ team, count }: { team: string; count: number }) {
  const isOk = count > 0;
  return (
    <div className="flex items-center gap-1.5" title={`${team}: ${isOk ? 'Escalado' : 'Pendente'}`}>
      {isOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-red-500" />}
      <span className="text-[10px] font-bold text-zinc-400 uppercase max-w-[60px] truncate">{team}</span>
    </div>
  );
}
