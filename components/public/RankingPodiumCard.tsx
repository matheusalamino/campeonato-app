"use client";

import Image from "next/image";
import type { RankingEntry } from "@/lib/public/types";

type Props = {
  championshipName: string;
  title: string;          // "Artilheiros"
  subtitle: string;       // "corrida pela chuteira de ouro"
  unit: string;           // "GOLS", "ASSIST.", "PTS", "IOG"
  entries: RankingEntry[]; // já ordenado desc (até 3)
};

// Pódio com desníveis (mockup v5): 2º | 1º | 3º, degraus numerados
const ORDER: Array<{ rank: 1 | 2 | 3; medal: string }> = [
  { rank: 2, medal: "🥈" },
  { rank: 1, medal: "👑" },
  { rank: 3, medal: "🥉" },
];

const STEP_STYLE: Record<number, string> = {
  1: "h-16 text-3xl border-[rgba(212,160,23,.5)] text-[var(--gala-gold-1)] bg-gradient-to-b from-[rgba(212,160,23,.24)] to-[var(--gala-panel-2)]",
  2: "h-11 text-xl text-slate-200",
  3: "h-7 text-base text-[#e8b27d]",
};

function Avatar({ entry, rank }: { entry: RankingEntry; rank: 1 | 2 | 3 }) {
  const cls =
    rank === 1
      ? "bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] shadow-[0_0_24px_var(--gala-gold-glow)]"
      : rank === 3
        ? "bg-gradient-to-br from-[#e8b27d] to-[#9c5f2c]"
        : "bg-gradient-to-br from-[#cdd6ea] to-[#7e8aa8]";
  return entry.photoUrl ? (
    <Image
      src={entry.photoUrl}
      alt={entry.playerName}
      width={72}
      height={72}
      className="size-16 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60"
    />
  ) : (
    <div className={`flex size-16 items-center justify-center rounded-full text-xl font-black text-[#0b0a12] ${cls}`}>
      {entry.playerName.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function RankingPodiumCard({ championshipName, title, subtitle, unit, entries }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2.2vh]">
      <div className="flex items-center gap-4 text-[1.2vw] font-bold uppercase tracking-[6px] text-[var(--gala-gold-2)]">
        <span className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--gala-gold-3)]" />
        {championshipName}
        <span className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--gala-gold-3)]" />
      </div>
      <h2 className="gala-gold-text font-serif text-[3.4vw] font-extrabold drop-shadow-[0_3px_14px_rgba(212,160,23,.3)]">
        {title}
      </h2>
      <p className="-mt-2 text-[1vw] uppercase tracking-[4px] text-[var(--gala-ink-dim)]">{subtitle}</p>

      <div className="mt-[2vh] flex items-end gap-[2.2vw]">
        {ORDER.map(({ rank, medal }) => {
          const entry = entries[rank - 1];
          if (!entry) return null;
          const first = rank === 1;
          return (
            <div key={rank} className={`flex flex-col items-center ${first ? "w-[22.5vw] max-w-[275px]" : "w-[18.5vw] max-w-[225px]"}`}>
              <div
                className={`gala-panel relative flex w-full flex-col items-center gap-2 rounded-t-2xl border-b-0 px-3 pb-4 pt-5 ${
                  first ? "border-[rgba(212,160,23,.55)] shadow-[0_14px_44px_rgba(212,160,23,.16)]" : ""
                }`}
              >
                <span className="absolute -top-4 text-2xl drop-shadow-lg">{medal}</span>
                <Avatar entry={entry} rank={rank} />
                <span className="text-[1.3vw] font-extrabold">{entry.playerName}</span>
                <span className="text-[0.85vw] uppercase tracking-wider text-[var(--gala-ink-dim)]">
                  {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
                </span>
                <span className={`font-serif text-[2.9vw] font-extrabold leading-none ${first ? "gala-gold-text" : "text-slate-200"}`}>
                  {entry.value}
                  <small className="ml-1 align-middle font-sans text-[0.8vw] tracking-[2px] text-[var(--gala-ink-dim)]">{unit}</small>
                </span>
              </div>
              <div className={`flex w-full items-center justify-center rounded-b-xl border border-[var(--gala-line)] bg-gradient-to-b from-[#1a1424] to-[#0d0a13] font-serif font-extrabold ${STEP_STYLE[rank]}`}>
                {rank}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
