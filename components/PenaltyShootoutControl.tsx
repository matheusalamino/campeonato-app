"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Shield, Target, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchDetail, MatchPlayer, MatchPenalty } from "@/features/hooks/useMatchDetail";

const supabase = createClient();

/**
 * Returns the winning team's championship_team_id when the result is
 * mathematically decided, or null while the shootout is still open.
 *
 * FIFA rules:
 * - Alternating kicks, 5 per team in the first round.
 * - A team wins early when the opponent can no longer catch up.
 * - Sudden death after both teams complete 5 kicks still level.
 */
function getWinner(
  homePens: MatchPenalty[],
  awayPens: MatchPenalty[],
  homeId: string,
  awayId: string,
): string | null {
  const hScore = homePens.filter((p) => p.result === "scored").length;
  const aScore = awayPens.filter((p) => p.result === "scored").length;
  const hKicks = homePens.length;
  const aKicks = awayPens.length;

  if (hKicks === 0 && aKicks === 0) return null;

  if (hKicks <= 5 && aKicks <= 5) {
    const hRem = 5 - hKicks;
    const aRem = 5 - aKicks;
    if (aKicks >= hKicks && aScore > hScore + hRem) return awayId;
    if (hKicks >= aKicks && hScore > aScore + aRem) return homeId;
    if (hKicks === 5 && aKicks === 5 && hScore !== aScore) {
      return hScore > aScore ? homeId : awayId;
    }
    return null;
  }

  // Sudden death: winner after each complete round (equal kick counts)
  if (hKicks === aKicks && hScore !== aScore) {
    return hScore > aScore ? homeId : awayId;
  }
  return null;
}

/**
 * Returns eligible kickers for the current kick and, if we're in round 2+,
 * the single forced player who must kick next (same sequence as round 1).
 *
 * Round 1: any player not yet kicked this round.
 * Round 2+: the player at the same position as round 1 (mandatory sequence).
 */
function getRotationInfo(
  teamPens: MatchPenalty[], // sorted by shotOrder, for the current team only
  allPlayers: MatchPlayer[],
): { eligible: MatchPlayer[]; forced: MatchPlayer | null; roundNumber: number } {
  const lineupSize = allPlayers.length;
  if (lineupSize === 0) return { eligible: [], forced: null, roundNumber: 1 };

  const kickCount = teamPens.length;
  const roundNumber = Math.floor(kickCount / lineupSize) + 1;
  const posInRound = kickCount % lineupSize;

  if (roundNumber === 1) {
    const kickedIds = new Set(teamPens.map((p) => p.playerId).filter(Boolean) as string[]);
    return {
      eligible: allPlayers.filter((p) => !kickedIds.has(p.registrationId)),
      forced: null,
      roundNumber,
    };
  }

  // Round 2+: follow round 1 sequence
  const round1KickAtPos = teamPens[posInRound]; // player who was at this position in round 1
  if (round1KickAtPos?.playerId) {
    const forced = allPlayers.find((p) => p.registrationId === round1KickAtPos.playerId) ?? null;
    return { eligible: forced ? [forced] : allPlayers, forced, roundNumber };
  }

  // Round 1 kick at this position had no player ID — fallback
  const currentRoundKicks = teamPens.slice(kickCount - posInRound);
  const kickedThisRound = new Set(currentRoundKicks.map((p) => p.playerId).filter(Boolean) as string[]);
  return {
    eligible: allPlayers.filter((p) => !kickedThisRound.has(p.registrationId)),
    forced: null,
    roundNumber,
  };
}

export function PenaltyShootoutControl({
  detail,
  reload,
}: {
  detail: MatchDetail;
  reload: () => void;
}) {
  const { match, homeTeam, awayTeam, homePlayers, awayPlayers, penalties } = detail;
  const [loading, setLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<MatchPlayer | null>(null);
  // Chosen at the start when no kicks are recorded yet
  const [startTeamId, setStartTeamId] = useState<string | null>(null);

  const homeId = homeTeam.championshipTeamId;
  const awayId = awayTeam.championshipTeamId;

  // Sort per team (penalty_shootouts table orders by shot_order ASC from the query)
  const homePens = penalties
    .filter((p) => p.teamId === homeId)
    .sort((a, b) => a.shotOrder - b.shotOrder);
  const awayPens = penalties
    .filter((p) => p.teamId === awayId)
    .sort((a, b) => a.shotOrder - b.shotOrder);

  // Starting team: infer from the first recorded kick, or use local selection
  const startingTeamId = penalties.length > 0 ? penalties[0].teamId : startTeamId;
  const otherTeamId = startingTeamId === homeId ? awayId : homeId;

  // Alternating: even total → starting team, odd total → other team
  const totalShots = penalties.length;
  const currentTeamId = startingTeamId
    ? totalShots % 2 === 0
      ? startingTeamId
      : otherTeamId
    : null;

  const isHomeTurn = currentTeamId === homeId;
  const currentPlayers = isHomeTurn ? homePlayers : awayPlayers;
  const currentPens = isHomeTurn ? homePens : awayPens;

  const isSuddenDeath = homePens.length >= 5 && awayPens.length >= 5;

  const { eligible: eligiblePlayers, forced: forcedPlayer, roundNumber } =
    currentTeamId
      ? getRotationInfo(currentPens, currentPlayers)
      : { eligible: [], forced: null, roundNumber: 1 };

  // In round 2+, the forced player takes precedence over manual selection.
  // In round 1, the manually selected player (selectedPlayer) is used.
  // If the selected player is no longer eligible (team changed), treat as null.
  const isSelectedEligible =
    selectedPlayer !== null &&
    eligiblePlayers.some((p) => p.registrationId === selectedPlayer.registrationId);
  const activePlayer = forcedPlayer ?? (isSelectedEligible ? selectedPlayer : null);

  // ── Team selection ─────────────────────────────────────────────────────────
  if (!startingTeamId) {
    return (
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6 space-y-5">
        <div className="text-center space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Disputa de Pênaltis
          </p>
          <p className="text-sm font-bold text-white">Qual time cobra primeiro?</p>
        </div>
        <div className="flex gap-3">
          {[homeTeam, awayTeam].map((team) => (
            <button
              key={team.championshipTeamId}
              onClick={() => setStartTeamId(team.championshipTeamId)}
              className="flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-blue-500 hover:bg-blue-600/10 transition-all active:scale-95"
            >
              <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                {team.logoUrl ? (
                  <img
                    src={team.logoUrl}
                    className="h-full w-full object-cover"
                    alt={team.name}
                  />
                ) : (
                  <Shield className="h-7 w-7 text-zinc-600" />
                )}
              </div>
              <span className="text-xs font-black uppercase tracking-wide text-white text-center">
                {team.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Record a kick ──────────────────────────────────────────────────────────
  async function addPenalty(result: "scored" | "missed" | "saved") {
    if (!currentTeamId) return;
    if (!activePlayer) {
      toast.error("Selecione o cobrador antes de registrar a cobrança");
      return;
    }
    setLoading(true);

    const shotOrder = currentPens.length + 1;

    const { error } = await supabase.from("penalty_shootouts").insert({
      knockout_match_id: match.id,
      team_id: currentTeamId,
      player_id: activePlayer.registrationId,
      shot_order: shotOrder,
      result,
    });

    if (error) {
      toast.error("Erro ao registrar cobrança");
      setLoading(false);
      return;
    }

    // Keep running score columns in sync
    const scoreField =
      currentTeamId === homeId ? "penalty_home_score" : "penalty_away_score";
    const newScore =
      (match[scoreField as keyof typeof match] as number) +
      (result === "scored" ? 1 : 0);
    await supabase
      .from("knockout_matches")
      .update({ [scoreField]: newScore })
      .eq("id", match.id);

    // Build updated lists to test for winner immediately (no need to wait for reload)
    const stub: MatchPenalty = {
      id: "",
      teamId: currentTeamId,
      playerId: activePlayer.registrationId,
      playerName: activePlayer.name,
      shotOrder,
      result,
    };
    const updatedHomePens =
      currentTeamId === homeId ? [...homePens, stub] : homePens;
    const updatedAwayPens =
      currentTeamId === awayId ? [...awayPens, stub] : awayPens;

    const winnerId = getWinner(updatedHomePens, updatedAwayPens, homeId, awayId);

    if (winnerId) {
      const isAlreadyCompleted = match.status === "COMPLETED";

      await supabase
        .from("knockout_matches")
        .update({
          penalty_winner_team_id: winnerId,
          ...(!isAlreadyCompleted && {
            current_period: "finished",
            status: "COMPLETED",
            completed_at: new Date().toISOString(),
            period_started_at: null,
          }),
        })
        .eq("id", match.id);

      if (!isAlreadyCompleted) {
        await supabase
          .from("suspensions")
          .update({ served: true })
          .eq("suspended_match_id", match.id)
          .eq("served", false);
      }

      // Resolve champion if this is the final
      const { data: freshMatch } = await supabase
        .from("knockout_matches")
        .select(
          "is_final, championship_id, home_team_id, away_team_id, home_score, away_score, penalty_home_score, penalty_away_score",
        )
        .eq("id", match.id)
        .single();

      if (freshMatch?.is_final && freshMatch.championship_id) {
        let championId: string | null = null;
        if (freshMatch.home_score > freshMatch.away_score) {
          championId = freshMatch.home_team_id;
        } else if (freshMatch.away_score > freshMatch.home_score) {
          championId = freshMatch.away_team_id;
        } else if (
          freshMatch.penalty_home_score > freshMatch.penalty_away_score
        ) {
          championId = freshMatch.home_team_id;
        } else if (
          freshMatch.penalty_away_score > freshMatch.penalty_home_score
        ) {
          championId = freshMatch.away_team_id;
        }
        if (championId) {
          await supabase
            .from("championships")
            .update({ champion_team_id: championId })
            .eq("id", freshMatch.championship_id);
        }
      }

      const winnerName = winnerId === homeId ? homeTeam.name : awayTeam.name;
      toast.success(`${winnerName} venceu nos pênaltis!`);
    } else {
      toast.success("Cobrança registrada");
    }

    setSelectedPlayer(null);
    setLoading(false);
    reload();
  }

  function renderPenaltyDots(pens: MatchPenalty[]) {
    const count = Math.max(5, pens.length);
    return (
      <div className="flex gap-1.5 flex-wrap justify-center">
        {[...Array(count)].map((_, i) => {
          const p = pens.find((pen) => pen.shotOrder === i + 1);
          return (
            <div
              key={i}
              className={cn(
                "h-3 w-3 rounded-full border",
                p?.result === "scored"
                  ? "bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  : p?.result === "missed" || p?.result === "saved"
                    ? "bg-red-500 border-red-400"
                    : "bg-zinc-800 border-zinc-700",
              )}
            />
          );
        })}
      </div>
    );
  }

  const currentTeam = currentTeamId === homeId ? homeTeam : awayTeam;

  return (
    <div className="space-y-6">
      {/* Score + dots */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-6">
          {/* Home team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
              {homeTeam.logoUrl ? (
                <img
                  src={homeTeam.logoUrl}
                  className="h-full w-full rounded-full object-cover"
                  alt={homeTeam.name}
                />
              ) : (
                <Shield className="h-6 w-6 text-zinc-600" />
              )}
            </div>
            <span className="text-[10px] font-black uppercase text-zinc-500">
              {homeTeam.name}
            </span>
            <span className="text-3xl font-black text-white">
              {match.penalty_home_score}
            </span>
            {renderPenaltyDots(homePens)}
          </div>

          <div className="px-4 text-center">
            <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">
              PÊNALTIS
            </span>
            {isSuddenDeath && (
              <p className="text-[10px] text-amber-400 font-black mt-1 uppercase tracking-wider">
                MORTE SÚBITA
              </p>
            )}
            <div className="h-px w-8 bg-zinc-800 mx-auto mt-2" />
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
              {awayTeam.logoUrl ? (
                <img
                  src={awayTeam.logoUrl}
                  className="h-full w-full rounded-full object-cover"
                  alt={awayTeam.name}
                />
              ) : (
                <Shield className="h-6 w-6 text-zinc-600" />
              )}
            </div>
            <span className="text-[10px] font-black uppercase text-zinc-500">
              {awayTeam.name}
            </span>
            <span className="text-3xl font-black text-white">
              {match.penalty_away_score}
            </span>
            {renderPenaltyDots(awayPens)}
          </div>
        </div>

        {/* Turn + controls */}
        <div className="border-t border-zinc-800 pt-4 space-y-4">
          {/* Team turn indicators */}
          <div className="flex gap-3">
            {[homeTeam, awayTeam].map((team) => {
              const active = team.championshipTeamId === currentTeamId;
              const teamPens =
                team.championshipTeamId === homeId ? homePens : awayPens;
              return (
                <div
                  key={team.championshipTeamId}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border transition-all",
                    active
                      ? "bg-blue-600/10 border-blue-500"
                      : "bg-zinc-900/50 border-zinc-800 opacity-40",
                  )}
                >
                  <span className="text-[11px] font-bold text-zinc-300 uppercase truncate w-full text-center">
                    {team.name}
                  </span>
                  {active && (
                    <span className="text-[10px] text-blue-400 font-bold">
                      ▶ Cobrança {teamPens.length + 1}
                      {roundNumber > 1 && (
                        <span className="text-zinc-500 ml-1">
                          (Rod. {roundNumber})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Kicker selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {forcedPlayer ? "Cobrador" : "Selecione o cobrador"}
              </p>
              {forcedPlayer && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-600 font-medium">
                  <Lock className="h-2.5 w-2.5" /> Sequência da rodada 1
                </span>
              )}
            </div>

            {eligiblePlayers.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-2">
                Nenhum jogador disponível
              </p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {eligiblePlayers.map((player) => {
                  const isActive = activePlayer?.registrationId === player.registrationId;
                  const isForced = forcedPlayer?.registrationId === player.registrationId;
                  return (
                    <button
                      key={player.registrationId}
                      onClick={() => {
                        if (!isForced) setSelectedPlayer(player);
                      }}
                      disabled={isForced}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        isActive
                          ? isForced
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-zinc-200 text-zinc-950 border-white"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600",
                      )}
                    >
                      {player.name}
                      {isForced && (
                        <span className="ml-1 text-blue-300">▶</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!activePlayer && eligiblePlayers.length > 0 && (
              <p className="text-[10px] text-amber-500 font-medium mt-2">
                ⚠️ Selecione o cobrador para registrar a cobrança
              </p>
            )}
          </div>

          {/* Result buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => addPenalty("scored")}
              disabled={loading || !activePlayer}
              className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-40 transition-all"
            >
              <Check className="h-5 w-5" /> GOL
            </button>
            <button
              onClick={() => addPenalty("missed")}
              disabled={loading || !activePlayer}
              className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 disabled:opacity-40 transition-all"
            >
              <Target className="h-5 w-5" /> FORA
            </button>
            <button
              onClick={() => addPenalty("saved")}
              disabled={loading || !activePlayer}
              className="flex-1 h-12 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            >
              <Shield className="h-5 w-5" /> DEFESA
            </button>
          </div>
        </div>
      </div>

      {/* Shot history */}
      {penalties.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">
            Histórico
          </p>
          <div className="space-y-1">
            {[...penalties]
              .sort(
                (a, b) =>
                  penalties.indexOf(a) - penalties.indexOf(b),
              )
              .reverse()
              .map((p) => {
                const team = p.teamId === homeId ? homeTeam : awayTeam;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50"
                  >
                    <div
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0",
                        p.result === "scored"
                          ? "bg-emerald-500/20 text-emerald-500"
                          : "bg-red-500/20 text-red-500",
                      )}
                    >
                      {p.result === "scored" ? "GOL" : "X"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white uppercase truncate">
                        {team.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        {p.playerName ?? "Cobrador não informado"}
                      </p>
                    </div>
                    <span className="text-[10px] font-black text-zinc-600 shrink-0">
                      #{p.shotOrder}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
