"use client";

import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

export default function DisciplineTab({ rankings }: { rankings: PublicRankings }) {
  const playerMap = new Map(rankings.players.map((p) => [p.registrationId, p]));
  const byCards = [...rankings.stats]
    .filter((s) => s.yellowCards > 0 || s.redCards > 0)
    .sort((a, b) => b.yellowCards + b.redCards * 2 - (a.yellowCards + a.redCards * 2));

  if (byCards.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--gala-ink-dim)]">
        Nenhum dado de disciplina ainda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {byCards.slice(0, 25).map((s) => {
        const p = playerMap.get(s.registrationId);
        return (
          <div
            key={s.registrationId}
            className="flex items-center gap-3 rounded-xl border border-[var(--gala-line)] px-5 py-3"
            style={{ background: "var(--gala-bg-1)" }}
          >
            <PlayerAvatar
              photoUrl={p?.photoUrl ?? null}
              name={p?.playerName ?? "?"}
              sizeClass="h-8 w-8"
              textSizeClass="text-[9px]"
            />
            <span className="flex-1 text-sm font-bold text-white">{p?.playerName ?? "Desconhecido"}</span>
            <span className="text-[10px] text-[var(--gala-ink-dim)]">{p?.teamName}</span>
            <span className="flex items-center gap-1">
              {s.yellowCards > 0 && (
                <span className="rounded px-2 py-0.5 text-[10px] font-black" style={{ background: "#ca8a04", color: "#050507" }}>
                  {s.yellowCards} 🟨
                </span>
              )}
              {s.redCards > 0 && (
                <span className="rounded px-2 py-0.5 text-[10px] font-black" style={{ background: "#dc2626", color: "white" }}>
                  {s.redCards} 🟥
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
