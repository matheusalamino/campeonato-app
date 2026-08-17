import Link from "next/link";
import type { TopScorer } from "@/lib/landing/queries";
import PlayerAvatar from "@/components/landing/PlayerAvatar";

interface TopScorersPreviewProps {
  scorers: TopScorer[];
  seasonName: string | null;
  statsHref?: string;
}

export default function TopScorersPreview({ scorers, seasonName, statsHref }: TopScorersPreviewProps) {
  if (scorers.length === 0) return null;
  const max = scorers[0]?.goals ?? 1;

  return (
    <div
      className="mt-8 rounded-2xl p-6"
      style={{
        background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
        border: "1px solid var(--gala-line)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            {seasonName ?? "Última Temporada"}
          </p>
          <h3 className="mt-0.5 text-sm font-black text-white">Artilheiros</h3>
        </div>
        <Link
          href={statsHref ?? "/champions-league"}
          className="text-[10px] font-bold uppercase tracking-widest text-[var(--gala-gold-2)] hover:text-[var(--gala-gold-1)] transition-colors"
        >
          Ver estatísticas completas →
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {scorers.map((scorer, i) => (
          <li key={scorer.playerName} className="flex items-center gap-3">
            <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">
              {i + 1}
            </span>
            <PlayerAvatar
              photoUrl={scorer.photoUrl}
              name={scorer.playerName}
              sizeClass="h-7 w-7"
              textSizeClass="text-[9px]"
              isFirst={i === 0}
            />
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-bold text-white">{scorer.playerName}</span>
              {scorer.teamName && (
                <span className="text-[10px] text-[var(--gala-ink-dim)]">{scorer.teamName}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.round((scorer.goals / max) * 80)}px`,
                  background: "linear-gradient(90deg, var(--gala-gold-3), var(--gala-gold-2))",
                }}
              />
              <span className="w-8 text-right text-sm font-black text-[var(--gala-gold-2)]">
                {scorer.goals}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
