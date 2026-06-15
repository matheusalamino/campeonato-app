"use client";

import { useChampionshipMatches, type ChampionshipMatchItem } from "@/features/hooks/useChampionshipMatches";

interface BracketSectionProps {
  championshipId: string;
}

export default function BracketSection({ championshipId }: BracketSectionProps) {
  const { groups, loading } = useChampionshipMatches(championshipId);

  const knockoutPhases = groups
    .map((g) => ({
      ...g,
      matches: g.matches.filter((m) => m.groupLabel === null),
    }))
    .filter((g) => g.matches.length > 0)
    .sort((a, b) => a.orderNumber - b.orderNumber);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-[#171320]" />
        ))}
      </div>
    );
  }

  if (knockoutPhases.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
        Fase eliminatória ainda não disponível.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {knockoutPhases.map((phase) => (
        <div key={phase.id}>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            {phase.name}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {phase.matches.map((match) => (
              <MatchCard key={match.id} match={match} championshipId={championshipId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "FINISHED": return "Encerrado";
    case "IN_PROGRESS": return "Em andamento";
    case "NOT_STARTED": return "Agendado";
    default: return status;
  }
}

function MatchCard({
  match,
  championshipId,
}: {
  match: ChampionshipMatchItem;
  championshipId: string;
}) {
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PROGRESS";
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <a
      href={`/stats/${championshipId}`}
      className="group block rounded-xl border transition-all hover:scale-[1.01]"
      style={{
        background: match.isFinal
          ? "linear-gradient(135deg, rgba(212,160,23,0.08), rgba(5,5,7,0.95))"
          : "var(--gala-bg-1)",
        border: `1px solid ${match.isFinal ? "var(--gala-gold-2)" : "var(--gala-line)"}`,
        padding: "14px 16px",
        boxShadow: match.isFinal ? "0 0 20px rgba(212,160,23,0.12)" : undefined,
      }}
    >
      {match.isFinal && (
        <p className="mb-2 text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
          🏆 Grande Final
        </p>
      )}

      {isLive && (
        <span className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
          style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#ef4444" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Ao Vivo
        </span>
      )}

      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 truncate text-sm font-bold text-white group-hover:text-[var(--gala-gold-1)] transition-colors">
          {match.home.label}
        </span>
        <span
          className="shrink-0 rounded-lg px-3 py-1 text-sm font-black tabular-nums"
          style={{
            background: isFinished || isLive ? "rgba(212,160,23,0.1)" : "var(--gala-panel)",
            border: "1px solid var(--gala-line)",
            color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
            minWidth: "56px",
            textAlign: "center",
          }}
        >
          {hasScore ? `${match.homeScore} × ${match.awayScore}` : "✕"}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm font-bold text-white text-right group-hover:text-[var(--gala-gold-1)] transition-colors">
          {match.away.label}
        </span>
      </div>

      {match.scheduledAt && !isFinished && (
        <p className="mt-2 text-[10px] text-[var(--gala-ink-dim)]">
          {new Date(match.scheduledAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {isFinished && (
        <p className="mt-2 text-[10px] text-[var(--gala-ink-dim)]">{statusLabel(match.status)}</p>
      )}
    </a>
  );
}
