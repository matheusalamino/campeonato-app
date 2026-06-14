"use client";

import Image from "next/image";
import type { GoalSignal } from "@/features/hooks/usePublicLiveMatch";

// Overlay de gol em tela cheia (~6s): backdrop sólido com blur (não mistura com o
// card abaixo) + flash dourado + foto do autor + logo/nome do time.
export default function GoalCelebration({ signal }: { signal: GoalSignal }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop sólido + blur — cobre o card de baixo durante toda a celebração */}
      <div className="absolute inset-0 bg-[rgba(7,5,11,0.94)] backdrop-blur-xl" />
      {/* Flash dourado por cima do backdrop */}
      <div className="absolute inset-0 animate-[goal-flash_6s_ease-out_forwards] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(212,160,23,.55),transparent_70%)]" />

      <div className="relative flex animate-[goal-pop_6s_ease-out_forwards] flex-col items-center gap-[2vh] text-center">
        <span className="gala-gold-text font-serif text-[10vw] font-extrabold leading-none drop-shadow-[0_8px_40px_rgba(212,160,23,.6)]">
          GOOOL!
        </span>

        {/* Foto do autor do gol */}
        {signal.playerPhotoUrl ? (
          <Image
            src={signal.playerPhotoUrl}
            alt={signal.playerName ?? "Autor do gol"}
            width={160}
            height={160}
            className="size-[12vw] max-h-40 max-w-40 rounded-full object-cover ring-4 ring-[var(--gala-gold-3)] shadow-[0_0_40px_var(--gala-gold-glow)]"
          />
        ) : null}

        <span className="text-[3vw] font-extrabold text-white">{signal.playerName ?? signal.teamName}</span>
        {signal.assistName ? (
          <span className="text-[1.6vw] text-[var(--gala-ink-dim)]">Assistência de {signal.assistName}</span>
        ) : null}

        {/* Logo + nome do time que marcou */}
        <span className="flex items-center gap-[1vw] text-[1.6vw] uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          {signal.teamLogoUrl ? (
            <Image
              src={signal.teamLogoUrl}
              alt={signal.teamName}
              width={48}
              height={48}
              className="size-[2.4vw] max-h-12 max-w-12 rounded-md object-cover"
            />
          ) : null}
          {signal.teamName}
        </span>
      </div>
    </div>
  );
}
