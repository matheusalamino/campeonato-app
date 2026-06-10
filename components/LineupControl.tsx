"use client";

import { useState, useEffect } from "react";
import { Users, AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchDetail, MatchPlayer } from "@/features/hooks/useMatchDetail";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const supabase = createClient();

const UNIFORM_COLORS = [
  { name: "Branco", value: "#FFFFFF" },
  { name: "Preto", value: "#000000" },
  { name: "Vermelho", value: "#EF4444" },
  { name: "Azul", value: "#3B82F6" },
  { name: "Verde", value: "#22C55E" },
  { name: "Amarelo", value: "#EAB308" },
  { name: "Laranja", value: "#F97316" },
  { name: "Roxo", value: "#A855F7" },
  { name: "Cinza", value: "#71717A" },
];

interface LineupControlProps {
  detail: MatchDetail;
  onSaved: () => void;
}

export function LineupControl({ detail, onSaved }: LineupControlProps) {
  const [activeTab, setActiveTab] = useState<"home" | "away">("home");
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Used when editing an already configured matchup

  const team = activeTab === "home" ? detail.homeTeam : detail.awayTeam;
  const players = activeTab === "home" ? detail.homePlayers : detail.awayPlayers;
  const teamLineup = detail.lineups.filter((l) => l.championshipTeamId === team.championshipTeamId);

  // Local state for editing
  const [localStarters, setLocalStarters] = useState<Set<string>>(new Set());
  const [localCaptain, setLocalCaptain] = useState<string | null>(null);
  const [localColor, setLocalColor] = useState<string | null>(null);

  // Helper to validate configuration for a team
  const checkTeamConfigured = (teamId: string) => {
    const isHome = teamId === detail.homeTeam.championshipTeamId;
    const lineup = detail.lineups.filter(l => l.championshipTeamId === teamId && l.isStarter);
    const color = isHome ? detail.homeTeam.uniformColor : detail.awayTeam.uniformColor;
    const teamPlayers = isHome ? detail.homePlayers : detail.awayPlayers;

    const selected = teamPlayers.filter(p => lineup.some(l => l.playerId === p.registrationId));
    const gkCount = selected.filter(p => p.position === "Goleiro").length;
    const fieldCount = selected.length - gkCount;

    return gkCount === 1 && fieldCount === 5 && !!color;
  };

  const homeConfigured = checkTeamConfigured(detail.homeTeam.championshipTeamId);
  const awayConfigured = checkTeamConfigured(detail.awayTeam.championshipTeamId);
  const isFullyConfigured = homeConfigured && awayConfigured;

  // Sync local state when tab changes, details change, or modal opens/closes
  useEffect(() => {
    const currentTeam = activeTab === "home" ? detail.homeTeam : detail.awayTeam;
    const currentPlayers = activeTab === "home" ? detail.homePlayers : detail.awayPlayers;
    const currentLineup = detail.lineups.filter((l) => l.championshipTeamId === currentTeam.championshipTeamId);

    const nextStarters = new Set(
      currentLineup
        .filter(l => l.isStarter && !detail.suspendedRegistrationIds.has(l.playerId))
        .map(l => l.playerId)
    );
    if (nextStarters.size === 0) {
      const gk = currentPlayers.find(p => p.position === "Goleiro");
      if (gk) nextStarters.add(gk.registrationId);
    }

    setLocalStarters(nextStarters);
    setLocalCaptain(currentLineup.find(l => l.isCaptain)?.playerId ?? null);
    setLocalColor(currentTeam.uniformColor);
  }, [activeTab, detail, isOpen]);

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
    const selectedPlayers = players.filter(p => localStarters.has(p.registrationId));

    // Block save if any selected player is suspended for this match
    const suspendedStarters = selectedPlayers.filter(p =>
      detail.suspendedRegistrationIds.has(p.registrationId)
    );
    if (suspendedStarters.length > 0) {
      const names = suspendedStarters.map(p => p.name).join(", ");
      toast.error(`Escalação inválida: jogador(es) suspenso(s) na titularidade — ${names}`);
      return;
    }

    // Validation: Exactly 1 GK + 5 Field (Total 6)
    const gkCount = selectedPlayers.filter(p => p.position === "Goleiro").length;
    const fieldCount = selectedPlayers.length - gkCount;

    if (gkCount !== 1 || fieldCount !== 5) {
      toast.error(`Escalação inválida: deve ter exatamente 1 goleiro e 5 jogadores de linha (Total: ${selectedPlayers.length}/6).`);
      return;
    }

    if (!localColor) {
      toast.error("Por favor, selecione a cor do uniforme.");
      return;
    }

    setSaving(true);
    
    // Delete existing lineups for this team in this match
    await supabase.from("match_lineups")
      .delete()
      .eq("knockout_match_id", detail.match.id)
      .eq("championship_team_id", team.championshipTeamId);

    // Update uniform color and team ID in match_slots
    await supabase.from("match_slots")
      .update({ 
        uniform_color: localColor,
        championship_team_id: team.championshipTeamId
      })
      .eq("match_id", detail.match.id)
      .eq("slot_order", activeTab === "home" ? 1 : 2);

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
    
    toast.success(`Escalação e cor salvas para o ${team.name}!`);
    setSaving(false);
    onSaved(); // reload in parent
  };

  const showModal = !isFullyConfigured || isOpen;

  // If already configured and modal is not open, show edit button
  if (isFullyConfigured && !isOpen) {
    return (
      <div className="flex justify-center p-2">
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-300 transition-all active:scale-95 shadow-md"
        >
          ✏️ Editar Escalações & Cores
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 shrink-0">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-zinc-300">
            <Users className="h-4 w-4 text-zinc-500" />
            Configurar Escalação
          </h3>
          {isFullyConfigured && (
            <button 
              onClick={() => setIsOpen(false)} 
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Global Progress Indicators */}
        <div className="bg-zinc-900/60 border-b border-zinc-800/80 px-5 py-3 flex items-center justify-between text-[11px] font-bold tracking-wider uppercase shrink-0">
          <div className="flex items-center gap-1.5">
            {homeConfigured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
            <span className={homeConfigured ? "text-emerald-400" : "text-zinc-400"}>
              {detail.homeTeam.name}
            </span>
          </div>
          <div className="text-zinc-600">vs</div>
          <div className="flex items-center gap-1.5">
            {awayConfigured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
            <span className={awayConfigured ? "text-emerald-400" : "text-zinc-400"}>
              {detail.awayTeam.name}
            </span>
          </div>
        </div>

        {/* Tabs for switching teams */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button 
            onClick={() => setActiveTab("home")} 
            className={cn(
              "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all", 
              activeTab === "home" ? "bg-zinc-900 text-white font-black" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            )}
          >
            {detail.homeTeam.name}
          </button>
          <button 
            onClick={() => setActiveTab("away")} 
            className={cn(
              "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-l border-zinc-800", 
              activeTab === "away" ? "bg-zinc-900 text-white font-black" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            )}
          >
            {detail.awayTeam.name}
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-5 bg-zinc-900/10 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-zinc-500 font-medium">Selecione 1 Goleiro + 5 Linha e defina o Capitão.</p>
              <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full shrink-0">
                {localStarters.size} / 6
              </span>
            </div>

            <div className="space-y-1">
              {players.map(p => {
                const isStarter = localStarters.has(p.registrationId);
                const isCaptain = localCaptain === p.registrationId;
                const isGK = p.position === "Goleiro";
                const isSuspended = detail.suspendedRegistrationIds.has(p.registrationId);
                const isBooked = !isSuspended && detail.bookedRegistrationIds.has(p.registrationId);
                return (
                  <div key={p.registrationId} className={cn(
                    "flex items-center justify-between p-2 rounded-lg border transition-all",
                    isSuspended
                      ? "bg-red-900/10 border-red-900/40"
                      : isStarter
                        ? "bg-blue-600/10 border-blue-500/30"
                        : "bg-zinc-900/50 border-zinc-800/50 hover:border-zinc-700"
                  )}>
                    <label className={cn("flex items-center gap-3 flex-1", isSuspended ? "cursor-not-allowed" : "cursor-pointer")}>
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 border border-zinc-700">
                        {isStarter && !isSuspended && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
                      </div>
                      <input
                        type="checkbox"
                        checked={isStarter && !isSuspended}
                        onChange={() => !isSuspended && toggleStarter(p.registrationId)}
                        disabled={isSuspended}
                        className="sr-only"
                      />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("text-sm font-bold", isSuspended ? "text-red-400" : isStarter ? "text-white" : "text-zinc-400")}>
                            {p.name}
                          </span>
                          {isSuspended && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-900/60 text-red-400 uppercase tracking-wide">
                              Suspenso
                            </span>
                          )}
                          {isBooked && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-yellow-900/60 text-yellow-400 uppercase tracking-wide">
                              Pendurado
                            </span>
                          )}
                        </div>
                        {p.position && <span className={cn("text-[10px] uppercase tracking-widest", isGK ? "text-amber-500 font-bold" : "text-zinc-500")}>{p.position}</span>}
                        {isSuspended && isStarter && (
                          <span className="text-[10px] text-amber-400 font-semibold">⚠️ Suspenso — remova da escalação</span>
                        )}
                      </div>
                    </label>
                    {isStarter && !isSuspended && (
                      <button onClick={() => setCaptain(p.registrationId)} className={cn("px-2 py-1 rounded text-[10px] font-black transition-all ml-2", isCaptain ? "bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.4)]" : "bg-zinc-800 text-zinc-500 hover:text-yellow-500")}>
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
          </div>

          {/* Uniform Color Selector */}
          <div className="pt-4 border-t border-zinc-800/80">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Cor do Uniforme</p>
            <div className="flex flex-wrap gap-2">
              {UNIFORM_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setLocalColor(c.value)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-all hover:scale-110",
                    localColor === c.value ? "border-blue-500 scale-110" : "border-zinc-800"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950">
          <button 
            onClick={saveLineup} 
            disabled={saving} 
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50 uppercase tracking-wider"
          >
            {saving ? "Salvando..." : `Salvar Escalação do ${team.name}`}
          </button>
          {!isFullyConfigured && (
            <p className="mt-2 text-center text-[10px] text-red-400 font-semibold">
              ⚠️ Ambas as equipes precisam ser escaladas e coloridas antes de prosseguir.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
