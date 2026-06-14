"use client";

import type { GoalSignal } from "@/features/hooks/usePublicLiveMatch";

// Overlay de gol em tela cheia (~6s) — flash dourado + autor + assistência
export default function GoalCelebration({ signal }: { signal: GoalSignal }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 animate-[goal-flash_6s_ease-out_forwards] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(212,160,23,.55),rgba(5,5,7,.96))]" />
      <div className="relative flex animate-[goal-pop_6s_ease-out_forwards] flex-col items-center gap-[2vh] text-center">
        <span className="gala-gold-text font-serif text-[10vw] font-extrabold leading-none drop-shadow-[0_8px_40px_rgba(212,160,23,.6)]">
          GOOOL!
        </span>
        <span className="text-[3vw] font-extrabold text-white">{signal.playerName ?? signal.teamName}</span>
        {signal.assistName ? (
          <span className="text-[1.6vw] text-[var(--gala-ink-dim)]">assistência de {signal.assistName}</span>
        ) : null}
        <span className="text-[1.4vw] uppercase tracking-[5px] text-[var(--gala-gold-2)]">{signal.teamName}</span>
      </div>
    </div>
  );
}
