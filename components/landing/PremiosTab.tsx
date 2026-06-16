"use client";

import { useState } from "react";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import type { RankingEntry } from "@/lib/public/types";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

type AwardId = "craque" | "goleiro" | "revelacao" | "tecnico";

const AWARDS: { id: AwardId; label: string; emoji: string }[] = [
  { id: "craque", label: "Melhor Jogador", emoji: "⭐" },
  { id: "goleiro", label: "Melhor Goleiro", emoji: "🧤" },
  { id: "revelacao", label: "Revelação", emoji: "🚀" },
  { id: "tecnico", label: "Técnico", emoji: "📋" },
];

export default function PremiosTab({ rankings }: { rankings: PublicRankings }) {
  const [award, setAward] = useState<AwardId>("craque");

  const entries: RankingEntry[] = (() => {
    switch (award) {
      case "craque": return rankings.craque;
      case "goleiro": return rankings.goalkeepers;
      case "revelacao": return rankings.revelations;
      case "tecnico": return rankings.managers;
    }
  })();

  const empty = entries.length === 0;

  return (
    <div className="space-y-5">
      {/* Award sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {AWARDS.map(({ id, label, emoji }) => (
          <button
            key={id}
            onClick={() => setAward(id)}
            className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all"
            style={
              award === id
                ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
            }
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
          Nenhum dado disponível para este prêmio.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry, i) => (
            <AwardCard key={entry.registrationId} entry={entry} rank={i + 1} award={award} />
          ))}
        </div>
      )}
    </div>
  );
}

function AwardCard({
  entry,
  rank,
  award,
}: {
  entry: RankingEntry;
  rank: number;
  award: AwardId;
}) {
  const isTop = rank === 1;

  return (
    <div
      className="flex items-center gap-4 rounded-xl px-4 py-3"
      style={{
        background: isTop
          ? "linear-gradient(135deg, rgba(212,160,23,0.1), var(--gala-bg-1))"
          : "var(--gala-bg-1)",
        border: `1px solid ${isTop ? "var(--gala-gold-3)" : "var(--gala-line)"}`,
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
        style={
          isTop
            ? { background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))", color: "#050507" }
            : { background: "var(--gala-panel)", color: "var(--gala-gold-2)", border: "1px solid var(--gala-line)" }
        }
      >
        {isTop ? "🥇" : rank}
      </span>

      <PlayerAvatar
        photoUrl={entry.photoUrl}
        name={entry.playerName}
        sizeClass="h-10 w-10"
        textSizeClass="text-[11px]"
        isFirst={isTop}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-white">{entry.playerName}</p>
        <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">{entry.teamName}</p>
        {entry.detail && (
          <p className="text-[10px] text-[var(--gala-gold-2)] font-bold mt-0.5">{entry.detail}</p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-lg font-black tabular-nums text-[var(--gala-gold-1)]">
          {award === "goleiro"
            ? entry.value.toFixed(1)
            : award === "revelacao"
            ? entry.value.toFixed(2)
            : entry.value}
        </p>
        <p className="text-[9px] text-[var(--gala-ink-dim)] uppercase tracking-widest">
          {award === "craque"
            ? "pts"
            : award === "goleiro"
            ? "IOG"
            : award === "revelacao"
            ? "part/jogo"
            : "pts"}
        </p>
      </div>
    </div>
  );
}
