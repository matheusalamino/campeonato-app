"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowUpDown, Hand, Shield, ShieldCheck, Clock, CheckCircle2, ChevronRight,
  Plus, Trash2, Target, AlertCircle, Square, Star, ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useMatchDetail, formatTime, type MatchPlayer, type MatchDetail, type MatchEventItem } from "@/features/hooks/useMatchDetail";
import { addMatchEvent, removeMatchEvent, addPenaltyEvent } from "@/services/match-events.service";
import { useMatchStatus } from "@/features/hooks/useMatchStatus";
import { PenaltyShootoutControl } from "@/components/PenaltyShootoutControl";
import { LineupControl } from "@/components/LineupControl";
import { MatchFieldView } from "@/components/MatchFieldView";
import { cn } from "@/lib/utils";
import type { MatchPeriod } from "@/types/championship";
import { BestPlayerVoteModal } from "@/components/BestPlayerVoteModal";
import type { ExistingVote } from "@/types/best-player";

const supabase = createClient();

// ─── EVENT ICONS ────────────────────────────────────────────────────────────
type EventIconKind =
  | "goal"
  | "own-goal"
  | "assist"
  | "yellow-card"
  | "second-yellow"
  | "red-card"
  | "foul"
  | "save"
  | "substitution"
  | "penalty"
  | "penalty-out";

const EVENT_META: Record<string, { icon: EventIconKind; label: string; color: string }> = {
  GOAL:             { icon: "goal",         label: "Gol",          color: "text-emerald-400" },
  ASSIST:           { icon: "assist",       label: "Assistência",  color: "text-blue-400" },
  YELLOW_CARD:      { icon: "yellow-card",  label: "Amarelo",      color: "text-yellow-400" },
  RED_CARD:         { icon: "red-card",     label: "Vermelho",     color: "text-red-400" },
  FOUL:             { icon: "foul",         label: "Falta",        color: "text-orange-400" },
  SAVE:             { icon: "save",         label: "Defesa",       color: "text-purple-400" },
  SUBSTITUTION_OUT: { icon: "substitution", label: "Substituição", color: "text-zinc-400" },
  SUBSTITUTION_IN:  { icon: "substitution", label: "Entra",        color: "text-zinc-400" },
  SUBSTITUTION:     { icon: "substitution", label: "Substituição", color: "text-zinc-400" },
  OWN_GOAL:         { icon: "own-goal",     label: "Gol Contra",   color: "text-red-400" },
  PENALTY:          { icon: "penalty",      label: "Pênalti",      color: "text-violet-400" },
  PENALTY_GOAL:     { icon: "goal",         label: "Gol",          color: "text-emerald-400" },
  PENALTY_OUT:      { icon: "penalty-out",  label: "Pênalti",      color: "text-zinc-400" },
  PENALTY_SAVED:    { icon: "save",         label: "Pênalti Def.", color: "text-zinc-400" },
};

function SoccerBallIcon({
  className,
  ballColor = "currentColor",
  seamColor = "currentColor",
}: {
  className?: string;
  ballColor?: string;
  seamColor?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <circle cx="12" cy="12" r="9" fill={ballColor} opacity="0.14" />
      <circle cx="12" cy="12" r="9" stroke={ballColor} strokeWidth="1.8" />
      <path
        d="M12 7.2 15.5 9.7 14.2 13.8H9.8L8.5 9.7 12 7.2Z"
        stroke={seamColor}
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 9.7 5.1 8.9M15.5 9.7l3.4-.8M9.8 13.8l-2 3M14.2 13.8l2 3M12 7.2V3.4"
        stroke={seamColor}
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EventIcon({
  icon,
  className = "h-5 w-5",
}: {
  icon: EventIconKind;
  className?: string;
}) {
  if (icon === "goal") return <SoccerBallIcon className={className} />;
  if (icon === "own-goal") return <SoccerBallIcon className={className} ballColor="#f8fafc" seamColor="#f87171" />;
  if (icon === "substitution") return <ArrowUpDown className={className} strokeWidth={2.4} />;
  if (icon === "penalty") return <Target className={className} strokeWidth={2.2} />;
  if (icon === "penalty-out") return <ArrowUpRight className={className} strokeWidth={2.2} />;
  if (icon === "foul") return <Hand className={className} strokeWidth={2.4} />;
  if (icon === "save") return <ShieldCheck className={className} strokeWidth={2.4} />;
  if (icon === "assist") {
    return (
      <span className={cn("inline-flex items-center justify-center font-black leading-none", className)}>
        A
      </span>
    );
  }
  if (icon === "second-yellow") {
    return (
      <span className={cn("relative inline-flex items-center justify-center", className)}>
        <Square className="absolute left-[1px] top-[1px] h-[72%] w-[72%] fill-current text-yellow-400" strokeWidth={2.2} />
        <Square className="absolute bottom-[1px] right-[1px] h-[72%] w-[72%] fill-current text-red-400" strokeWidth={2.2} />
      </span>
    );
  }

  return (
    <Square
      className={cn(
        className,
        icon === "yellow-card" && "fill-current",
        icon === "red-card" && "fill-current",
      )}
      strokeWidth={2.2}
    />
  );
}

function EventIconByType({ type, className }: { type: string; className?: string }) {
  const meta = EVENT_META[type];
  if (!meta) return <span className={cn("inline-block rounded-full bg-current", className)} />;
  return <EventIcon icon={meta.icon} className={className} />;
}

function sortMatchEventsChronologically(events: MatchDetail["events"]) {
  return [...events].sort(
    (a, b) =>
      a.eventTimeS - b.eventTimeS ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function getSecondYellowEventIds(events: MatchDetail["events"]) {
  const yellowCounts = new Map<string, number>();
  const secondYellowIds = new Set<string>();

  for (const event of sortMatchEventsChronologically(events)) {
    if (event.eventType !== "YELLOW_CARD" || !event.playerId) continue;

    const nextCount = (yellowCounts.get(event.playerId) ?? 0) + 1;
    yellowCounts.set(event.playerId, nextCount);

    if (nextCount >= 2) secondYellowIds.add(event.id);
  }

  return secondYellowIds;
}

function getExpelledPlayerIds(events: MatchDetail["events"], teamId: string) {
  const yellowCounts = new Map<string, number>();
  const expelled = new Set<string>();

  for (const event of sortMatchEventsChronologically(events)) {
    if (event.teamId !== teamId || !event.playerId) continue;

    if (event.eventType === "RED_CARD") {
      expelled.add(event.playerId);
      continue;
    }

    if (event.eventType === "YELLOW_CARD") {
      const nextCount = (yellowCounts.get(event.playerId) ?? 0) + 1;
      yellowCounts.set(event.playerId, nextCount);

      if (nextCount >= 2) expelled.add(event.playerId);
    }
  }

  return expelled;
}

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
  const { startMatch, endCurrentPeriod, startNextPeriod } = useMatchStatus({
    championshipId: match.championship_id ?? "",
    hasPenalties: detail.hasPenalties,
    hasExtraTime: detail.hasExtraTime,
  });

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
  // Exclude "penalties" — PenaltyShootoutControl handles auto-finishing the penalty period
  const isActive = p === "period_1" || p === "period_2" || p === "extra_1" || p === "extra_2";

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

// ─── SCORE SYNC ──────────────────────────────────────────────────────────────
async function resyncScore(matchId: string, homeCT: string, awayCT: string) {
  const { data: allGoals } = await supabase
    .from("match_events_v2")
    .select("event_type, team_id")
    .eq("knockout_match_id", matchId)
    .is("deleted_at", null)
    .in("event_type", ["GOAL", "OWN_GOAL", "PENALTY_GOAL"]);

  const newHome = (allGoals ?? []).filter(
    (e) =>
      ((e.event_type === "GOAL" || e.event_type === "PENALTY_GOAL") && e.team_id === homeCT) ||
      (e.event_type === "OWN_GOAL" && e.team_id === awayCT),
  ).length;
  const newAway = (allGoals ?? []).filter(
    (e) =>
      ((e.event_type === "GOAL" || e.event_type === "PENALTY_GOAL") && e.team_id === awayCT) ||
      (e.event_type === "OWN_GOAL" && e.team_id === homeCT),
  ).length;

  await supabase
    .from("knockout_matches")
    .update({ home_score: newHome, away_score: newAway })
    .eq("id", matchId);
}

// ─── ADD EVENT SHEET ─────────────────────────────────────────────────────────
const EVENT_TYPES = [
  { type: "GOAL", label: "Gol" },
  { type: "OWN_GOAL", label: "G. Contra" },
  { type: "YELLOW_CARD", label: "Amarelo" },
  { type: "RED_CARD", label: "Vermelho" },
  { type: "FOUL", label: "Falta" },
  { type: "PENALTY", label: "Pênalti" },
  { type: "SUBSTITUTION", label: "Substituição" },
];

function getTeamCurrentLineup(teamId: string, detail: MatchDetail) {
  const teamPlayers = (teamId === detail.homeTeam.championshipTeamId ? detail.homePlayers : detail.awayPlayers)
    .filter(p => !detail.suspendedRegistrationIds.has(p.registrationId));
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

  const expelled = getExpelledPlayerIds(detail.events, teamId);
  
  // Remove expelled players from current on-field set
  expelled.forEach(id => currentOnField.delete(id));
  
  const onField = teamPlayers.filter(p => currentOnField.has(p.registrationId) && !expelled.has(p.registrationId));
  const bench = teamPlayers.filter(p => !currentOnField.has(p.registrationId) && !expelled.has(p.registrationId));
  
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
  const [penaltyOutcome, setPenaltyOutcome] = useState<"PENALTY_GOAL" | "PENALTY_OUT" | "PENALTY_SAVED" | null>(null);
  const [goalkeeper, setGoalkeeper] = useState<MatchPlayer | null>(null);

  const { onField, bench } = getTeamCurrentLineup(teamId, detail);

  const opposingTeamId =
    teamId === detail.homeTeam.championshipTeamId
      ? detail.awayTeam.championshipTeamId
      : detail.homeTeam.championshipTeamId;
  const { onField: opposingOnField } = getTeamCurrentLineup(opposingTeamId || detail.awayTeam.championshipTeamId, detail);
  const filteredGoalkeeper = opposingOnField.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

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
    try {
      if (eventType === "PENALTY") {
        if (!penaltyOutcome || !player) { setSaving(false); return; }
        await addPenaltyEvent({
          knockoutMatchId: detail.match.id,
          championshipId: detail.match.championship_id ?? "",
          teamId,
          registrationId: player.registrationId,
          eventTimeS: elapsed,
          period: detail.match.current_period,
          outcome: penaltyOutcome,
          goalkeeperRegistrationId: penaltyOutcome === "PENALTY_SAVED" ? goalkeeper?.registrationId ?? null : null,
        });
        if (penaltyOutcome === "PENALTY_GOAL") {
          await resyncScore(detail.match.id, detail.homeTeam.championshipTeamId, detail.awayTeam.championshipTeamId);
        }
      } else {
        await addMatchEvent({
          knockoutMatchId: detail.match.id,
          teamId,
          registrationId: player?.registrationId ?? null,
          eventType,
          eventTimeS: elapsed,
          period: detail.match.current_period,
          assistPlayerId: assistPlayer?.registrationId ?? null,
          playerInId: playerIn?.registrationId ?? null,
          championshipId: detail.match.championship_id ?? "",
        });
        if (eventType === "GOAL" || eventType === "OWN_GOAL") {
          await resyncScore(detail.match.id, detail.homeTeam.championshipTeamId, detail.awayTeam.championshipTeamId);
        }
      }
    } catch {
      setSaving(false);
      toast.error("Erro ao salvar evento");
      return;
    }

    setSaving(false);
    const label =
      eventType === "PENALTY"
        ? penaltyOutcome === "PENALTY_GOAL"
          ? "Gol de pênalti"
          : penaltyOutcome === "PENALTY_SAVED"
          ? "Pênalti defendido"
          : "Pênalti (fora)"
        : (EVENT_META[eventType]?.label ?? eventType);
    toast.success(`${label} registrado em ${formatTime(elapsed)}`);
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
    if (eventType === "GOAL") setStep(3.5);
    else if (eventType === "SUBSTITUTION") setStep(3.6);
    else if (eventType === "PENALTY") setStep(3.5); // go to outcome picker
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
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900", EVENT_META[e.type].color)}>
                      <EventIconByType type={e.type} className="h-5 w-5" />
                    </span>
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
                <span className={cn("mr-1 inline-flex align-[-4px]", EVENT_META[eventType]?.color)}>
                  <EventIconByType type={eventType} className="h-4 w-4" />
                </span>
                {EVENT_META[eventType]?.label} — Selecione o time
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                        {detail.bookedRegistrationIds.has(p.registrationId) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-yellow-900/60 text-yellow-400 uppercase tracking-wide">Pendurado</span>
                        )}
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
          {step === 3.5 && eventType === "GOAL" && (
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

          {/* Step 3.5: Penalty Outcome Picker */}
          {step === 3.5 && eventType === "PENALTY" && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Resultado do Pênalti</p>
              <div className="space-y-2 mb-4">
                <button
                  onClick={() => { setPenaltyOutcome("PENALTY_GOAL"); setStep(4); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3 text-left hover:border-emerald-600/60 transition-all"
                >
                  <span className="text-2xl">⚽</span>
                  <div>
                    <p className="font-bold text-emerald-400 text-sm">Gol</p>
                    <p className="text-[11px] text-zinc-500">Conta no placar</p>
                  </div>
                </button>
                <button
                  onClick={() => { setPenaltyOutcome("PENALTY_OUT"); setStep(4); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left hover:border-zinc-500 transition-all"
                >
                  <span className="text-2xl">↗</span>
                  <div>
                    <p className="font-bold text-zinc-300 text-sm">Fora</p>
                    <p className="text-[11px] text-zinc-500">Sem alteração no placar</p>
                  </div>
                </button>
                <button
                  onClick={() => { setPenaltyOutcome("PENALTY_SAVED"); setStep(3.6); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-violet-800/50 bg-violet-950/40 px-4 py-3 text-left hover:border-violet-600/60 transition-all"
                >
                  <span className="text-2xl">🧤</span>
                  <div>
                    <p className="font-bold text-violet-400 text-sm">Defendido</p>
                    <p className="text-[11px] text-zinc-500">Selecionar goleiro</p>
                  </div>
                </button>
              </div>
              <button onClick={() => setStep(3)} className="mt-2 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                        {detail.bookedRegistrationIds.has(p.registrationId) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-yellow-900/60 text-yellow-400 uppercase tracking-wide">Pendurado</span>
                        )}
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
          {step === 3.6 && eventType === "SUBSTITUTION" && (
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                        {p.isCaptain && <span className="flex h-4 w-4 items-center justify-center rounded bg-yellow-500 text-[10px] font-black text-black" title="Capitão">C</span>}
                        {detail.bookedRegistrationIds.has(p.registrationId) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-yellow-900/60 text-yellow-400 uppercase tracking-wide">Pendurado</span>
                        )}
                      </div>
                      {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(3)} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.6: Penalty — Pick Goalkeeper */}
          {step === 3.6 && eventType === "PENALTY" && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Quem defendeu o pênalti?</p>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Goleiro adversário..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredGoalkeeper.map((p) => (
                  <button key={p.registrationId} onClick={() => { setGoalkeeper(p); setStep(4); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-violet-500/50">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-white group-hover:text-violet-400 transition-colors">{p.name}</span>
                      <div className="flex items-center gap-2">
                        {p.position && <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</span>}
                        {p.number && <span className="text-[10px] text-zinc-600 font-mono">#{p.number}</span>}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredGoalkeeper.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>}
              </div>
              <p className="mt-3 text-center text-[10px] text-zinc-600">Defesa será contabilizada automaticamente</p>
              <button onClick={() => setStep(3.5)} className="mt-2 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar evento</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Tipo</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-white">
                    <span className={cn(EVENT_META[eventType]?.color)}>
                      <EventIconByType type={eventType} className="h-4 w-4" />
                    </span>
                    {eventType === "PENALTY" ? "Pênalti" : EVENT_META[eventType]?.label}
                  </span>
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
                    {eventType === "PENALTY" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Resultado</span>
                          <span className={cn("font-bold", penaltyOutcome === "PENALTY_GOAL" ? "text-emerald-400" : penaltyOutcome === "PENALTY_SAVED" ? "text-violet-400" : "text-zinc-300")}>
                            {penaltyOutcome === "PENALTY_GOAL" ? "⚽ Gol" : penaltyOutcome === "PENALTY_SAVED" ? "🧤 Defendido" : "↗ Fora"}
                          </span>
                        </div>
                        {penaltyOutcome === "PENALTY_SAVED" && goalkeeper && (
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Goleiro</span>
                            <span className="font-bold text-violet-300">{goalkeeper.name}</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                
                <div className="flex justify-between border-t border-zinc-800 pt-2"><span className="text-zinc-400">Tempo</span><span className="font-mono font-bold text-blue-400">{formatTime(elapsed)}</span></div>
              </div>
              
              <div className="mt-5 flex gap-3">
                <button onClick={() => {
                  if (eventType === "GOAL") setStep(assistPlayer ? 3.51 : 3.5);
                  else if (eventType === "SUBSTITUTION") setStep(3.6);
                  else if (eventType === "PENALTY") {
                    if (penaltyOutcome === "PENALTY_SAVED") setStep(3.6);
                    else setStep(3.5);
                  }
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
  async function deleteEvent(ev: MatchEventItem) {
    if (!confirm("Remover este evento?")) return;
    try {
      await removeMatchEvent({
        eventId: ev.id,
        knockoutMatchId: detail.match.id,
        registrationId: ev.playerId,
        eventType: ev.eventType,
      });

      if (ev.eventType === "GOAL" || ev.eventType === "OWN_GOAL" || ev.eventType === "PENALTY_GOAL") {
        await resyncScore(detail.match.id, detail.homeTeam.championshipTeamId, detail.awayTeam.championshipTeamId);
      }

      toast.success("Evento removido");
    } catch {
      toast.error("Erro ao remover evento");
    }
  }

  if (detail.events.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-600">Nenhum evento registrado</p>;
  }

  const secondYellowEventIds = getSecondYellowEventIds(detail.events);

  return (
    <div className="space-y-1">
      {[...detail.events].reverse().map((ev) => {
        const isSecondYellow = secondYellowEventIds.has(ev.id);
        const meta =
          isSecondYellow
            ? { icon: "second-yellow" as EventIconKind, label: "2º Amarelo", color: "text-red-400" }
            : EVENT_META[ev.eventType] ?? { icon: "assist" as EventIconKind, label: ev.eventType, color: "text-zinc-400" };
        const isHome = ev.teamId === detail.homeTeam.championshipTeamId;

        return (
          <div key={ev.id} className={cn("flex gap-3", isHome ? "flex-row" : "flex-row-reverse text-right")}>
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700/50 shadow-inner mt-1", meta.color)}>
              <EventIcon icon={meta.icon} className="h-5 w-5" />
            </div>
            <div className="flex flex-col justify-center flex-1">
              <div className={cn("flex items-center gap-2", isHome ? "justify-start" : "justify-end")}>
                <span className="text-sm font-bold text-white">{ev.playerName ?? "Desconhecido"}</span>
                {ev.eventType === "PENALTY_GOAL" && (
                  <span className="rounded bg-amber-900/40 px-1 text-[10px] font-black text-amber-400">P</span>
                )}
                {ev.eventType === "SUBSTITUTION" && ev.playerInName && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <span className="text-zinc-500">→</span> {ev.playerInName}
                  </span>
                )}
                {ev.eventType === "PENALTY_SAVED" && ev.playerInName && (
                  <span className="text-xs text-violet-400">🧤 {ev.playerInName}</span>
                )}
              </div>
              <div className={cn("flex items-center gap-2 text-xs", isHome ? "justify-start" : "justify-end")}>
                <span className={cn("font-medium", meta.color)}>{meta.label}</span>
                <span className="text-zinc-600">•</span>
                <span className="font-mono text-zinc-500">{formatTime(ev.eventTimeS)}</span>
                {ev.eventType === "GOAL" && ev.assistPlayerName && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <EventIcon icon="assist" className="h-3.5 w-3.5 text-blue-400" />
                      <span className="font-medium text-zinc-300">{ev.assistPlayerName}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
            {!readonly && (
              <button onClick={() => void deleteEvent(ev)}
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
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [existingVotes, setExistingVotes] = useState<ExistingVote[]>([]);
  const [existingManagerVote, setExistingManagerVote] = useState<string | null>(null);

  const fetchExistingVotes = useCallback(async () => {
    if (!detail?.match.id) return;
    const [{ data: playerData }, { data: managerData }] = await Promise.all([
      supabase
        .from("best_player_votes")
        .select("voter_role, registration_id")
        .eq("match_id", detail.match.id),
      supabase
        .from("best_manager_votes")
        .select("championship_team_id")
        .eq("match_id", detail.match.id)
        .maybeSingle(),
    ]);
    setExistingVotes(
      (playerData ?? []).map(v => ({ voterRole: v.voter_role as ExistingVote["voterRole"], registrationId: v.registration_id }))
    );
    setExistingManagerVote(managerData?.championship_team_id ?? null);
  }, [detail?.match.id]);

  useEffect(() => {
    if (detail?.match.status === "COMPLETED") void fetchExistingVotes();
  }, [detail?.match.status, fetchExistingVotes]);

  const [savesByPlayer, setSavesByPlayer] = useState<Map<string, number>>(new Map());

  const loadSaves = useCallback(async () => {
    if (!detail?.match.id) return;
    const { data } = await supabase
      .from("player_saves")
      .select("registration_id")
      .eq("match_id", detail.match.id);

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.registration_id, (counts.get(row.registration_id) ?? 0) + 1);
    }
    setSavesByPlayer(counts);
  }, [detail?.match.id]);

  useEffect(() => { void loadSaves(); }, [loadSaves]);

  async function handleSaveAdd(registrationId: string) {
    if (!detail?.match.id || !detail.match.championship_id) return;
    setSavesByPlayer(prev => new Map(prev).set(registrationId, (prev.get(registrationId) ?? 0) + 1));
    const { error } = await supabase.from("player_saves").insert({
      match_id: detail.match.id,
      championship_id: detail.match.championship_id,
      registration_id: registrationId,
      is_penalty: false,
    });
    if (error) {
      setSavesByPlayer(prev => {
        const next = new Map(prev);
        next.set(registrationId, Math.max(0, (prev.get(registrationId) ?? 0) - 1));
        return next;
      });
    }
  }

  async function handleSaveRemove(registrationId: string) {
    if (!detail?.match.id) return;
    const { data } = await supabase
      .from("player_saves")
      .select("id")
      .eq("match_id", detail.match.id)
      .eq("registration_id", registrationId)
      .eq("is_penalty", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    await supabase.from("player_saves").delete().eq("id", data.id);
    setSavesByPlayer(prev => {
      const next = new Map(prev);
      next.set(registrationId, Math.max(0, (prev.get(registrationId) ?? 0) - 1));
      return next;
    });
  }

  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevStatusRef.current !== undefined && prevStatusRef.current !== "COMPLETED" && detail?.match.status === "COMPLETED") {
      setShowVoteModal(true);
    }
    prevStatusRef.current = detail?.match.status;
  }, [detail?.match.status]);

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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Súmula Oficial
            </span>
            <button
              onClick={() => setShowVoteModal(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all",
                existingVotes.length >= 3
                  ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                  : "bg-zinc-800 text-zinc-400 hover:text-yellow-400 hover:bg-yellow-500/10 border border-zinc-700"
              )}
            >
              <Star className="h-3.5 w-3.5" />
              {existingVotes.length >= 3 ? "Craque Votado" : "Votar Craque"}
              <span className="text-[10px] opacity-70">({existingVotes.length}/3)</span>
            </button>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <Scoreboard detail={detail} elapsed={elapsed} />

      {/* Visual field showing current on-field players */}
      <MatchFieldView
        detail={detail}
        saveCountsByPlayer={savesByPlayer}
        onSaveAdd={handleSaveAdd}
        onSaveRemove={handleSaveRemove}
      />

      {/* Escalação (Only when not started) */}
      {!isInProgress && !isCompleted && detail.match.current_period === "not_started" && (
        <LineupControl detail={detail} onSaved={reload} />
      )}

      {/* Controls (only when not completed) */}
      {!isCompleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <PeriodControls detail={detail} elapsed={elapsed} reload={reload} />
          {isInProgress && detail.match.current_period !== "penalties" && (
            <button onClick={() => setShowAddEvent(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-500 transition-all">
              <Plus className="h-4 w-4" /> Evento
            </button>
          )}
        </div>
      )}

      {/* Penalty dispute — shown during active penalty period OR for completed draws
          where penalties haven't been resolved yet (e.g., match ended without them) */}
      {((!isCompleted && detail.match.current_period === "penalties") ||
        (isCompleted &&
          detail.match.home_score === detail.match.away_score &&
          detail.hasPenalties &&
          !detail.match.penalty_winner_team_id)) && (
        <PenaltyShootoutControl detail={detail} reload={reload} />
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
                <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <EventIcon icon="yellow-card" className="h-3 w-3 text-yellow-400" />
                  <span>{yellows}</span>
                  <span className="text-zinc-700">·</span>
                  <EventIcon icon="red-card" className="h-3 w-3 text-red-400" />
                  <span>{reds}</span>
                </p>
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
        <AddEventSheet detail={detail} elapsed={elapsed} onClose={() => setShowAddEvent(false)} onSaved={() => { reload(); void loadSaves(); }} />
      )}
      {showVoteModal && detail && (
        <BestPlayerVoteModal
          matchId={detail.match.id}
          championshipId={detail.match.championship_id ?? ""}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          homePlayers={detail.homePlayers}
          awayPlayers={detail.awayPlayers}
          voteWeight={detail.voteWeight}
          existingVotes={existingVotes}
          existingManagerVote={existingManagerVote}
          onClose={() => setShowVoteModal(false)}
          onSaved={() => { void fetchExistingVotes(); void loadSaves(); }}
        />
      )}
    </div>
  );
}
