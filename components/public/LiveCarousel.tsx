"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CAROUSEL_CARDS,
  GOAL_CELEBRATION_MS,
  activeCards,
  nextIndex,
  goalInterrupt,
} from "@/lib/public/carousel";
import type { GoalSignal } from "@/features/hooks/usePublicLiveMatch";
import GoalCelebration from "@/components/public/GoalCelebration";

type Props = {
  // Cada card é renderizado pelo id; o pai injeta o conteúdo
  renderCard: (cardId: string) => React.ReactNode;
  // Cards sem dados ainda (telão pula): ex. sem classificação na fase atual
  emptyCardIds?: string[];
};

export type LiveCarouselHandle = { fireGoal: (signal: GoalSignal) => void };

export default function LiveCarousel({
  renderCard,
  emptyCardIds = [],
  handleRef,
}: Props & { handleRef?: React.MutableRefObject<LiveCarouselHandle | null> }) {
  const cards = useMemo(
    () => activeCards(DEFAULT_CAROUSEL_CARDS).filter((c) => !emptyCardIds.includes(c.id)),
    [emptyCardIds],
  );
  const [index, setIndex] = useState(0);
  const [celebration, setCelebration] = useState<GoalSignal | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (fromIndex: number, durationMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIndex((cur) => nextIndex(cards, cur === fromIndex ? cur : fromIndex));
      }, durationMs);
    },
    [cards],
  );

  // Agenda o avanço sempre que o card atual muda
  useEffect(() => {
    if (cards.length === 0) return;
    const safe = Math.min(index, cards.length - 1);
    schedule(safe, cards[safe].durationMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, cards, schedule]);

  // Gol: celebração em overlay e segura o card live por um ciclo completo
  const fireGoal = useCallback(
    (signal: GoalSignal) => {
      const st = goalInterrupt(cards);
      if (!st) return;
      setCelebration(signal);
      setIndex(st.index);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCelebration(null), GOAL_CELEBRATION_MS);
      // após a celebração, o useEffect acima reagenda a duração cheia do card live
    },
    [cards],
  );

  useEffect(() => {
    if (handleRef) handleRef.current = { fireGoal };
  }, [fireGoal, handleRef]);

  if (cards.length === 0) return null;
  const card = cards[Math.min(index, cards.length - 1)];

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* fundo animado compartilhado */}
      <div className="gala-beams pointer-events-none absolute inset-0" />
      {[12, 28, 55, 72, 88].map((left, i) => (
        <span
          key={left}
          className="gala-dust size-[3px]"
          style={{ left: `${left}%`, animationDuration: `${9 + i * 2}s`, animationDelay: `${i * 1.5}s` }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,.7)]" />

      <div key={card.id} className="animate-card-in h-full w-full">
        {renderCard(card.id)}
      </div>

      {/* progresso */}
      <div className="absolute bottom-[4.5vh] left-1/2 flex -translate-x-1/2 gap-2">
        {cards.map((c, i) => (
          <span
            key={c.id}
            className={`h-1 w-9 rounded ${
              i === index
                ? "bg-gradient-to-r from-[var(--gala-gold-2)] to-[var(--gala-gold-3)] shadow-[0_0_8px_var(--gala-gold-glow)]"
                : "bg-[#241e30]"
            }`}
          />
        ))}
      </div>

      {celebration ? <GoalCelebration signal={celebration} /> : null}
    </div>
  );
}
