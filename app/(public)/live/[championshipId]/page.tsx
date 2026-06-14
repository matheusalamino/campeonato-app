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
import { resolveCarouselConfig, type CarouselCardConfig, type SavedCarouselCard } from "@/lib/public/carousel";

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
  // Inicia no padrão para o telão já girar (sem flash de tela vazia) enquanto carrega
  const [carouselCards, setCarouselCards] = useState<CarouselCardConfig[]>(() => resolveCarouselConfig(null));
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
      const rawCarousel = (champ as { carousel_config?: unknown }).carousel_config;
      setCarouselCards(resolveCarouselConfig(rawCarousel as SavedCarouselCard[] | null));
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
  const emptyCardIds = useMemo(() => {
    const ids: string[] = [];
    if (rankings.topScorers.length === 0) ids.push("scorers");
    if (rankings.topAssists.length === 0) ids.push("assists");
    if (rankings.craque.length === 0) ids.push("craque");
    if (rankings.goalkeepers.length === 0) ids.push("goalkeeper");
    if (rankings.revelations.length === 0) ids.push("revelation");
    if (rankings.managers.length === 0) ids.push("managers");
    if (Object.keys(standings).length === 0) ids.push("standings");
    return ids;
  }, [
    rankings.topScorers.length,
    rankings.topAssists.length,
    rankings.craque.length,
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
      case "craque":
        return (
          <RankingPodiumCard
            championshipName={championshipName}
            title="Craque" subtitle="votos por partida, peso por fase"
            unit="PTS" entries={rankings.craque}
          />
        );
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
