"use client";

import { useState } from "react";
import Image from "next/image";
import type { RankingEntry } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";

const PREVIEW_COUNT = 3; // top 3 visível antes de "Ver todos"

// Inteiros (gols, assist., pts) sem casas; decimais (IOG, part./jogo) com 2 casas
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function Row({ entry, rank }: { entry: RankingEntry; rank: number }) {
  const first = rank === 1;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-4 text-center font-extrabold ${first ? "text-[var(--gala-gold-2)]" : "text-[var(--gala-ink-dim)]"}`}>
        {rank}
      </span>
      {entry.photoUrl ? (
        <Image src={entry.photoUrl} alt={entry.playerName} width={24} height={24} className="size-6 rounded-full object-cover" />
      ) : (
        <span className={`flex size-6 items-center justify-center rounded-full text-[9px] font-extrabold ${first ? "bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-[#0b0a12]" : "bg-[#2a2438] text-white"}`}>
          {entry.playerName.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="flex-1 truncate">
        {entry.playerName}
        <small className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
          {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
        </small>
      </span>
      <span className="font-extrabold tabular-nums text-[var(--gala-gold-2)]">{formatValue(entry.value)}</span>
    </div>
  );
}

function RankCard({ icon, title, subtitle, entries, highlight = false, disabled = false }: {
  icon: string; title: string; subtitle: string;
  entries: RankingEntry[]; highlight?: boolean; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, PREVIEW_COUNT);
  const hasMore = entries.length > PREVIEW_COUNT;

  return (
    <div className={`gala-panel rounded-xl p-4 ${highlight ? "border-[rgba(212,160,23,.4)]" : ""} ${disabled ? "opacity-45" : ""}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <span>{icon}</span>
        <span className="gala-gold-text font-serif">{title}</span>
      </h3>
      <p className="mt-0.5 text-[10px] uppercase tracking-[2px] text-[#665f73]">{subtitle}</p>
      <div className="mt-3 flex flex-col gap-2">
        {disabled ? (
          <p className="py-3 text-center text-xs tracking-wide text-[var(--gala-ink-dim)]">DISPONÍVEL EM BREVE</p>
        ) : entries.length === 0 ? (
          <p className="py-3 text-center text-xs text-[var(--gala-ink-dim)]">Sem dados ainda</p>
        ) : (
          visible.map((e, i) => <Row key={e.registrationId} entry={e} rank={i + 1} />)
        )}
      </div>
      {hasMore ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full border-t border-[var(--gala-line)] pt-2 text-[10px] font-bold uppercase tracking-[2px] text-[var(--gala-gold-2)] transition-colors hover:text-[var(--gala-gold-1)]"
        >
          {expanded ? "Ver menos ↑" : `Ver todos (${entries.length}) →`}
        </button>
      ) : null}
    </div>
  );
}

export default function RankingsTab({ rankings }: { rankings: PublicRankings }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RankCard icon="⚽" title="Artilheiros" subtitle="chuteira de ouro" entries={rankings.topScorers} highlight />
      <RankCard icon="🎯" title="Maestros" subtitle="líderes de assistência" entries={rankings.topAssists} />
      <RankCard icon="👑" title="Craque" subtitle="votos por partida" entries={rankings.craque} />
      <RankCard icon="🧤" title="Goleiro Destaque" subtitle="índice oficial do goleiro (IOG)" entries={rankings.goalkeepers} />
      <RankCard icon="💎" title="Revelações" subtitle="candidatos · overall ≤ 85" entries={rankings.revelations} />
      <RankCard icon="🎩" title="Cartolas" subtitle="votos por partida, peso por fase" entries={rankings.managers} />
    </div>
  );
}
