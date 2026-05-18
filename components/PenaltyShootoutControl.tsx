"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Shield, Target, Plus, Check, X, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchDetail, MatchPlayer, MatchPenalty } from "@/features/hooks/useMatchDetail";

const supabase = createClient();

export function PenaltyShootoutControl({ detail, reload }: { detail: MatchDetail; reload: () => void }) {
  const { match, homeTeam, awayTeam, homePlayers, awayPlayers, penalties } = detail;
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<MatchPlayer | null>(null);

  const homePens = penalties.filter(p => p.teamId === homeTeam.championshipTeamId);
  const awayPens = penalties.filter(p => p.teamId === awayTeam.championshipTeamId);

  async function addPenalty(result: "scored" | "missed" | "saved") {
    if (!selectedTeam) { toast.error("Selecione o time"); return; }
    setLoading(true);

    const teamPens = penalties.filter(p => p.teamId === selectedTeam);
    const shotOrder = teamPens.length + 1;

    const { error } = await supabase.from("penalty_shootouts").insert({
      knockout_match_id: match.id,
      team_id: selectedTeam,
      player_id: selectedPlayer?.registrationId ?? null,
      shot_order: shotOrder,
      result
    });

    if (error) {
      toast.error("Erro ao registrar cobrança");
    } else {
      // Update global score
      const scoreField = selectedTeam === homeTeam.championshipTeamId ? "penalty_home_score" : "penalty_away_score";
      const newScore = (match[scoreField as keyof typeof match] as number) + (result === "scored" ? 1 : 0);
      
      await supabase.from("knockout_matches").update({ [scoreField]: newScore }).eq("id", match.id);
      
      toast.success("Cobrança registrada");
      setSelectedPlayer(null);
      reload();
    }
    setLoading(false);
  }

  function renderPenaltyDots(pens: MatchPenalty[]) {
    return (
      <div className="flex gap-1.5">
        {[...Array(5)].map((_, i) => {
          const p = pens.find(pen => pen.shotOrder === i + 1);
          return (
            <div key={i} className={cn(
              "h-3 w-3 rounded-full border border-zinc-700",
              p?.result === "scored" ? "bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
              p?.result === "missed" || p?.result === "saved" ? "bg-red-500 border-red-400" :
              "bg-zinc-800"
            )} />
          );
        })}
        {pens.length > 5 && (
          <span className="text-[10px] text-zinc-500 ml-1">+{pens.length - 5}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
              {homeTeam.logoUrl ? <img src={homeTeam.logoUrl} className="h-full w-full rounded-full object-cover" /> : <Shield className="h-6 w-6 text-zinc-600" />}
            </div>
            <span className="text-[10px] font-black uppercase text-zinc-500">{homeTeam.name}</span>
            <span className="text-3xl font-black text-white">{match.penalty_home_score}</span>
            {renderPenaltyDots(homePens)}
          </div>

          <div className="px-4 text-center">
            <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">PÊNALTIS</span>
            <div className="h-px w-8 bg-zinc-800 mx-auto mt-2" />
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
              {awayTeam.logoUrl ? <img src={awayTeam.logoUrl} className="h-full w-full rounded-full object-cover" /> : <Shield className="h-6 w-6 text-zinc-600" />}
            </div>
            <span className="text-[10px] font-black uppercase text-zinc-500">{awayTeam.name}</span>
            <span className="text-3xl font-black text-white">{match.penalty_away_score}</span>
            {renderPenaltyDots(awayPens)}
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 pt-4 border-t border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase text-center tracking-widest">Nova Cobrança</p>
          
          <div className="flex gap-3">
            {[homeTeam, awayTeam].map(team => (
              <button key={team.championshipTeamId} onClick={() => setSelectedTeam(team.championshipTeamId)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                  selectedTeam === team.championshipTeamId ? "bg-blue-600/10 border-blue-500" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                )}>
                <span className="text-[11px] font-bold text-zinc-300 uppercase truncate w-full text-center">{team.name}</span>
              </button>
            ))}
          </div>

          {selectedTeam && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(selectedTeam === homeTeam.championshipTeamId ? homePlayers : awayPlayers).map(player => (
                  <button key={player.registrationId} onClick={() => setSelectedPlayer(player)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                      selectedPlayer?.registrationId === player.registrationId ? "bg-zinc-200 text-zinc-950 border-white" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600"
                    )}>
                    {player.name}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => addPenalty("scored")} disabled={loading}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20">
                  <Check className="h-5 w-5" /> GOL
                </button>
                <button onClick={() => addPenalty("missed")} disabled={loading}
                  className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-900/20">
                  <Target className="h-5 w-5" /> FORA
                </button>
                <button onClick={() => addPenalty("saved")} disabled={loading}
                  className="flex-1 h-12 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <Shield className="h-5 w-5" /> DEFESA
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Histórico de Cobranças</p>
        <div className="space-y-1">
          {[...penalties].reverse().map(p => {
            const team = p.teamId === homeTeam.championshipTeamId ? homeTeam : awayTeam;
            return (
              <div key={p.id} className="flex items-center gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50">
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs",
                  p.result === "scored" ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
                )}>
                  {p.result === "scored" ? "GOL" : "X"}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white uppercase">{team.name}</p>
                  <p className="text-[10px] text-zinc-500">{p.playerName ?? "Jogador desconhecido"}</p>
                </div>
                <span className="text-[10px] font-black text-zinc-600">#{p.shotOrder}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
