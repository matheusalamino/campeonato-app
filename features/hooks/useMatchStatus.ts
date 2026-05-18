"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MatchStatus, MatchPeriod, KnockoutMatch } from "@/types/championship";

const supabase = createClient();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de cálculo de cronômetro
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna os segundos acumulados de períodos já encerrados */
function getAccumulatedSeconds(match: KnockoutMatch): number {
  return (
    (match.period_1_duration_s ?? 0) +
    (match.period_2_duration_s ?? 0) +
    (match.extra_1_duration_s ?? 0) +
    (match.extra_2_duration_s ?? 0)
  );
}

/** Calcula o elapsed do período atual (sem acumulado de anteriores) */
export function getCurrentPeriodElapsed(match: KnockoutMatch): number {
  if (!match.period_started_at) return 0;
  return Math.floor(
    (Date.now() - new Date(match.period_started_at).getTime()) / 1000,
  );
}

/** Calcula o tempo total do jogo (acumulado + período atual) em segundos */
export function getTotalElapsedSeconds(match: KnockoutMatch): number {
  return getAccumulatedSeconds(match) + getCurrentPeriodElapsed(match);
}

/** Formata segundos como "MM:SS" */
export function formatMatchTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento da máquina de estados de período
// ─────────────────────────────────────────────────────────────────────────────

/** Coluna onde a duração do período é salva ao encerrar */
const PERIOD_DURATION_COLUMN: Partial<Record<MatchPeriod, string>> = {
  period_1: "period_1_duration_s",
  period_2: "period_2_duration_s",
  extra_1: "extra_1_duration_s",
  extra_2: "extra_2_duration_s",
};

/** Próximo período após encerrar o atual (sem extra_time) */
const NEXT_PERIOD_DEFAULT: Partial<Record<MatchPeriod, MatchPeriod>> = {
  period_1: "halftime",
  halftime: "period_2",
  period_2: "finished",
  extra_1: "extra_halftime",
  extra_halftime: "extra_2",
  extra_2: "finished",
  penalties: "finished",
};

/** Próximo período após encerrar o atual (com extra_time/penalties) */
function getNextPeriod(
  current: MatchPeriod,
  hasExtraTime: boolean,
  hasPenalties: boolean,
  isDrawAtEnd: boolean,
): MatchPeriod {
  if (current === "period_2" && isDrawAtEnd) {
    if (hasExtraTime) return "extra_1";
    if (hasPenalties) return "penalties";
    return "finished";
  }
  if (current === "extra_2" && isDrawAtEnd && hasPenalties) {
    return "penalties";
  }
  return NEXT_PERIOD_DEFAULT[current] ?? "finished";
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

type UseMatchStatusOptions = {
  /** ID do campeonato — necessário para validar unicidade de jogo em andamento */
  championshipId: string;
  /** Configurações da fase knockout (tem prorrogação? tem pênaltis?) */
  hasExtraTime?: boolean;
  hasPenalties?: boolean;
};

type MatchStatusError =
  | "ANOTHER_MATCH_IN_PROGRESS"
  | "MATCH_ALREADY_COMPLETED"
  | "INVALID_TRANSITION"
  | "DB_ERROR";

type MatchStatusResult =
  | { success: true }
  | { success: false; error: MatchStatusError; message: string };

export function useMatchStatus({
  championshipId,
  hasExtraTime = false,
  hasPenalties = false,
}: UseMatchStatusOptions) {
  const [loading, setLoading] = useState(false);

  // ── Iniciar o jogo (NOT_STARTED → IN_PROGRESS, period: not_started → period_1) ──
  const startMatch = useCallback(
    async (matchId: string): Promise<MatchStatusResult> => {
      setLoading(true);

      try {
        // Verifica se há outro jogo em andamento no mesmo campeonato
        const { data: activeMatch } = await supabase
          .from("knockout_matches")
          .select("id, name")
          .eq("championship_id", championshipId)
          .eq("status", "IN_PROGRESS")
          .maybeSingle();

        if (activeMatch) {
          return {
            success: false,
            error: "ANOTHER_MATCH_IN_PROGRESS",
            message: `Existe um jogo em andamento: "${activeMatch.name ?? activeMatch.id}". Finalize-o antes de iniciar este.`,
          };
        }

        const now = new Date().toISOString();
        const { error } = await supabase
          .from("knockout_matches")
          .update({
            status: "IN_PROGRESS" satisfies MatchStatus,
            current_period: "period_1" satisfies MatchPeriod,
            period_started_at: now,
            started_at: now,
          })
          .eq("id", matchId)
          .eq("status", "NOT_STARTED"); // guard extra: só atualiza se ainda not_started

        if (error) {
          // Unique index violation = outro jogo foi iniciado no mesmo instante (race condition)
          if (error.code === "23505") {
            return {
              success: false,
              error: "ANOTHER_MATCH_IN_PROGRESS",
              message: "Outro jogo foi iniciado ao mesmo tempo. Tente novamente.",
            };
          }
          return { success: false, error: "DB_ERROR", message: error.message };
        }

        return { success: true };
      } finally {
        setLoading(false);
      }
    },
    [championshipId],
  );

  // ── Encerrar o período atual e avançar para o próximo ──
  const endCurrentPeriod = useCallback(
    async (match: KnockoutMatch): Promise<MatchStatusResult> => {
      if (match.status === "COMPLETED") {
        return {
          success: false,
          error: "MATCH_ALREADY_COMPLETED",
          message: "O jogo já está encerrado.",
        };
      }

      const current = match.current_period;

      // Períodos sem cronômetro (intervalos) apenas avançam o estado
      const isRestPeriod = current === "halftime" || current === "extra_halftime";

      const elapsed = isRestPeriod ? 0 : getCurrentPeriodElapsed(match);
      const durationColumn = PERIOD_DURATION_COLUMN[current];

      const isDrawAtEnd =
        match.home_score === match.away_score;

      const nextPeriod = getNextPeriod(
        current,
        hasExtraTime,
        hasPenalties,
        isDrawAtEnd,
      );

      const isMatchFinished =
        nextPeriod === "finished" ||
        (nextPeriod === "penalties" && !hasPenalties);

      const updatePayload: Record<string, unknown> = {
        current_period: nextPeriod,
        period_started_at: isMatchFinished || nextPeriod === "halftime" || nextPeriod === "extra_halftime"
          ? null
          : new Date().toISOString(),
      };

      // Salva duração do período que acabou de encerrar
      if (durationColumn && !isRestPeriod) {
        updatePayload[durationColumn] = elapsed;
      }

      // Se o jogo acabou, fecha o status
      if (isMatchFinished) {
        updatePayload.status = "COMPLETED" satisfies MatchStatus;
        updatePayload.completed_at = new Date().toISOString();
      }

      setLoading(true);
      try {
        const { error } = await supabase
          .from("knockout_matches")
          .update(updatePayload)
          .eq("id", match.id);

        if (error) {
          return { success: false, error: "DB_ERROR", message: error.message };
        }

        if (isMatchFinished) {
          const { data: freshMatch } = await supabase
            .from("knockout_matches")
            .select("is_final, championship_id, home_team_id, away_team_id, home_score, away_score, penalty_home_score, penalty_away_score")
            .eq("id", match.id)
            .single();

          if (freshMatch?.is_final && freshMatch.championship_id) {
            let championId = null;
            if (freshMatch.home_score > freshMatch.away_score) championId = freshMatch.home_team_id;
            else if (freshMatch.away_score > freshMatch.home_score) championId = freshMatch.away_team_id;
            else {
              if (freshMatch.penalty_home_score > freshMatch.penalty_away_score) championId = freshMatch.home_team_id;
              else if (freshMatch.penalty_away_score > freshMatch.penalty_home_score) championId = freshMatch.away_team_id;
            }

            if (championId) {
              await supabase
                .from("championships")
                .update({ champion_team_id: championId })
                .eq("id", freshMatch.championship_id);
            }
          }
        }

        return { success: true };
      } finally {
        setLoading(false);
      }
    },
    [hasExtraTime, hasPenalties],
  );

  // ── Iniciar cronômetro de um período de intervalo (halftime → period_2) ──
  const startNextPeriod = useCallback(
    async (match: KnockoutMatch): Promise<MatchStatusResult> => {
      const current = match.current_period;
      const isRestPeriod =
        current === "halftime" || current === "extra_halftime";

      if (!isRestPeriod) {
        return {
          success: false,
          error: "INVALID_TRANSITION",
          message: `Período atual (${current}) não é um intervalo.`,
        };
      }

      const nextPeriod: MatchPeriod =
        current === "halftime" ? "period_2" : "extra_2";

      setLoading(true);
      try {
        const { error } = await supabase
          .from("knockout_matches")
          .update({
            current_period: nextPeriod,
            period_started_at: new Date().toISOString(),
          })
          .eq("id", match.id);

        if (error) {
          return { success: false, error: "DB_ERROR", message: error.message };
        }

        return { success: true };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── Atualizar placar ──
  const updateScore = useCallback(
    async (
      matchId: string,
      homeScore: number,
      awayScore: number,
    ): Promise<MatchStatusResult> => {
      setLoading(true);
      try {
        const { error } = await supabase
          .from("knockout_matches")
          .update({ home_score: homeScore, away_score: awayScore })
          .eq("id", matchId)
          .neq("status", "COMPLETED"); // Não permite alterar jogo encerrado

        if (error) {
          return { success: false, error: "DB_ERROR", message: error.message };
        }
        return { success: true };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    loading,
    startMatch,
    endCurrentPeriod,
    startNextPeriod,
    updateScore,
    // Utilitários de cronômetro exportados para uso em componentes
    getTotalElapsedSeconds,
    getCurrentPeriodElapsed,
    formatMatchTime,
  };
}
