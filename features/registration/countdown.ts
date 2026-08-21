/**
 * Quanto falta ate um instante, e como escrever isso.
 *
 * Puro e separado do componente porque o relogio e a unica parte que precisa de
 * React — a aritmetica e o texto sao testaveis sem montar nada.
 *
 * Nao juntar com o contador da reserva (`slot-keepalive.ts`, do A4): sao dois,
 * e a regra desta feature e que a extracao vem na terceira ocorrencia.
 */
export type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  done: boolean;
};

const MIN = 60_000;

/** Alvo ilegivel conta como vencido: melhor abrir a tela que mostrar NaN. */
export function remainingUntil(targetIso: string, now: Date): Remaining {
  const target = Date.parse(targetIso);
  const remaining = Number.isNaN(target) ? 0 : target - now.getTime();

  if (remaining <= 0) return { days: 0, hours: 0, minutes: 0, done: true };

  const totalMin = Math.floor(remaining / MIN);
  return {
    days: Math.floor(totalMin / (60 * 24)),
    hours: Math.floor(totalMin / 60) % 24,
    minutes: totalMin % 60,
    done: false,
  };
}

/** Texto curto, sem unidade zerada a esquerda poluindo a linha. */
export function formatRemaining(r: Remaining): string {
  if (r.done) return "";
  if (!r.days && !r.hours && !r.minutes) return "falta menos de 1 minuto";

  const parts: string[] = [];
  if (r.days) parts.push(`${r.days}d`);
  if (r.days || r.hours) parts.push(`${r.hours}h`);
  parts.push(`${r.minutes}m`);
  return `faltam ${parts.join(" ")}`;
}
