"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { LiveMatchInfo, LiveTeam, LiveEvent } from "@/features/hooks/usePublicLiveMatch";

type Props = {
  championshipName: string;
  current: LiveMatchInfo | null;
  last: LiveMatchInfo | null;
  next: LiveMatchInfo | null;
};

const PERIOD_LABELS: Record<string, string> = {
  not_started: "Aguardando",
  period_1: "1º TEMPO",
  halftime: "INTERVALO",
  period_2: "2º TEMPO",
  extra_1: "PRORROGAÇÃO 1",
  extra_halftime: "INTERVALO",
  extra_2: "PRORROGAÇÃO 2",
  penalties: "PÊNALTIS",
  finished: "ENCERRADO",
};

const EVENT_ICONS: Record<string, string> = {
  GOAL: "⚽", OWN_GOAL: "⚽", YELLOW_CARD: "🟨", RED_CARD: "🟥",
};

function useElapsed(periodStartedAt: string | null) {
  // Inicia em "00:00" para coincidir servidor/cliente; recalcula só no efeito (evita hydration mismatch)
  const [elapsed, setElapsed] = useState("00:00");
  useEffect(() => {
    const calc = () => {
      if (!periodStartedAt) {
        setElapsed("00:00");
        return;
      }
      const s = Math.max(0, Math.floor((Date.now() - new Date(periodStartedAt).getTime()) / 1000));
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setElapsed(`${mm}:${ss}`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [periodStartedAt]);
  return elapsed;
}

function Crest({ team }: { team: LiveTeam }) {
  return team.logoUrl ? (
    <Image src={team.logoUrl} alt={team.name} width={88} height={88} className="size-[6.8vw] max-w-[88px] rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/70" />
  ) : (
    <div className="flex size-[6.8vw] max-h-[88px] max-w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-[#1a1524] to-[#0d0a13] text-[2.2vw] font-black ring-2 ring-[var(--gala-gold-3)]/70">
      {team.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function TeamColumn({ team, events, side }: { team: LiveTeam; events: LiveEvent[]; side: "home" | "away" }) {
  const teamEvents = events.filter(
    (e) => e.teamId === team.championshipTeamId && ["GOAL", "OWN_GOAL", "YELLOW_CARD", "RED_CARD"].includes(e.eventType),
  );
  return (
    <div className="flex w-[26vw] flex-col items-center gap-2">
      <Crest team={team} />
      <span className="text-[1.6vw] font-extrabold tracking-[2px]">{team.name.toUpperCase()}</span>
      <span
        className="h-1 w-3/5 rounded"
        style={{ background: team.uniformColor ?? "var(--gala-gold-3)", boxShadow: `0 0 14px ${team.uniformColor ?? "var(--gala-gold-glow)"}` }}
      />
      <div className="mt-1 flex flex-col gap-1 text-center text-[1vw] text-[var(--gala-ink-dim)]" data-side={side}>
        {teamEvents.map((e) => (
          <span key={e.id}>
            {EVENT_ICONS[e.eventType]} <b className="font-semibold text-[var(--gala-ink)]">{e.playerName ?? "—"}</b>{" "}
            <span className="tabular-nums text-[var(--gala-gold-2)]">{Math.floor(e.eventTimeS / 60)}&apos;</span>
            {e.eventType === "GOAL" && e.assistName ? (
              <em className="not-italic text-[#6f687d]"> (assist. {e.assistName})</em>
            ) : null}
            {e.eventType === "OWN_GOAL" ? <em className="not-italic text-[#6f687d]"> (contra)</em> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScorePanel({ home, away }: { home: number; away: number }) {
  return (
    <div className="gala-panel relative mt-[1.2vh] self-start rounded-2xl px-[2.6vw] py-[1.3vw] shadow-[0_14px_44px_rgba(0,0,0,.6)] before:absolute before:inset-x-[12%] before:-top-px before:h-[2px] before:bg-gradient-to-r before:from-transparent before:via-[var(--gala-gold-3)] before:to-transparent">
      <div className="flex items-center gap-[1.6vw] font-serif text-[7vw] font-extrabold leading-none">
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{home}</span>
        <span className="text-[2.4vw] font-light text-[var(--gala-gold-3)] [text-shadow:0_0_14px_var(--gala-gold-glow)]">×</span>
        <span className="gala-gold-text drop-shadow-[0_4px_20px_rgba(212,160,23,.35)]">{away}</span>
      </div>
    </div>
  );
}

function Eyebrow({ championshipName, phase }: { championshipName: string; phase: string | null }) {
  return (
    <>
      <div className="flex items-center gap-4 text-[1.2vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-24 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-24 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      {phase ? (
        <div className="-mt-1 text-[1vw] uppercase tracking-[5px] text-[var(--gala-ink-dim)]">
          <b className="font-bold text-[var(--gala-gold-1)]">{phase}</b>
        </div>
      ) : null}
    </>
  );
}

export default function LiveMatchCard({ championshipName, current, last, next }: Props) {
  const elapsed = useElapsed(current?.periodStartedAt ?? null);

  // Com jogo rolando: placar ao vivo completo
  if (current) {
    const showPenalties = current.currentPeriod === "penalties";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[2.2vh]">
        <Eyebrow championshipName={championshipName} phase={current.phaseName ?? current.name} />
        <div className="flex items-center gap-2 rounded-full border border-red-500/45 bg-red-500/10 px-4 py-1 text-[0.9vw] font-extrabold tracking-[2.5px] text-red-300">
          <span className="size-2 animate-[gala-pulse_1.4s_infinite] rounded-full bg-red-500 shadow-[0_0_10px_#ff4d5e]" />
          AO VIVO
        </div>
        <div className="flex w-full items-start justify-center gap-[3vw]">
          <TeamColumn team={current.home} events={current.events} side="home" />
          <ScorePanel home={current.homeScore} away={current.awayScore} />
          <TeamColumn team={current.away} events={current.events} side="away" />
        </div>
        <div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-[var(--gala-line)] bg-[#13101a] px-6 py-1.5 text-[1.1vw] font-bold tracking-wider text-[var(--gala-gold-1)] after:absolute after:left-[-60%] after:top-0 after:h-full after:w-2/5 after:animate-[gala-shine_3.6s_infinite] after:bg-gradient-to-r after:from-transparent after:via-[rgba(255,246,204,.14)] after:to-transparent">
          {PERIOD_LABELS[current.currentPeriod] ?? current.currentPeriod}
          <span className="tabular-nums text-white">{elapsed}</span>
        </div>
        {showPenalties ? (
          <div className="text-[1.4vw] font-bold text-[var(--gala-gold-2)]">
            Pênaltis: {current.penaltyHomeScore} × {current.penaltyAwayScore}
          </div>
        ) : null}
      </div>
    );
  }

  // Sem jogo: último resultado + próximo confronto (decisão do brainstorm)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3.5vh]">
      <Eyebrow championshipName={championshipName} phase={null} />
      {last ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Último resultado</span>
          <div className="flex items-center gap-[2vw]">
            <span className="text-[1.6vw] font-extrabold">{last.home.name.toUpperCase()}</span>
            <ScorePanel home={last.homeScore} away={last.awayScore} />
            <span className="text-[1.6vw] font-extrabold">{last.away.name.toUpperCase()}</span>
          </div>
        </div>
      ) : null}
      {next ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">Próximo jogo</span>
          <div className="flex items-center gap-[1.5vw] text-[1.8vw] font-extrabold">
            {next.home.name.toUpperCase()}
            <span className="text-[1.2vw] font-light text-[var(--gala-gold-3)]">vs</span>
            {next.away.name.toUpperCase()}
          </div>
          {next.scheduledAt ? (
            <span className="text-[1.1vw] text-[var(--gala-gold-2)]">
              {new Date(next.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      ) : null}
      {!last && !next ? (
        <p className="text-[1.4vw] text-[var(--gala-ink-dim)]">Nenhum jogo programado.</p>
      ) : null}
    </div>
  );
}
