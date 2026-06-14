"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { resolveCarouselConfig, type CarouselCardConfig } from "@/lib/public/carousel";

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
  const [carouselCards, setCarouselCards] = useState<CarouselCardConfig[]>([]);
  const carouselRef = useRef<LiveCarouselHandle | null>(null);

  const cursorHidden = useHiddenCursor();
  useWakeLock();

  // Nome do campeonato + fase de grupos (para a classificação)
  useEffect(() => {
    void (async () => {
      const { data: champ } = await supabase
        .from("championships").select("id, name, carousel_config").eq("id", championshipId).maybeSingle();
      if (!champ) { setNotFound(true); return; }
      setChampionshipName(champ.name);
      setCarouselCards(resolveCarouselConfig((champ as { carousel_config?: unknown }).carousel_config as never));
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

  // Cards sem dados saem da rotação. useMemo com deps primitivas: emptyCardIds
  // precisa de referência estável, senão o carrossel reinicia o timer a cada poll.
  // Fica ANTES de qualquer return condicional (Rules of Hooks).
  const hasCraqueByPosition = Object.values(rankings.craqueByPosition).some((e) => e.length > 0);
  const emptyCardIds = useMemo(() => {
    const ids: string[] = [];
    if (rankings.topScorers.length === 0) ids.push("scorers");
    if (rankings.topAssists.length === 0) ids.push("assists");
    if (!hasCraqueByPosition) ids.push("best-by-position");
    if (rankings.goalkeepers.length === 0) ids.push("goalkeeper");
    if (rankings.revelations.length === 0) ids.push("revelation");
    if (rankings.managers.length === 0) ids.push("managers");
    if (Object.keys(standings).length === 0) ids.push("standings");
    return ids;
  }, [
    rankings.topScorers.length,
    rankings.topAssists.length,
    hasCraqueByPosition,
    rankings.goalkeepers.length,
    rankings.revelations.length,
    rankings.managers.length,
    standings,
  ]);

  if (notFound) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="gala-gold-text font-serif text-4xl">Campeonato não encontrado</p>
      </main>
    );
  }

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
        // Top 1 de cada posição num pódio único não cabe; mostra a primeira posição
        // COM votados no formato pódio (a chave pode existir com lista vazia).
        const main = Object.keys(rankings.craqueByPosition).find(
          (pos) => rankings.craqueByPosition[pos].length > 0,
        );
        if (!main) return null;
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
      case "managers":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Cartolas" subtitle="votos por partida, peso por fase"
            unit="PTS" entries={rankings.managers}
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
      <LiveCarousel renderCard={renderCard} emptyCardIds={emptyCardIds} cards={carouselCards} handleRef={carouselRef} />
    </main>
  );
}
