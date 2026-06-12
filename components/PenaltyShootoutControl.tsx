"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Shield, Target, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchDetail, MatchPlayer, MatchPenalty } from "@/features/hooks/useMatchDetail";

const supabase = createClient();

/**
 * Returns the winning team's championship_team_id when the result is mathematically
 * decided, or null while the shootout is still open.
 *
 * FIFA rules:
 * - Each team takes up to 5 kicks, alternating home/away.
 * - A team wins early when the opponent can no longer catch up even if they
 *   score every remaining kick.
 * - After both teams complete 5 kicks and scores are still level, sudden death
 *   begins: teams alternate one kick at a time; the first to outscore after an
 *   equal number of kicks wins.
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

    // After away kicks (or equal): check if home can't catch up
    if (aKicks >= hKicks && aScore > hScore + hRem) return awayId;
    // After home kicks (or equal): check if away can't catch up
    if (hKicks >= aKicks && hScore > aScore + aRem) return homeId;

    // Both have taken all 5 kicks and scores differ
    if (hKicks === 5 && aKicks === 5 && hScore !== aScore) {
      return hScore > aScore ? homeId : awayId;
    }
    return null;
  }

  // Sudden death: winner decided after each complete pair (equal kick counts)
  if (hKicks === aKicks && hScore !== aScore) {
    return hScore > aScore ? homeId : awayId;
  }
  return null;
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

  const homeId = homeTeam.championshipTeamId;
  const awayId = awayTeam.championshipTeamId;

  const homePens = penalties.filter((p) => p.teamId === homeId);
  const awayPens = penalties.filter((p) => p.teamId === awayId);

  // Alternating turn order: home kicks on even total (0, 2, 4…), away on odd (1, 3, 5…)
  const totalShots = penalties.length;
  const isHomeTurn = totalShots % 2 === 0;
  const currentTeam = isHomeTurn ? homeTeam : awayTeam;
  const currentTeamId = currentTeam.championshipTeamId;
  const currentPlayers = isHomeTurn ? homePlayers : awayPlayers;
  const currentPens = isHomeTurn ? homePens : awayPens;

  const isSuddenDeath = homePens.length >= 5 && awayPens.length >= 5;

  async function addPenalty(result: "scored" | "missed" | "saved") {
    setLoading(true);

    const shotOrder = currentPens.length + 1;

    const { error } = await supabase.from("penalty_shootouts").insert({
      knockout_match_id: match.id,
      team_id: currentTeamId,
      player_id: selectedPlayer?.registrationId ?? null,
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

    // Build updated lists to test for winner without waiting for reload
    const stub: MatchPenalty = {
      id: "",
      teamId: currentTeamId,
      playerId: null,
      playerName: null,
      shotOrder,
      result,
    };
    const updatedHomePens =
      currentTeamId === homeId ? [...homePens, stub] : homePens;
    const updatedAwayPens =
      currentTeamId === awayId ? [...awayPens, stub] : awayPens;

    const winnerId = getWinner(updatedHomePens, updatedAwayPens, homeId, awayId);

    if (winnerId) {
      await supabase
        .from("knockout_matches")
        .update({
          penalty_winner_team_id: winnerId,
          current_period: "finished",
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
          period_started_at: null,
        })
        .eq("id", match.id);

      // Mark suspensions as served
      await supabase
        .from("suspensions")
        .update({ served: true })
        .eq("suspended_match_id", match.id)
        .eq("served", false);

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
        } else if (freshMatch.penalty_home_score > freshMatch.penalty_away_score) {
          championId = freshMatch.home_team_id;
        } else if (freshMatch.penalty_away_score > freshMatch.penalty_home_score) {
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

  return (
    <div className="space-y-6">
      {/* Score + dots */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-6">
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

        {/* Turn indicator + controls */}
        <div className="border-t border-zinc-800 pt-4 space-y-4">
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
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Optional player selection */}
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 text-center">
              Cobrador (opcional)
            </p>
            <div className="flex gap-2 flex-wrap">
              {currentPlayers.map((player) => (
                <button
                  key={player.registrationId}
                  onClick={() =>
                    setSelectedPlayer(
                      selectedPlayer?.registrationId === player.registrationId
                        ? null
                        : player,
                    )
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    selectedPlayer?.registrationId === player.registrationId
                      ? "bg-zinc-200 text-zinc-950 border-white"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600",
                  )}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>

          {/* Result buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => addPenalty("scored")}
              disabled={loading}
              className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 transition-all"
            >
              <Check className="h-5 w-5" /> GOL
            </button>
            <button
              onClick={() => addPenalty("missed")}
              disabled={loading}
              className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all"
            >
              <Target className="h-5 w-5" /> FORA
            </button>
            <button
              onClick={() => addPenalty("saved")}
              disabled={loading}
              className="flex-1 h-12 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
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
            {[...penalties].reverse().map((p) => {
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
