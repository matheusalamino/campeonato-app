"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePublicLiveMatch, type GoalSignal } from "@/features/hooks/usePublicLiveMatch";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import { useGroupStandings } from "@/features/hooks/useGroupStandings";
import LiveCarousel, { type LiveCarouselHandle } from "@/components/public/LiveCarousel";
import LiveMatchCard from "@/components/public/LiveMatchCard";
import RankingPodiumCard from "@/components/public/RankingPodiumCard";
import StandingsCard from "@/components/public/StandingsCard";
import { POSITION_LABELS } from "@/lib/public/types";

const supabase = createClient();

// Esconde o cursor após 3s parado
function useHiddenCursor() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onMove = () => {
      setHidden(false);
      clearTimeout(t);
      t = setTimeout(() => setHidden(true), 3000);
    };
    onMove();
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mousemove", onMove); clearTimeout(t); };
  }, []);
  return hidden;
}

// Mantém a TV acesa enquanto a página estiver visível
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch { /* sem suporte: ignora */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}

export default function LiveScreenPage() {
  const params = useParams<{ championshipId: string }>();
  const championshipId = params.championshipId;
  const [championshipName, setChampionshipName] = useState("Campeonato");
  const [groupPhaseId, setGroupPhaseId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const carouselRef = useRef<LiveCarouselHandle | null>(null);

  const cursorHidden = useHiddenCursor();
  useWakeLock();

  // Nome do campeonato + fase de grupos (para a classificação)
  useEffect(() => {
    void (async () => {
      const { data: champ } = await supabase
        .from("championships").select("id, name").eq("id", championshipId).maybeSingle();
      if (!champ) { setNotFound(true); return; }
      setChampionshipName(champ.name);
      const { data: phases } = await supabase
        .from("phases").select("id, type, order_number")
        .eq("championship_id", championshipId).order("order_number");
      setGroupPhaseId(phases?.find((p) => p.type === "group")?.id ?? null);
    })();
  }, [championshipId]);

  const live = usePublicLiveMatch(championshipId, (signal: GoalSignal) => {
    carouselRef.current?.fireGoal(signal);
  });
  const { rankings } = usePublicRankings(championshipId);
  const { standings, groupLabels } = useGroupStandings(championshipId, groupPhaseId);

  if (notFound) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="gala-gold-text font-serif text-4xl">Campeonato não encontrado</p>
      </main>
    );
  }

  // Cards sem dados saem da rotação
  const emptyCardIds: string[] = [];
  if (rankings.topScorers.length === 0) emptyCardIds.push("scorers");
  if (rankings.topAssists.length === 0) emptyCardIds.push("assists");
  if (Object.keys(rankings.craqueByPosition).length === 0) emptyCardIds.push("best-by-position");
  if (rankings.goalkeepers.length === 0) emptyCardIds.push("goalkeeper");
  if (rankings.revelations.length === 0) emptyCardIds.push("revelation");
  if (Object.keys(standings).length === 0) emptyCardIds.push("standings");

  const renderCard = (cardId: string) => {
    switch (cardId) {
      case "live":
        return (
          <LiveMatchCard
            championshipName={championshipName}
            current={live.current}
            last={live.last}
            next={live.next}
          />
        );
      case "scorers":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Artilheiros" subtitle="corrida pela chuteira de ouro"
            unit="GOLS" entries={rankings.topScorers}
          />
        );
      case "assists":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Maestros" subtitle="líderes de assistência"
            unit="ASSIST." entries={rankings.topAssists}
          />
        );
      case "best-by-position": {
        // Top 1 de cada posição num pódio único não cabe; mostra a posição com
        // mais votos no formato pódio e lista as demais no subtítulo do card.
        const positions = Object.keys(rankings.craqueByPosition);
        const main = positions[0];
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title={`Craques — ${POSITION_LABELS[main] ?? main}`}
            subtitle="votos por partida, peso por fase"
            unit="PTS" entries={rankings.craqueByPosition[main]}
          />
        );
      }
      case "goalkeeper":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Goleiro Destaque" subtitle="índice oficial do goleiro (IOG)"
            unit="IOG" entries={rankings.goalkeepers}
          />
        );
      case "revelation":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Revelações" subtitle="candidatos · overall ≤ 85"
            unit="P/J" entries={rankings.revelations}
          />
        );
      case "standings":
        return (
          <StandingsCard
            championshipName={championshipName}
            standings={standings} groupLabels={groupLabels}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className={cursorHidden ? "cursor-none" : ""}>
      <LiveCarousel renderCard={renderCard} emptyCardIds={emptyCardIds} handleRef={carouselRef} />
    </main>
  );
}
