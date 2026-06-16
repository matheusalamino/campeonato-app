"use client";

import { useChampionshipMatches, type ChampionshipMatchItem } from "@/features/hooks/useChampionshipMatches";

const CARD_H = 76;   // match card height in px
const SLOT_H = 96;   // base slot height (card + gap)
const CONN_W = 40;   // connector column width in px
const CARD_W = 220;  // match card width in px
const LABEL_H = 28;  // phase label height in px (text + margin)

/** Slot height for a phase: proportional to how many matches it has vs. first round. */
function slotSize(phaseMatchCount: number, firstRoundCount: number): number {
  return (SLOT_H * firstRoundCount) / phaseMatchCount;
}

/** Top offset of match card within the bracket column. */
function cardTop(phaseMatchCount: number, matchIdx: number, firstRoundCount: number): number {
  const ss = slotSize(phaseMatchCount, firstRoundCount);
  return matchIdx * ss + (ss - CARD_H) / 2;
}

/** Vertical center of a match card. */
function centerY(phaseMatchCount: number, matchIdx: number, firstRoundCount: number): number {
  return cardTop(phaseMatchCount, matchIdx, firstRoundCount) + CARD_H / 2;
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
      <div className="flex gap-3">
        {[3, 2, 1].map((n, i) => (
          <div key={i} className="flex flex-col gap-3" style={{ width: CARD_W }}>
            {Array.from({ length: n }).map((_, j) => (
              <div key={j} className="animate-pulse rounded-xl bg-[#171320]" style={{ height: CARD_H }} />
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

  const firstRoundCount = phases[0].matches.length;
  const totalH = firstRoundCount * SLOT_H;

  return (
    <div className="overflow-x-auto pb-4">
      {/* Phase labels row */}
      <div className="flex mb-1">
        {phases.map((phase, phaseIdx) => (
          <div key={phase.id} className="flex shrink-0">
            <div style={{ width: CARD_W }}>
              <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
                {phase.name}
              </p>
            </div>
            {/* Reserve space for connector column */}
            {phaseIdx < phases.length - 1 && <div style={{ width: CONN_W }} />}
          </div>
        ))}
      </div>

      {/* Bracket row */}
      <div className="flex" style={{ height: totalH }}>
        {phases.map((phase, phaseIdx) => {
          const nextPhase = phases[phaseIdx + 1];
          const curCount = phase.matches.length;
          const nextCount = nextPhase?.matches.length ?? 0;

          // Connector type: "straight" (N→N), "bracket" (N→N/2), or none
          const connType =
            nextPhase == null
              ? null
              : nextCount === curCount
              ? "straight"
              : nextCount === Math.ceil(curCount / 2)
              ? "bracket"
              : null;

          return (
            <div key={phase.id} className="flex shrink-0">
              {/* Match cards column */}
              <div
                className="flex flex-col"
                style={{
                  width: CARD_W,
                  height: totalH,
                  paddingTop: cardTop(curCount, 0, firstRoundCount),
                  rowGap: slotSize(curCount, firstRoundCount) - CARD_H,
                }}
              >
                {phase.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    championshipId={championshipId}
                  />
                ))}
              </div>

              {/* Connector SVG */}
              {nextPhase && (
                <svg
                  width={CONN_W}
                  height={totalH}
                  className="shrink-0"
                  style={{ overflow: "visible" }}
                >
                  {connType === "straight" &&
                    phase.matches.map((_, i) => {
                      const cy = centerY(curCount, i, firstRoundCount);
                      return (
                        <line
                          key={i}
                          x1={0}
                          y1={cy}
                          x2={CONN_W}
                          y2={cy}
                          stroke="var(--gala-line)"
                          strokeWidth="1.5"
                        />
                      );
                    })}

                  {connType === "bracket" &&
                    Array.from({ length: nextCount }).map((_, pairIdx) => {
                      const i0 = pairIdx * 2;
                      const i1 = i0 + 1;
                      const cy0 = centerY(curCount, i0, firstRoundCount);
                      const cy1 = i1 < curCount ? centerY(curCount, i1, firstRoundCount) : cy0;
                      const midY = (cy0 + cy1) / 2;
                      const outCY = centerY(nextCount, pairIdx, firstRoundCount);
                      const cx = CONN_W / 2;

                      return (
                        <g key={pairIdx} stroke="var(--gala-line)" strokeWidth="1.5" fill="none">
                          <polyline points={`0,${cy0} ${cx},${cy0} ${cx},${midY}`} />
                          {i1 < curCount && (
                            <polyline points={`0,${cy1} ${cx},${cy1} ${cx},${midY}`} />
                          )}
                          <line x1={cx} y1={midY} x2={CONN_W} y2={outCY} />
                        </g>
                      );
                    })}
                </svg>
              )}
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
    case "IN_PROGRESS": return "Ao vivo";
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

  const scoreStyle = {
    background: isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
    color: isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
  };

  return (
    <a
      href={`/stats/${championshipId}`}
      className="group flex flex-col justify-center gap-1.5 rounded-xl border px-3 transition-all hover:scale-[1.01]"
      style={{
        height: CARD_H,
        background: match.isFinal
          ? "linear-gradient(135deg, rgba(212,160,23,0.1), rgba(5,5,7,0.95))"
          : "var(--gala-bg-1)",
        border: `1px solid ${match.isFinal ? "var(--gala-gold-2)" : "var(--gala-line)"}`,
        boxShadow: match.isFinal ? "0 0 16px rgba(212,160,23,0.15)" : undefined,
      }}
    >
      {match.isFinal && (
        <p className="text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)] leading-none">
          🏆 Grande Final
        </p>
      )}

      {/* Home */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-white group-hover:text-[var(--gala-gold-1)] transition-colors leading-none">
          {match.home.label}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black tabular-nums leading-none"
          style={scoreStyle}
        >
          {hasScore ? match.homeScore : "—"}
        </span>
      </div>

      {/* Away */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-white group-hover:text-[var(--gala-gold-1)] transition-colors leading-none">
          {match.away.label}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-black tabular-nums leading-none"
          style={scoreStyle}
        >
          {hasScore ? match.awayScore : "—"}
        </span>
      </div>

      {/* Status/date */}
      <p className="text-[9px] leading-none" style={{ color: isLive ? "#ef4444" : "var(--gala-ink-dim)" }}>
        {isLive ? "● Ao vivo" : isFinished ? "Encerrado" : match.scheduledAt
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
