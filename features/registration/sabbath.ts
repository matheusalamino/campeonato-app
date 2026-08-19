import { brasiliaInputToIso, brasiliaParts } from "@/lib/datetime-br";

/**
 * Uma janela de repouso, vinda de `sabbath_windows`.
 *
 * Quem chama entrega a janela ATUAL OU A PROXIMA — a que a consulta
 * `ends_at >= now() ORDER BY starts_at LIMIT 1` devolve. `null` nao quer dizer
 * "hoje nao e sabado": quer dizer que a tabela nao alcanca este instante, e
 * so nesse caso a regra conservadora entra.
 */
export type SabbathWindow = { startsAt: string; endsAt: string };

/**
 * A regra conservadora: sexta 17h a sabado 19h30, horario de Brasilia.
 *
 * Pausa mais larga que a real, nunca menos — errar pausando a mais custa
 * algumas horas de inscricao, errar pausando a menos custa a observancia.
 *
 * 19h30 e nao 19h: a tabela `sabbath_windows` tem DEZ sabados de janeiro com
 * por do sol depois das 19h, o ultimo as 19:01:47. Com o corte em 19h, o ramo
 * que existe para errar a favor da observancia erraria contra ela. A margem
 * agora espelha a da sexta — o por do sol mais cedo do ano e 17:30:40.
 *
 * Espelha o bloco final de `public.is_sabbath` na migration
 * 20260819030000_sabbath_windows.sql. Mexeu aqui, mexa la.
 */
const SABBATH_FALLBACK_START = "17:00";
const SABBATH_FALLBACK_END = "19:30";
const FRIDAY = 5;
const SATURDAY = 6;

/** A partir de quantos minutos antes do por do sol o formulario avisa. */
export const SUNSET_NOTICE_MINUTES = 30;
/** A quantos minutos do por do sol o bloco de pagamento some. */
export const SUNSET_PAYMENT_CUTOFF_MINUTES = 10;

/** O texto e montado aqui dentro, nunca vem de fora: `undefined` seria bug nosso. */
function brasiliaAt(date: string, hhmm: string): string {
  const iso = brasiliaInputToIso(`${date}T${hhmm}`);
  if (!iso) throw new Error(`Instante de Brasilia invalido: ${date}T${hhmm}`);
  return iso;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "17:00" -> 1020. Le os minutos tambem: 17h30 nao pode virar 17h em silencio. */
function hhmmToMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * A inscricao esta pausada neste instante?
 *
 * `now` por parametro pela mesma disciplina do `registrationGate`: sem isso nao
 * ha como testar as bordas, que sao o unico lugar onde esta regra pode errar.
 *
 * Bordas inclusivas, coerentes com o resto da feature.
 */
export function sabbathState(now: Date, window: SabbathWindow | null): boolean {
  if (window) {
    const t = now.getTime();
    // Janela futura devolve false, e NAO cai na regra conservadora: a tabela
    // esta funcionando. Sem esta distincao o site pausaria toda sexta as 17h em
    // vez do por do sol real, semana apos semana.
    return t >= Date.parse(window.startsAt) && t <= Date.parse(window.endsAt);
  }

  const { dow, minutes } = brasiliaParts(now);
  return (dow === FRIDAY && minutes >= hhmmToMinutes(SABBATH_FALLBACK_START))
      || (dow === SATURDAY && minutes <= hhmmToMinutes(SABBATH_FALLBACK_END));
}

/**
 * Quando a pausa vigente termina.
 *
 * So faz sentido chamar quando `sabbathState` disse `true` — e o que garante
 * que o ramo sem janela esta numa sexta ou num sabado.
 */
export function sabbathEndsAt(now: Date, window: SabbathWindow | null): string {
  if (window) return window.endsAt;
  const { date, dow } = brasiliaParts(now);
  const saturday = dow === SATURDAY ? date : addDays(date, 1);
  return brasiliaAt(saturday, SABBATH_FALLBACK_END);
}

/**
 * Quando a proxima pausa comeca, quando isso e sabido.
 *
 * Com janela e sempre exato. Sem janela, a regra conservadora so conhece o
 * comeco do sabado corrente: em qualquer outro dia devolve `null`, e nao ha o
 * que avisar — a proxima pausa esta a mais de um dia.
 */
export function sabbathStartsAt(now: Date, window: SabbathWindow | null): string | null {
  if (window) return window.startsAt;
  const { date, dow } = brasiliaParts(now);
  if (dow !== FRIDAY) return null;
  return brasiliaAt(date, SABBATH_FALLBACK_START);
}

export type SunsetAlert = "none" | "notice" | "cutoff";

/**
 * O aviso do por do sol no formulario.
 *
 * A pausa cria uma porta nova para o "pagou e foi recusado": alguem faz o PIX
 * as 17h50, sobe o comprovante, e e recusado as 18h05. Isto NAO move a borda do
 * calculo — a pausa continua exata no por do sol; o que muda e o que a tela
 * mostra antes dela.
 */
export function sunsetAlert(now: Date, startsAt: string | null): SunsetAlert {
  if (!startsAt) return "none";
  const target = Date.parse(startsAt);
  if (Number.isNaN(target)) return "none";

  const minutes = (target - now.getTime()) / 60_000;
  if (minutes <= SUNSET_PAYMENT_CUTOFF_MINUTES) return "cutoff";
  if (minutes <= SUNSET_NOTICE_MINUTES) return "notice";
  return "none";
}
