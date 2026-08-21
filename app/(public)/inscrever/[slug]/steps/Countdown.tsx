"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { remainingUntil, formatRemaining } from "@/features/registration/countdown";

/**
 * Contagem regressiva ate a abertura.
 *
 * O relogio e o do aparelho do jogador, que pode estar errado — por isso ela e
 * decoracao, e ao zerar **recarrega** em vez de destravar a tela sozinha. Quem
 * decide se a inscricao abriu e sempre o servidor. Aparelho adiantado zera
 * cedo, recarrega, o servidor diz que ainda nao, e o contador se recalcula do
 * instante que o servidor mandou: auto-corrige ao custo de um refresh.
 */
export default function Countdown({ targetIso }: { targetIso: string }) {
  const router = useRouter();
  const [label, setLabel] = useState(() => formatRemaining(remainingUntil(targetIso, new Date())));

  useEffect(() => {
    const tick = () => {
      const r = remainingUntil(targetIso, new Date());
      if (r.done) {
        router.refresh();
        return;
      }
      setLabel(formatRemaining(r));
    };
    tick();
    // Trinta segundos: o texto so mostra minutos, entao ticar a cada segundo
    // gastaria render por nada — e meio minuto de atraso na virada e coberto
    // pelo refresh, que pergunta ao servidor de qualquer jeito.
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [targetIso, router]);

  if (!label) return null;
  return <p className="text-sm font-bold text-[var(--gala-gold-2)]">{label}</p>;
}
