"use client";

import {
  useChampionshipMatches,
  type ChampionshipMatchPhaseGroup,
  type ChampionshipMatchItem,
} from "@/features/hooks/useChampionshipMatches";
import TeamLogo from "@/components/landing/TeamLogo";

interface BracketSectionProps {
  championshipId: string;
}

export default function BracketSection({ championshipId }: BracketSectionProps) {
  const { groups, loading } = useChampionshipMatches(championshipId);

  if (loading) return <BracketSkeleton />;

  const phases = groups
    .map((g) => ({ ...g, matches: g.matches.filter((m) => m.groupLabel === null) }))
    .filter((g) => g.matches.length > 0)
    .sort((a, b) => a.orderNumber - b.orderNumber);

  if (phases.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
        Fase eliminatória ainda não disponível.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {phases.map((phase) => (
        <PhaseSection key={phase.id} phase={phase} />
      ))}
    </div>
  );
}

function PhaseSection({ phase }: { phase: ChampionshipMatchPhaseGroup }) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
        {phase.name}
      </p>
      <div className="flex flex-col gap-2">
        {phase.matches.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match }: { match: ChampionshipMatchItem }) {
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PROGRESS";
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isFinal = match.isFinal;

  return (
    <div>
      {isFinal && (
        <p className="mb-1 text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-1)]">
          🏆 Grande Final
        </p>
      )}
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{
          background: isFinal
            ? "linear-gradient(135deg, rgba(212,160,23,0.08), rgba(5,5,7,0.95))"
            : "var(--gala-bg-1)",
          borderColor: isFinal
            ? "var(--gala-gold-2)"
            : isLive
            ? "rgba(239,68,68,0.4)"
            : "var(--gala-line)",
          boxShadow: isFinal ? "0 0 16px rgba(212,160,23,0.12)" : undefined,
        }}
      >
        {/* Home team */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          <span className="truncate text-sm font-bold text-white">{match.home.label}</span>
          <TeamLogo logoUrl={match.home.logoUrl} name={match.home.label} size={22} />
        </div>

        {/* Score */}
        <div
          className="shrink-0 rounded px-2 py-1 text-sm font-black tabular-nums"
          style={{
            background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
            color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
            minWidth: "52px",
            textAlign: "center",
          }}
        >
          {hasScore
            ? `${match.homeScore} × ${match.awayScore}`
            : isLive
            ? "Ao vivo"
            : match.scheduledAt
            ? new Date(match.scheduledAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })
            : "—"}
        </div>

        {/* Away team */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <TeamLogo logoUrl={match.away.logoUrl} name={match.away.label} size={22} />
          <span className="truncate text-sm font-bold text-white">{match.away.label}</span>
        </div>

        {isLive && (
          <span className="shrink-0 text-[9px] font-black text-red-400">● AO VIVO</span>
        )}
      </div>
    </div>
  );
}

function BracketSkeleton() {
  return (
    <div className="space-y-8">
      {[3, 1, 2].map((count, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-32 animate-pulse rounded bg-[#171320]" />
          {Array.from({ length: count }).map((_, j) => (
            <div key={j} className="h-14 animate-pulse rounded-xl bg-[#171320]" />
          ))}
        </div>
      ))}
    </div>
  );
}
