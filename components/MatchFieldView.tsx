"use client";

import { useMemo, useRef } from "react";
import type { MatchDetail, MatchPlayer, MatchEventItem } from "@/features/hooks/useMatchDetail";

// ─── Position mapping ────────────────────────────────────────────────────────
const POSITION_KEY: Record<string, string> = {
  Goleiro: "GOL",
  Zagueiro: "ZAG",
  Meia: "MEI",
  Atacante: "ATA",
  GOL: "GOL",
  ZAG: "ZAG",
  MEI: "MEI",
  ATA: "ATA",
};

// Divided into 8 distinct vertical bands to ensure NO overlaps
// and keeping each team strictly inside their respective half (0%-50% and 50%-100%):
// 1. Home Goleiro (7%)
// 2. Home Zagueiros (20%)
// 3. Home Meias (33%)
// 4. Home Atacantes (45%)
// ----- Midfield Line (50%) -----
// 5. Away Atacantes (55%)
// 6. Away Meias (67%)
// 7. Away Zagueiros (80%)
// 8. Away Goleiro (93%)
const HOME_POSITION_X: Record<string, number> = {
  GOL: 7,
  ZAG: 20,
  MEI: 33,
  ATA: 45,
};

const AWAY_POSITION_X: Record<string, number> = {
  ATA: 55,
  MEI: 67,
  ZAG: 80,
  GOL: 93,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortMatchEventsChronologically(events: MatchEventItem[]) {
  return [...events].sort(
    (a, b) =>
      a.eventTimeS - b.eventTimeS ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function getExpelledPlayerIds(events: MatchEventItem[], teamId: string) {
  const yellowCounts = new Map<string, number>();
  const expelled = new Set<string>();

  for (const event of sortMatchEventsChronologically(events)) {
    if (event.teamId !== teamId || !event.playerId) continue;

    if (event.eventType === "RED_CARD") {
      expelled.add(event.playerId);
      continue;
    }

    if (event.eventType === "YELLOW_CARD") {
      const nextCount = (yellowCounts.get(event.playerId) ?? 0) + 1;
      yellowCounts.set(event.playerId, nextCount);

      if (nextCount >= 2) expelled.add(event.playerId);
    }
  }

  return expelled;
}

type PlayerEventIndicators = {
  goals: number;
  hasYellow: boolean;
};

function getPlayerEventIndicators(events: MatchEventItem[]) {
  return events.reduce<Record<string, PlayerEventIndicators>>((acc, event) => {
    if (!event.playerId) return acc;

    const current = acc[event.playerId] ?? { goals: 0, hasYellow: false };

    if (event.eventType === "GOAL" || event.eventType === "PENALTY_GOAL") {
      current.goals += 1;
    }

    if (event.eventType === "YELLOW_CARD") {
      current.hasYellow = true;
    }

    acc[event.playerId] = current;
    return acc;
  }, {});
}

function getCurrentOnFieldPlayers(
  teamId: string,
  allPlayers: MatchPlayer[],
  lineups: MatchDetail["lineups"],
  events: MatchEventItem[]
): MatchPlayer[] {
  const starters = new Set(
    lineups.filter((l) => l.championshipTeamId === teamId && l.isStarter).map((l) => l.playerId)
  );

  const currentOnField = new Set(Array.from(starters));

  const subs = events
    .filter((e) => e.teamId === teamId && e.eventType === "SUBSTITUTION")
    .sort((a, b) => a.eventTimeS - b.eventTimeS);

  subs.forEach((s) => {
    if (s.playerId) currentOnField.delete(s.playerId);
    if (s.playerInId) currentOnField.add(s.playerInId);
  });

  const expelled = getExpelledPlayerIds(events, teamId);

  // Remove expelled players from current on-field set
  expelled.forEach((id) => currentOnField.delete(id));

  return allPlayers.filter((p) => currentOnField.has(p.registrationId) && !expelled.has(p.registrationId));
}

type FieldPlayer = MatchPlayer & { x: number; y: number };

function layoutPlayers(
  players: MatchPlayer[],
  side: "home" | "away"
): FieldPlayer[] {
  // Group by position
  const groups: Record<string, MatchPlayer[]> = {
    GOL: [],
    ZAG: [],
    MEI: [],
    ATA: [],
  };

  for (const p of players) {
    const key = POSITION_KEY[p.position ?? ""] ?? "MEI";
    groups[key].push(p);
  }

  const result: FieldPlayer[] = [];

  // Layout order for each side
  const positionOrder = ["GOL", "ZAG", "MEI", "ATA"];

  for (const pos of positionOrder) {
    const group = groups[pos];
    if (group.length === 0) continue;

    const x = side === "home" ? HOME_POSITION_X[pos] : AWAY_POSITION_X[pos];

    // Distribute players vertically with equal spacing
    // Use the range 15% - 85% to keep players away from edges
        const count = group.length;
    for (let i = 0; i < count; i++) {
      let y = 50;
      if (count > 1) {
        let minY = 15;
        let maxY = 85;
        
        // If there are exactly 2 players in a non-attacker position,
        // place them closer to the center vertical line (30% to 70%)
        if (count === 2 && pos !== "ATA") {
          minY = 30;
          maxY = 70;
        }
        
        y = minY + ((maxY - minY) / (count - 1)) * i;
      }

      result.push({ ...group[i], x, y });
    }
  }

  return result;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldPlayerMarker({
  player,
  uniformColor,
  indicators,
  saveCount = 0,
  onSaveAdd,
  onSaveRemove,
}: {
  player: FieldPlayer;
  uniformColor: string;
  indicators: PlayerEventIndicators;
  saveCount?: number;
  onSaveAdd?: () => void;
  onSaveRemove?: () => void;
}) {
  const firstName = player.name.split(" ")[0];
  const borderColor = uniformColor || "#71717A";

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const lastTouchEndRef = useRef(0);

  function startPressTimer() {
    longPressedRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      pressTimerRef.current = null;
      onSaveRemove?.();
    }, 600);
  }

  function finishPress() {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (!longPressedRef.current) {
      onSaveAdd?.();
    }
    longPressedRef.current = false;
  }

  function handleTouchStart() {
    if (!onSaveAdd) return;
    startPressTimer();
  }

  function handleTouchEnd() {
    if (!onSaveAdd) return;
    lastTouchEndRef.current = Date.now();
    finishPress();
  }

  function handleMouseDown() {
    if (!onSaveAdd) return;
    if (Date.now() - lastTouchEndRef.current < 500) return;
    startPressTimer();
  }

  function handleMouseUp() {
    if (!onSaveAdd) return;
    if (Date.now() - lastTouchEndRef.current < 500) return;
    finishPress();
  }

  function handleMouseLeave() {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      longPressedRef.current = false;
    }
  }

  return (
    <div
      className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
      style={{ left: `${player.x}%`, top: `${player.y}%`, cursor: onSaveAdd ? "pointer" : undefined }}
      onMouseDown={onSaveAdd ? handleMouseDown : undefined}
      onMouseUp={onSaveAdd ? handleMouseUp : undefined}
      onMouseLeave={onSaveAdd ? handleMouseLeave : undefined}
      onTouchStart={onSaveAdd ? handleTouchStart : undefined}
      onTouchEnd={onSaveAdd ? handleTouchEnd : undefined}
      onContextMenu={onSaveAdd ? (e) => e.preventDefault() : undefined}
      role={onSaveAdd ? "button" : undefined}
      tabIndex={onSaveAdd ? 0 : undefined}
    >
      {/* Photo circle */}
      <div
        className="relative h-9 w-9 rounded-full shadow-lg shadow-black/50 flex-shrink-0 md:h-11 md:w-11 lg:h-10 lg:w-10"
        style={{
          boxShadow: `0 0 10px ${borderColor}55, 0 4px 12px rgba(0,0,0,0.5)`,
        }}
      >
        {player.photoUrl ? (
          <img
            src={player.photoUrl}
            alt={player.name}
            className="w-full h-full object-cover rounded-full border-[3px] lg:border-[3px]"
            style={{ borderColor: borderColor, WebkitTouchCallout: "none" }}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <div 
            className="w-full h-full bg-zinc-800 flex items-center justify-center rounded-full border-[3px] lg:border-[3px]"
            style={{ borderColor: borderColor }}
          >
            <span className="text-[10px] md:text-xs font-bold text-zinc-400">
              {player.number ?? "?"}
            </span>
          </div>
        )}

        {indicators.goals > 0 && (
          <div
            className="absolute -bottom-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-zinc-950 bg-emerald-500 px-0.5 text-[9px] font-black leading-none text-white shadow-md md:h-5 md:min-w-5 md:text-[10px]"
            title={indicators.goals === 1 ? "Marcou gol" : `Marcou ${indicators.goals} gols`}
          >
            <span aria-hidden="true">⚽</span>
            {indicators.goals > 1 && <span className="ml-0.5">{indicators.goals}</span>}
          </div>
        )}

        {indicators.hasYellow && (
          <div
            className="absolute -bottom-1 -right-1 h-3.5 w-2.5 rotate-6 rounded-[2px] border border-zinc-950 bg-yellow-400 shadow-md md:h-4 md:w-3"
            title="Recebeu cartão amarelo"
            aria-label="Recebeu cartão amarelo"
          />
        )}

        {saveCount > 0 && (
          <div
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-950 bg-violet-700 text-[9px] font-black text-white shadow-md z-10"
            title={`${saveCount} defesa${saveCount > 1 ? "s" : ""}`}
          >
            {saveCount}
          </div>
        )}
      </div>

      {/* Label */}
      <div className="flex flex-col items-center">
        <span className="text-[8px] md:text-[10px] font-bold text-white leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] max-w-[58px] md:max-w-[72px] lg:max-w-[64px] truncate text-center">
          {firstName}
        </span>
        {player.number != null && (
          <span className="text-[7px] md:text-[8px] font-mono font-semibold text-white/70 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            #{player.number}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface MatchFieldViewProps {
  detail: MatchDetail;
  saveCountsByPlayer?: Map<string, number>;
  onSaveAdd?: (registrationId: string) => void;
  onSaveRemove?: (registrationId: string) => void;
}

export function MatchFieldView({ detail, saveCountsByPlayer, onSaveAdd, onSaveRemove }: MatchFieldViewProps) {
  const { homeTeam, awayTeam, homePlayers, awayPlayers, lineups, events } = detail;

  const homeCurrent = useMemo(
    () => getCurrentOnFieldPlayers(homeTeam.championshipTeamId, homePlayers, lineups, events),
    [homeTeam.championshipTeamId, homePlayers, lineups, events]
  );

  const awayCurrent = useMemo(
    () => getCurrentOnFieldPlayers(awayTeam.championshipTeamId, awayPlayers, lineups, events),
    [awayTeam.championshipTeamId, awayPlayers, lineups, events]
  );

  const homeLayout = useMemo(() => layoutPlayers(homeCurrent, "home"), [homeCurrent]);
  const awayLayout = useMemo(() => layoutPlayers(awayCurrent, "away"), [awayCurrent]);
  const playerIndicators = useMemo(() => getPlayerEventIndicators(events), [events]);

  const hasPlayers = homeLayout.length > 0 || awayLayout.length > 0;

  if (!hasPlayers) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between border-b border-zinc-800 px-4 py-3 bg-zinc-950/20">
        <div className="flex items-center gap-2">
          <span className="text-base">⚽</span>
          <h2 className="text-sm font-semibold text-zinc-300">Jogadores em Campo</h2>
        </div>
        <div className="flex min-w-0 items-center gap-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {homeTeam.uniformColor && (
              <div className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: homeTeam.uniformColor }} />
            )}
            <span className="truncate text-zinc-400">{homeTeam.name}</span>
          </div>
          <span className="shrink-0 text-zinc-600">VS</span>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-zinc-400">{awayTeam.name}</span>
            {awayTeam.uniformColor && (
              <div className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: awayTeam.uniformColor }} />
            )}
          </div>
        </div>
      </div>

      {/* Field */}
      <div className="relative w-full overflow-hidden aspect-[1/1.12] sm:aspect-[1.35/1] md:aspect-[1.65/1] lg:aspect-[2.2/1]">
        {/* Green pitch background */}
        <div className="absolute inset-0 bg-gradient-to-r from-green-950 via-green-900 to-green-950">
          {/* Pitch stripes (subtle) */}
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: "repeating-linear-gradient(to right, transparent, transparent 9.9%, rgba(255,255,255,0.5) 10%, rgba(255,255,255,0.5) 10.2%, transparent 10.3%)",
          }} />
        </div>

        {/* Field markings */}
        <svg
          viewBox="0 0 1000 450"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Outer boundary */}
          <rect
            x="20" y="15" width="960" height="420"
            fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2"
          />

          {/* Center line */}
          <line
            x1="500" y1="15" x2="500" y2="435"
            stroke="rgba(255,255,255,0.15)" strokeWidth="2"
          />

          {/* Center circle */}
          <circle
            cx="500" cy="225" r="65"
            fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2"
          />

          {/* Center spot */}
          <circle cx="500" cy="225" r="4" fill="rgba(255,255,255,0.15)" />

          {/* Left penalty area */}
          <rect
            x="20" y="110" width="130" height="230"
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2"
          />

          {/* Left goal area */}
          <rect
            x="20" y="160" width="55" height="130"
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2"
          />

          {/* Left penalty arc */}
          <path
            d="M 150 180 A 40 40 0 0 1 150 270"
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2"
          />

          {/* Right penalty area */}
          <rect
            x="850" y="110" width="130" height="230"
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2"
          />

          {/* Right goal area */}
          <rect
            x="925" y="160" width="55" height="130"
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2"
          />

          {/* Right penalty arc */}
          <path
            d="M 850 180 A 40 40 0 0 0 850 270"
            fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2"
          />

          {/* Corner arcs */}
          <path d="M 20 25 A 10 10 0 0 1 30 15" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
          <path d="M 970 15 A 10 10 0 0 1 980 25" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
          <path d="M 30 435 A 10 10 0 0 1 20 425" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
          <path d="M 980 425 A 10 10 0 0 1 970 435" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />

          {/* Goals */}
          <rect x="8" y="185" width="12" height="80" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="2" rx="2" />
          <rect x="980" y="185" width="12" height="80" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="2" rx="2" />
        </svg>

        {/* Players layer */}
        <div className="absolute inset-0 z-10">
          {homeLayout.map((p) => (
            <FieldPlayerMarker
              key={`home-${p.registrationId}`}
              player={p}
              uniformColor={homeTeam.uniformColor ?? "#3B82F6"}
              indicators={playerIndicators[p.registrationId] ?? { goals: 0, hasYellow: false }}
              saveCount={saveCountsByPlayer?.get(p.registrationId) ?? 0}
              onSaveAdd={onSaveAdd ? () => onSaveAdd(p.registrationId) : undefined}
              onSaveRemove={onSaveRemove ? () => onSaveRemove(p.registrationId) : undefined}
            />
          ))}
          {awayLayout.map((p) => (
            <FieldPlayerMarker
              key={`away-${p.registrationId}`}
              player={p}
              uniformColor={awayTeam.uniformColor ?? "#EF4444"}
              indicators={playerIndicators[p.registrationId] ?? { goals: 0, hasYellow: false }}
              saveCount={saveCountsByPlayer?.get(p.registrationId) ?? 0}
              onSaveAdd={onSaveAdd ? () => onSaveAdd(p.registrationId) : undefined}
              onSaveRemove={onSaveRemove ? () => onSaveRemove(p.registrationId) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
