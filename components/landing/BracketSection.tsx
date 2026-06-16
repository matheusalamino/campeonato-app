"use client";

import { useChampionshipMatches, type ChampionshipMatchItem } from "@/features/hooks/useChampionshipMatches";

const CARD_H = 80;  // px — match card height
const SLOT_H = CARD_H + 16; // slot = card + vertical gap

/** Top offset of match card within its column (absolute, px). */
function cardTop(phaseIndex: number, matchIndex: number): number {
  const slotSize = SLOT_H * Math.pow(2, phaseIndex);
  return matchIndex * slotSize + (slotSize - CARD_H) / 2;
}

/** Vertical center of a match card (absolute, px). */
function cardCenterY(phaseIndex: number, matchIndex: number): number {
  return cardTop(phaseIndex, matchIndex) + CARD_H / 2;
}

interface BracketSectionProps {
  championshipId: string;
}

export default function BracketSection({ championshipId }: BracketSectionProps) {
  const { groups, loading } = useChampionshipMatches(championshipId);

  const phases = groups
    .map((g) => ({ ...g, matches: g.matches.filter((m) => m.groupLabel === null) }))
    .filter((g) => g.matches.length > 0)
    .sort((a, b) => a.orderNumber - b.orderNumber);

  if (loading) {
    return (
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3" style={{ width: 220 }}>
            {Array.from({ length: 4 - i }).map((_, j) => (
              <div key={j} className="h-20 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (phases.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
        Fase eliminatória ainda não disponível.
      </p>
    );
  }

  // Total height is determined by the first-round match count.
  const firstRoundCount = phases[0].matches.length;
  const totalH = firstRoundCount * SLOT_H;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-start" style={{ minHeight: totalH + 40 }}>
        {phases.map((phase, phaseIdx) => {
          const nextPhase = phases[phaseIdx + 1];
          // Can we draw bracket connectors? Only when the next phase has exactly
          // half the matches (clean elimination halving).
          const drawConnectors =
            !!nextPhase &&
            nextPhase.matches.length === Math.ceil(phase.matches.length / 2) &&
            phase.matches.length >= 2;

          return (
            <div key={phase.id} className="flex items-start shrink-0">
              {/* Phase column */}
              <div className="flex flex-col" style={{ width: 230 }}>
                <p className="mb-2 text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
                  {phase.name}
                </p>
                <div className="relative" style={{ height: totalH }}>
                  {phase.matches.map((match, matchIdx) => (
                    <div
                      key={match.id}
                      className="absolute"
                      style={{
                        top: cardTop(phaseIdx, matchIdx),
                        left: 0,
                        right: 0,
                        height: CARD_H,
                      }}
                    >
                      <MatchCard match={match} championshipId={championshipId} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Connector SVG */}
              {drawConnectors && (
                <svg
                  width={40}
                  height={totalH}
                  className="shrink-0 mt-[22px]"
                  style={{ overflow: "visible" }}
                >
                  {phase.matches.map((_, matchIdx) => {
                    // Each pair of matches connects to one match in next phase.
                    // Only draw connector at even indexes.
                    if (matchIdx % 2 !== 0) return null;
                    const topCY = cardCenterY(phaseIdx, matchIdx);
                    const botCY = cardCenterY(phaseIdx, matchIdx + 1);
                    const midY = (topCY + botCY) / 2;
                    const nextIdx = Math.floor(matchIdx / 2);
                    const outCY = cardCenterY(phaseIdx + 1, nextIdx);
                    const cx = 20; // horizontal midpoint of connector

                    return (
                      <g key={matchIdx} stroke="var(--gala-line)" strokeWidth="1.5" fill="none">
                        {/* Top match → midpoint */}
                        <polyline points={`0,${topCY} ${cx},${topCY} ${cx},${midY}`} />
                        {/* Bottom match → midpoint (only if it exists) */}
                        {matchIdx + 1 < phase.matches.length && (
                          <polyline points={`0,${botCY} ${cx},${botCY} ${cx},${midY}`} />
                        )}
                        {/* Midpoint → next phase match */}
                        <line x1={cx} y1={midY} x2={40} y2={outCY} />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Gap when no connectors */}
              {!drawConnectors && nextPhase && <div className="w-6 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "FINISHED": return "Encerrado";
    case "IN_PROGRESS": return "Em andamento";
    default: return "Agendado";
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
      className="group flex h-full flex-col justify-between rounded-xl border px-3 py-2 transition-all hover:scale-[1.01]"
      style={{
        background: match.isFinal
          ? "linear-gradient(135deg, rgba(212,160,23,0.1), rgba(5,5,7,0.95))"
          : "var(--gala-bg-1)",
        border: `1px solid ${match.isFinal ? "var(--gala-gold-2)" : "var(--gala-line)"}`,
        boxShadow: match.isFinal ? "0 0 16px rgba(212,160,23,0.15)" : undefined,
      }}
    >
      {match.isFinal && (
        <p className="mb-1 text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
          🏆 Grande Final
        </p>
      )}

      {isLive && !match.isFinal && (
        <span className="mb-1 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Ao Vivo
        </span>
      )}

      {/* Home */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-white group-hover:text-[var(--gala-gold-1)] transition-colors">
          {match.home.label}
        </span>
        <span
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-black tabular-nums"
          style={{
            background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
            color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
          }}
        >
          {hasScore ? match.homeScore : "—"}
        </span>
      </div>

      {/* Away */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-white group-hover:text-[var(--gala-gold-1)] transition-colors">
          {match.away.label}
        </span>
        <span
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-black tabular-nums"
          style={{
            background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
            color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
          }}
        >
          {hasScore ? match.awayScore : "—"}
        </span>
      </div>

      {/* Footer */}
      <p className="mt-0.5 text-[9px] text-[var(--gala-ink-dim)]">
        {isFinished
          ? statusLabel(match.status)
          : match.scheduledAt
          ? new Date(match.scheduledAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "A definir"}
      </p>
    </a>
  );
}
