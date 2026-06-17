"use client";

import type React from "react";
import {
  useChampionshipMatches,
  type ChampionshipMatchPhaseGroup,
  type ChampionshipMatchItem,
} from "@/features/hooks/useChampionshipMatches";
import TeamLogo from "@/components/landing/TeamLogo";
import { classifyBracketPhases } from "@/features/utils/classifyBracketPhases";

// ── Layout constants ─────────────────────────────────────────
const CARD_W = 200;
const CARD_H = 80;
const CONN_W = 56;
const ROW_GAP_TOP = 48;
const ROW_GAP_BOT = 40;

const COL2_X = CARD_W + CONN_W;
const COL3_X = CARD_W + CONN_W + CARD_W + CONN_W;
const ROW2_Y = CARD_H + ROW_GAP_TOP;
const ROW3_Y = ROW2_Y + CARD_H + ROW_GAP_BOT;
const TOTAL_W = COL3_X + CARD_W;
const TOTAL_H = ROW3_Y + CARD_H;

// Center-x of each column (for SVG connector endpoints)
const LEFT_CX = CARD_W / 2;
const RIGHT_CX = COL3_X + CARD_W / 2;

interface BracketSectionProps {
  championshipId: string;
}

export default function BracketSection({ championshipId }: BracketSectionProps) {
  const { groups, loading } = useChampionshipMatches(championshipId);

  if (loading) return <BracketSkeleton />;

  const phases = groups
    .map((g) => ({ ...g, matches: g.matches.filter((m) => m.groupLabel === null) }))
    .filter((g) => g.matches.length > 0);

  const copa = classifyBracketPhases(phases);

  if (!copa.isValid) {
    return (
      <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
        Fase eliminatória ainda não disponível.
      </p>
    );
  }

  const midY = ROW2_Y + CARD_H / 2;
  const disparY = ROW3_Y + CARD_H / 2;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="relative mx-auto" style={{ width: TOTAL_W, height: TOTAL_H }}>
        {/* ── SVG connector lines ── */}
        <svg
          width={TOTAL_W}
          height={TOTAL_H}
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: "visible" }}
        >
          {/* Repescagem Left → Semi Left (vertical) */}
          {copa.repescagemLeft && copa.semiLeft && (
            <line
              x1={LEFT_CX} y1={CARD_H}
              x2={LEFT_CX} y2={ROW2_Y}
              stroke="var(--gala-line)" strokeWidth="1.5"
            />
          )}
          {/* Repescagem Right → Semi Right (vertical) */}
          {copa.repescagemRight && copa.semiRight && (
            <line
              x1={RIGHT_CX} y1={CARD_H}
              x2={RIGHT_CX} y2={ROW2_Y}
              stroke="var(--gala-line)" strokeWidth="1.5"
            />
          )}
          {/* Semi Left → Final (horizontal) */}
          {copa.semiLeft && copa.final && (
            <line
              x1={CARD_W} y1={midY}
              x2={COL2_X} y2={midY}
              stroke="var(--gala-line)" strokeWidth="1.5"
            />
          )}
          {/* Final → Semi Right (horizontal) */}
          {copa.final && copa.semiRight && (
            <line
              x1={COL2_X + CARD_W} y1={midY}
              x2={COL3_X} y2={midY}
              stroke="var(--gala-line)" strokeWidth="1.5"
            />
          )}
          {/* Semi Left → Disputa (dashed L: down then right) */}
          {copa.semiLeft && copa.disputa && (
            <polyline
              points={`${LEFT_CX},${ROW2_Y + CARD_H} ${LEFT_CX},${disparY} ${COL2_X},${disparY}`}
              fill="none"
              stroke="var(--gala-line)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />
          )}
          {/* Semi Right → Disputa (dashed L: down then left) */}
          {copa.semiRight && copa.disputa && (
            <polyline
              points={`${RIGHT_CX},${ROW2_Y + CARD_H} ${RIGHT_CX},${disparY} ${COL2_X + CARD_W},${disparY}`}
              fill="none"
              stroke="var(--gala-line)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />
          )}
        </svg>

        {/* ── Match cards ── */}
        {copa.repescagemLeft && (
          <PhaseCard phase={copa.repescagemLeft} x={0} y={0} championshipId={championshipId} />
        )}
        {copa.repescagemRight && (
          <PhaseCard phase={copa.repescagemRight} x={COL3_X} y={0} championshipId={championshipId} />
        )}
        {copa.semiLeft && (
          <PhaseCard phase={copa.semiLeft} x={0} y={ROW2_Y} championshipId={championshipId} />
        )}
        {copa.final && (
          <PhaseCard phase={copa.final} x={COL2_X} y={ROW2_Y} championshipId={championshipId} isFinal />
        )}
        {copa.semiRight && (
          <PhaseCard phase={copa.semiRight} x={COL3_X} y={ROW2_Y} championshipId={championshipId} />
        )}
        {copa.disputa && (
          <PhaseCard phase={copa.disputa} x={COL2_X} y={ROW3_Y} championshipId={championshipId} />
        )}
      </div>
    </div>
  );
}

// ── PhaseCard: label + single match card ─────────────────────
function PhaseCard({
  phase,
  x,
  y,
  championshipId,
  isFinal = false,
}: {
  phase: ChampionshipMatchPhaseGroup;
  x: number;
  y: number;
  championshipId: string;
  isFinal?: boolean;
}) {
  const match = phase.matches[0];
  return (
    <div className="absolute" style={{ left: x, top: y, width: CARD_W }}>
      <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)] leading-none mb-1.5">
        {phase.name}
      </p>
      {match ? (
        <MatchCard match={match} championshipId={championshipId} isFinal={isFinal} />
      ) : (
        <EmptyCard />
      )}
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────
function MatchCard({
  match,
  championshipId,
  isFinal,
}: {
  match: ChampionshipMatchItem;
  championshipId: string;
  isFinal: boolean;
}) {
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PROGRESS";
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  const scoreStyle: React.CSSProperties = {
    background:
      isFinished || isLive ? "rgba(212,160,23,0.12)" : "var(--gala-panel)",
    color:
      isFinished || isLive ? "var(--gala-gold-1)" : "var(--gala-ink-dim)",
  };

  return (
    <a
      href={`/stats/${championshipId}`}
      className="group flex flex-col justify-center gap-1.5 rounded-xl border px-3 transition-all hover:scale-[1.01]"
      style={{
        height: CARD_H,
        background: isFinal
          ? "linear-gradient(135deg, rgba(212,160,23,0.1), rgba(5,5,7,0.95))"
          : "var(--gala-bg-1)",
        border: `1px solid ${isFinal ? "var(--gala-gold-2)" : "var(--gala-line)"}`,
        boxShadow: isFinal ? "0 0 16px rgba(212,160,23,0.15)" : undefined,
      }}
    >
      {isFinal && (
        <p className="text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)] leading-none">
          🏆 Grande Final
        </p>
      )}

      {/* Home row */}
      <div className="flex items-center gap-1.5">
        <TeamLogo logoUrl={match.home.logoUrl} name={match.home.label} size={18} />
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

      {/* Away row */}
      <div className="flex items-center gap-1.5">
        <TeamLogo logoUrl={match.away.logoUrl} name={match.away.label} size={18} />
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
    </a>
  );
}

// ── EmptyCard ─────────────────────────────────────────────────
function EmptyCard() {
  return (
    <div
      className="rounded-xl border flex items-center justify-center"
      style={{
        height: CARD_H,
        background: "var(--gala-bg-1)",
        border: "1px solid var(--gala-line)",
      }}
    >
      <span className="text-[10px] text-[var(--gala-ink-dim)]">A definir</span>
    </div>
  );
}

// ── BracketSkeleton ───────────────────────────────────────────
function BracketSkeleton() {
  const slots = [
    { x: 0, y: 0 },
    { x: COL3_X, y: 0 },
    { x: 0, y: ROW2_Y },
    { x: COL2_X, y: ROW2_Y },
    { x: COL3_X, y: ROW2_Y },
    { x: COL2_X, y: ROW3_Y },
  ];
  return (
    <div className="relative mx-auto" style={{ width: TOTAL_W, height: TOTAL_H }}>
      {slots.map((pos, i) => (
        <div
          key={i}
          className="absolute animate-pulse rounded-xl bg-[#171320]"
          style={{ left: pos.x, top: pos.y + 20, width: CARD_W, height: CARD_H }}
        />
      ))}
    </div>
  );
}
