"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, Clock, CheckCircle2, ChevronRight,
  Plus, Trash2, Target, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useMatchDetail, formatTime, type MatchPlayer, type MatchDetail } from "@/features/hooks/useMatchDetail";
import { useMatchStatus } from "@/features/hooks/useMatchStatus";
import { PenaltyShootoutControl } from "@/components/PenaltyShootoutControl";
import { LineupControl } from "@/components/LineupControl";
import { cn } from "@/lib/utils";
import type { MatchPeriod } from "@/types/championship";

const supabase = createClient();

// ─── EVENT ICONS ────────────────────────────────────────────────────────────
const EVENT_META: Record<string, { icon: string; label: string; color: string }> = {
  GOAL:             { icon: "⚽", label: "Gol",          color: "text-emerald-400" },
  ASSIST:           { icon: "🅰️", label: "Assistência",  color: "text-blue-400" },
  YELLOW_CARD:      { icon: "🟨", label: "Amarelo",      color: "text-yellow-400" },
  RED_CARD:         { icon: "🟥", label: "Vermelho",     color: "text-red-400" },
  BLUE_CARD:        { icon: "🟦", label: "Azul",         color: "text-blue-400" },
  FOUL:             { icon: "👊", label: "Falta",        color: "text-orange-400" },
  SAVE:             { icon: "🥅", label: "Defesa",       color: "text-purple-400" },
  SUBSTITUTION_OUT: { icon: "🔄", label: "Substituição", color: "text-zinc-400" },
  SUBSTITUTION_IN:  { icon: "🔄", label: "Entra",        color: "text-zinc-400" },
  OWN_GOAL:         { icon: "🔴", label: "Gol Contra",   color: "text-red-400" },
};

const PERIOD_LABELS: Record<MatchPeriod, string> = {
  not_started:    "Não Iniciado",
  period_1:       "1º Tempo",
  halftime:       "Intervalo",
  period_2:       "2º Tempo",
  extra_1:        "Prorr. 1º",
  extra_halftime: "Interv. Prorr.",
  extra_2:        "Prorr. 2º",
  penalties:      "Pênaltis",
  finished:       "Encerrado",
};

// ─── PERIOD CONTROLS ────────────────────────────────────────────────────────
function PeriodControls({ detail, elapsed, reload }: { detail: MatchDetail; elapsed: number; reload: () => void }) {
  const { match } = detail;
  const [loading, setLoading] = useState(false);
  const { startMatch, endCurrentPeriod, startNextPeriod } = useMatchStatus({ championshipId: match.championship_id ?? "" });

  const homeLineupCount = detail.lineups.filter(l => l.championshipTeamId === detail.homeTeam.championshipTeamId && l.isStarter).length;
  const awayLineupCount = detail.lineups.filter(l => l.championshipTeamId === detail.awayTeam.championshipTeamId && l.isStarter).length;
  const canStart = homeLineupCount > 0 && awayLineupCount > 0;

  async function handleAction(action: () => Promise<{ success: boolean; message?: string }>) {
    setLoading(true);
    const result = await action();
    setLoading(false);
    if (!result.success) { toast.error(result.message ?? "Erro"); return; }
    reload();
  }

  const p = match.current_period as MatchPeriod;
  const isRest = p === "halftime" || p === "extra_halftime";
  const isActive = p === "period_1" || p === "period_2" || p === "extra_1" || p === "extra_2" || p === "penalties";

  if (match.status === "COMPLETED") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {p === "not_started" && (
        <div className="flex items-center gap-3">
          <button onClick={() => handleAction(() => startMatch(match.id))} disabled={loading || !canStart}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 disabled:opacity-50 transition-all">
            ▶ Iniciar {PERIOD_LABELS[p] === "Não Iniciado" ? "1º Tempo" : ""}
          </button>
          {!canStart && <span className="text-xs text-amber-500 font-medium">⚠️ Defina a escalação</span>}
        </div>
      )}
      {isActive && (
        <button onClick={() => handleAction(() => endCurrentPeriod(detail.match as Parameters<typeof endCurrentPeriod>[0]))} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-50 transition-all">
          ⏸ Encerrar {PERIOD_LABELS[p]}
        </button>
      )}
      {isRest && (
        <button onClick={() => handleAction(() => startNextPeriod(detail.match as Parameters<typeof startNextPeriod>[0]))} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition-all">
          ▶ Iniciar {p === "halftime" ? "2º Tempo" : "Prorr. 2º"}
        </button>
      )}
    </div>
  );
}

// ─── ADD EVENT SHEET ─────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "GOAL", icon: "⚽", label: "Gol" },
  { type: "YELLOW_CARD", icon: "🟨", label: "Amarelo" },
  { type: "RED_CARD", icon: "🟥", label: "Vermelho" },
  { type: "BLUE_CARD", icon: "🟦", label: "Azul" },
  { type: "FOUL", icon: "👊", label: "Falta" },
  { type: "SAVE", icon: "🥅", label: "Defesa" },
  { type: "SUBSTITUTION", icon: "🔄", label: "Substituição" },
  { type: "OWN_GOAL", icon: "🔴", label: "G. Contra" },
];

function getTeamCurrentLineup(teamId: string, detail: MatchDetail) {
  const teamPlayers = teamId === detail.homeTeam.championshipTeamId ? detail.homePlayers : detail.awayPlayers;
  const starters = new Set(detail.lineups.filter(l => l.championshipTeamId === teamId && l.isStarter).map(l => l.playerId));
  
  const currentOnField = new Set(Array.from(starters));
  
  // Sort substitutions by time or creation
  const subs = detail.events
    .filter(e => e.teamId === teamId && e.eventType === "SUBSTITUTION")
    .sort((a, b) => a.eventTimeS - b.eventTimeS);
    
  subs.forEach(s => {
    if (s.playerId) currentOnField.delete(s.playerId); // player out
    if (s.playerInId) currentOnField.add(s.playerInId); // player in
  });
  
  const onField = teamPlayers.filter(p => currentOnField.has(p.registrationId));
  const bench = teamPlayers.filter(p => !currentOnField.has(p.registrationId));
  
  return { onField, bench };
}

function AddEventSheet({ detail, elapsed, onClose, onSaved }: {
  detail: MatchDetail; elapsed: number; onClose: () => void; onSaved: () => void;
}) {
  const [step, setStep] = useState<number>(1);
  const [eventType, setEventType] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [player, setPlayer] = useState<MatchPlayer | null>(null);
  const [assistPlayer, setAssistPlayer] = useState<MatchPlayer | null>(null);
  const [playerIn, setPlayerIn] = useState<MatchPlayer | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { onField, bench } = getTeamCurrentLineup(teamId, detail);
  
  // Decide which list to show based on step and event type
  let playersToPick = onField;
  if (eventType === "SUBSTITUTION") {
    if (step === 3) playersToPick = onField; // Who is going out
    else if (step === 3.6) playersToPick = bench; // Who is coming in
  } else {
    // Goals, cards, saves, fouls, etc - usually by players on the field
    playersToPick = onField;
  }

  const filtered = playersToPick.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  // For assist, exclude the already selected primary player
  const filteredSecondary = onField.filter(p => 
    p.registrationId !== player?.registrationId && 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("match_events_v2").insert({
      knockout_match_id: detail.match.id,
      team_id: teamId,
      player_id: player?.registrationId ?? null,
      assist_player_id: assistPlayer?.registrationId ?? null,
      player_in_id: playerIn?.registrationId ?? null,
      event_type: eventType,
      event_time_s: elapsed,
      period: detail.match.current_period,
    });
    if (error) { setSaving(false); toast.error("Erro ao salvar evento"); return; }

    // If it's a scoring event, sync the DB score column so other screens stay up-to-date
    if (eventType === "GOAL" || eventType === "OWN_GOAL") {
      const { data: allGoals } = await supabase
        .from("match_events_v2")
        .select("event_type, team_id")
        .eq("knockout_match_id", detail.match.id)
        .is("deleted_at", null)
        .in("event_type", ["GOAL", "OWN_GOAL"]);

      const homeCT = detail.homeTeam.championshipTeamId;
      const awayCT = detail.awayTeam.championshipTeamId;
      const newHome = (allGoals ?? []).filter(
        (e) => (e.event_type === "GOAL" && e.team_id === homeCT) || (e.event_type === "OWN_GOAL" && e.team_id === awayCT)
      ).length;
      const newAway = (allGoals ?? []).filter(
        (e) => (e.event_type === "GOAL" && e.team_id === awayCT) || (e.event_type === "OWN_GOAL" && e.team_id === homeCT)
      ).length;

      await supabase
        .from("knockout_matches")
        .update({ home_score: newHome, away_score: newAway })
        .eq("id", detail.match.id);
    }

    setSaving(false);
    toast.success(`${EVENT_META[eventType]?.label ?? eventType} registrado em ${formatTime(elapsed)}`);
    onSaved();
    onClose();
  }

  function handleTypeSelect(type: string) {
    setEventType(type);
    setStep(2);
  }

  function handlePlayerSelect(p: MatchPlayer) {
    setPlayer(p);
    setSearch("");
    if (eventType === "GOAL") setStep(3.5); // prompt assist
    else if (eventType === "SUBSTITUTION") setStep(3.6); // prompt player in
    else setStep(4);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Novo Evento</h3>
            <span className="font-mono text-zinc-400">{formatTime(elapsed)}</span>
          </div>

          {/* Step 1: Event type */}
          {step === 1 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Selecione o tipo de evento</p>
              <div className="grid grid-cols-3 gap-2">
                {EVENT_TYPES.map((e) => (
                  <button key={e.type} onClick={() => handleTypeSelect(e.type)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-xs hover:border-blue-500 hover:bg-zinc-700 transition-all active:scale-95">
                    <span className="text-xl">{e.icon}</span>
                    <span className="text-zinc-300 font-medium">{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Team */}
          {step === 2 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                {EVENT_META[eventType]?.icon} {EVENT_META[eventType]?.label} — Selecione o time
              </p>
              <div className="flex gap-3">
                {[detail.homeTeam, detail.awayTeam].map((team, index) => (
                  <button key={`team-${index}-${team.championshipTeamId}`} onClick={() => { setTeamId(team.championshipTeamId); setStep(3); }}
                    className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 p-4 hover:border-blue-500 hover:bg-zinc-700 transition-all active:scale-95">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700">
                      {team.logoUrl ? <img src={team.logoUrl} alt={team.name} className="h-full w-full rounded-full object-cover" /> : <Shield className="h-6 w-6 text-zinc-500" />}
                    </div>
                    <span className="text-sm font-bold text-white uppercase tracking-wide text-center">{team.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3: Player Out / Goal Scorer / Player */}
          {step === 3 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                {eventType === "SUBSTITUTION" ? "Quem está saindo?" : "Selecione o jogador"}
              </p>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar jogador..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filtered.map((p) => (
                  <button key={p.registrationId} onClick={() => handlePlayerSelect(p)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                        {p.number && <span className="text-[10px] text-zinc-600 font-mono">#{p.number}</span>}
                      </div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nenhum jogador cadastrado para este time.</p>}
              </div>
              <button onClick={() => setStep(2)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.5: Goal Assist Prompt */}
          {step === 3.5 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300 text-center">Houve assistência no gol?</p>
              <div className="flex gap-3">
                <button onClick={() => { setAssistPlayer(null); setStep(4); }}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-4 text-sm font-bold text-zinc-300 hover:border-zinc-500 transition-all">
                  Não
                </button>
                <button onClick={() => setStep(3.51)}
                  className="flex-1 rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20">
                  Sim
                </button>
              </div>
              <button onClick={() => setStep(3)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.51: Pick Assist Player */}
          {step === 3.51 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Quem deu a assistência?</p>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar assistente..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredSecondary.map((p) => (
                  <button key={p.registrationId} onClick={() => { setAssistPlayer(p); setStep(4); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(3.5)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.6: Substitution Pick Player In */}
          {step === 3.6 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Quem está entrando?</p>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar jogador..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filtered.map((p) => (
                  <button key={p.registrationId} onClick={() => { setPlayerIn(p); setStep(4); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                      </div>
                      {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(3)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar evento</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Tipo</span>
                  <span className="font-bold text-white">{EVENT_META[eventType]?.icon} {EVENT_META[eventType]?.label}</span>
                </div>
                
                {eventType === "SUBSTITUTION" ? (
                  <>
                    <div className="flex justify-between"><span className="text-zinc-400">Saiu</span><span className="font-bold text-red-400">{player?.name ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Entrou</span><span className="font-bold text-emerald-400">{playerIn?.name ?? "—"}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-zinc-400">Jogador</span><span className="font-bold text-white">{player?.name ?? "—"}</span></div>
                    {eventType === "GOAL" && assistPlayer && (
                      <div className="flex justify-between"><span className="text-zinc-400">Assistência</span><span className="font-bold text-zinc-300">{assistPlayer.name}</span></div>
                    )}
                  </>
                )}
                
                <div className="flex justify-between border-t border-zinc-800 pt-2"><span className="text-zinc-400">Tempo</span><span className="font-mono font-bold text-blue-400">{formatTime(elapsed)}</span></div>
              </div>
              
              <div className="mt-5 flex gap-3">
                <button onClick={() => {
                  if (eventType === "GOAL") setStep(assistPlayer ? 3.51 : 3.5);
                  else if (eventType === "SUBSTITUTION") setStep(3.6);
                  else setStep(3);
                }} className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider">
                  Voltar
                </button>
                <button onClick={save} disabled={saving} className="flex-[2] rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-500 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-emerald-900/20">
                  {saving ? "Salvando..." : "✅ Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EVENT LIST ──────────────────────────────────────────────────────────────
function EventList({ detail, readonly }: { detail: MatchDetail; readonly: boolean }) {
  async function deleteEvent(eventId: string) {
    if (!confirm("Remover este evento?")) return;
    await supabase.from("match_events_v2").update({ deleted_at: new Date().toISOString() }).eq("id", eventId);
    toast.success("Evento removido");
  }

  if (detail.events.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-600">Nenhum evento registrado</p>;
  }

  return (
    <div className="space-y-1">
      {[...detail.events].reverse().map((ev) => {
        const meta = EVENT_META[ev.eventType] ?? { icon: "•", label: ev.eventType, color: "text-zinc-400" };
        const isHome = ev.teamId === detail.homeTeam.championshipTeamId;
        return (
          <div key={ev.id} className={cn("flex gap-3", isHome ? "flex-row" : "flex-row-reverse text-right")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg border border-zinc-700/50 shadow-inner mt-1">
              {meta.icon}
            </div>
            <div className="flex flex-col justify-center flex-1">
              <div className={cn("flex items-center gap-2", isHome ? "justify-start" : "justify-end")}>
                <span className="text-sm font-bold text-white">{ev.playerName ?? "Desconhecido"}</span>
                {ev.eventType === "SUBSTITUTION" && ev.playerInName && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <span className="text-zinc-500">→</span> {ev.playerInName}
                  </span>
                )}
              </div>
              <div className={cn("flex items-center gap-2 text-xs", isHome ? "justify-start" : "justify-end")}>
                <span className={cn("font-medium", meta.color)}>{meta.label}</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono text-zinc-500">{formatTime(ev.eventTimeS)}</span>
                {ev.eventType === "GOAL" && ev.assistPlayerName && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">🅰️ <span className="font-medium text-zinc-300">{ev.assistPlayerName}</span></span>
                  </>
                )}
              </div>
            </div>
            {!readonly && (
              <button onClick={() => void deleteEvent(ev.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-colors self-center">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SCOREBOARD ──────────────────────────────────────────────────────────────
function Scoreboard({ detail, elapsed }: { detail: MatchDetail; elapsed: number }) {
  const { match, homeTeam, awayTeam } = detail;
  const period = match.current_period as MatchPeriod;
  const isLive = match.status === "IN_PROGRESS";
  const isFinished = match.status === "COMPLETED";
  const showTimer = isLive && period !== "halftime" && period !== "extra_halftime";

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border p-6 text-center",
      isLive ? "border-red-500/30 bg-gradient-to-b from-zinc-900 to-red-950/10" : "border-zinc-800 bg-zinc-900")}>
      {isLive && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent" />}

      {/* Period label */}
      <div className="mb-3 flex items-center justify-center gap-2">
        {isLive && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
        <span className={cn("text-xs font-bold uppercase tracking-[0.2em]", isLive ? "text-red-400" : "text-zinc-500")}>
          {isFinished ? "Encerrado" : PERIOD_LABELS[period]}
        </span>
      </div>

      {/* Teams + Score */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-700 overflow-hidden">
              {homeTeam.logoUrl ? <img src={homeTeam.logoUrl} alt={homeTeam.name} className="h-full w-full object-cover" /> : <Shield className="h-7 w-7 text-zinc-500" />}
            </div>
            {homeTeam.uniformColor && (
              <div 
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-zinc-900 shadow-lg"
                style={{ backgroundColor: homeTeam.uniformColor }}
                title={`Uniforme: ${homeTeam.uniformColor}`}
              />
            )}
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-white max-w-[80px] truncate">{homeTeam.name}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black tabular-nums text-white">{match.home_score}</span>
            <span className="text-2xl font-bold text-zinc-600">×</span>
            <span className="text-5xl font-black tabular-nums text-white">{match.away_score}</span>
          </div>
          {showTimer && (
            <span className="font-mono text-sm font-semibold text-blue-400">{formatTime(elapsed)}</span>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 ring-2 ring-zinc-700 overflow-hidden">
              {awayTeam.logoUrl ? <img src={awayTeam.logoUrl} alt={awayTeam.name} className="h-full w-full object-cover" /> : <Shield className="h-7 w-7 text-zinc-500" />}
            </div>
            {awayTeam.uniformColor && (
              <div 
                className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-zinc-900 shadow-lg"
                style={{ backgroundColor: awayTeam.uniformColor }}
                title={`Uniforme: ${awayTeam.uniformColor}`}
              />
            )}
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-white max-w-[80px] truncate">{awayTeam.name}</span>
        </div>
      </div>

      {/* Penalties */}
      {(match.penalty_home_score > 0 || match.penalty_away_score > 0) && (
        <p className="mt-2 text-xs text-zinc-500">
          Pênaltis: {match.penalty_home_score} × {match.penalty_away_score}
        </p>
      )}
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { detail, loading, elapsed, reload } = useMatchDetail(id);
  const [showAddEvent, setShowAddEvent] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-zinc-500">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Jogo não encontrado</p>
      </div>
    );
  }

  const isCompleted = detail.match.status === "COMPLETED";
  const isInProgress = detail.match.status === "IN_PROGRESS";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-20 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {isCompleted && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Súmula Oficial
          </span>
        )}
      </div>

      {/* Scoreboard */}
      <Scoreboard detail={detail} elapsed={elapsed} />

      {/* Escalação (Only when not started) */}
      {!isInProgress && !isCompleted && detail.match.current_period === "not_started" && (
        <LineupControl detail={detail} onSaved={reload} />
      )}

      {/* Controls (only when not completed) */}
      {!isCompleted && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <PeriodControls detail={detail} elapsed={elapsed} reload={reload} />
            {isInProgress && detail.match.current_period !== "penalties" && (
              <button onClick={() => setShowAddEvent(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-500 transition-all">
                <Plus className="h-4 w-4" /> Evento
              </button>
            )}
          </div>

          {/* Penalty Control Overlay */}
          {detail.match.current_period === "penalties" && (
            <PenaltyShootoutControl detail={detail} reload={reload} />
          )}
        </>
      )}

      {/* Events (Hide when in penalties to focus) */}
      {detail.match.current_period !== "penalties" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <Target className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Eventos</h2>
            <span className="ml-auto text-xs text-zinc-600">{detail.events.length} registros</span>
          </div>
          <div className="p-2">
            <EventList detail={detail} readonly={isCompleted} />
          </div>
        </div>
      )}

      {/* Stats summary (goals per team) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <ChevronRight className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-300">Resumo</h2>
        </div>
        <div className="grid grid-cols-2 divide-x divide-zinc-800 p-4 text-center">
          {[{ team: detail.homeTeam, side: "home" }, { team: detail.awayTeam, side: "away" }].map(({ team, side }) => {
            const goals = detail.events.filter((e) => e.teamId === team.championshipTeamId && e.eventType === "GOAL").length;
            const yellows = detail.events.filter((e) => e.teamId === team.championshipTeamId && e.eventType === "YELLOW_CARD").length;
            const reds = detail.events.filter((e) => e.teamId === team.championshipTeamId && e.eventType === "RED_CARD").length;
            return (
              <div key={side} className="space-y-1 px-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 truncate">{team.name}</p>
                <p className="text-lg font-black text-white">{goals} <span className="text-sm font-normal text-zinc-500">gols</span></p>
                <p className="text-xs text-zinc-500">🟨 {yellows} · 🟥 {reds}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duration info (completed) */}
      {isCompleted && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Duração dos Tempos
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {detail.match.period_1_duration_s !== null && <div className="flex justify-between"><span className="text-zinc-400">1º Tempo</span><span className="font-mono font-semibold">{formatTime(detail.match.period_1_duration_s)}</span></div>}
            {detail.match.period_2_duration_s !== null && <div className="flex justify-between"><span className="text-zinc-400">2º Tempo</span><span className="font-mono font-semibold">{formatTime(detail.match.period_2_duration_s)}</span></div>}
            {detail.match.extra_1_duration_s !== null && <div className="flex justify-between"><span className="text-zinc-400">Prorr. 1º</span><span className="font-mono font-semibold">{formatTime(detail.match.extra_1_duration_s)}</span></div>}
            {detail.match.extra_2_duration_s !== null && <div className="flex justify-between"><span className="text-zinc-400">Prorr. 2º</span><span className="font-mono font-semibold">{formatTime(detail.match.extra_2_duration_s)}</span></div>}
          </div>
        </div>
      )}

      {/* Add event sheet */}
      {showAddEvent && (
        <AddEventSheet detail={detail} elapsed={elapsed} onClose={() => setShowAddEvent(false)} onSaved={reload} />
      )}
    </div>
  );
}
