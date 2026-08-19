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
 * A regra conservadora: sexta 17h a sabado 20h30, horario de Brasilia.
 *
 * Pausa mais larga que a real, nunca menos — errar pausando a mais custa
 * algumas horas de inscricao, errar pausando a menos custa a observancia.
 *
 * Nao e 19h: a tabela `sabbath_windows` tem DEZ sabados de janeiro com por do
 * sol depois das 19h, o ultimo as 19:01:47, e o corte ali encerraria a pausa
 * antes do sol se por.
 *
 * E nao e 19h30 porque isto le hora de PAREDE. Sob horario de verao
 * reinstituido, aquele por do sol de 19:01:47 passa a marcar 20:01:47, e 19h30
 * recriaria o mesmo bug uma hora mais fundo. As janelas gravadas nao tem esse
 * problema: sao instantes absolutos, imunes ao DST. 20h30 cobre os dois
 * regimes com ~28 min de folga, a mesma margem da sexta (17:30:40).
 *
 * Considerado e recusado: ler a hora com offset fixo de -3 seria exato nos dois
 * regimes, mas custaria uma segunda nocao de "hora local" no codigo — e
 * `brasiliaParts`, que o versiculo vai usar, precisa da hora CIVIL. Este ramo e
 * rede de seguranca: obvio e generoso vale mais que exato e sutil.
 *
 * Espelha o bloco final de `public.is_sabbath` na migration
 * 20260819030000_sabbath_windows.sql. Mexeu aqui, mexa la.
 */
const SABBATH_FALLBACK_START = "17:00";
const SABBATH_FALLBACK_END = "20:30";
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

type ParsedWindow = { startsAt: string; endsAt: string; start: number; end: number };

/**
 * A janela lida como par de instantes, ou `null` se vier ilegivel.
 *
 * Qualquer comparacao com `NaN` e falsa, entao uma janela corrompida faria
 * `sabbathState` responder `false` — "nao e sabado" — e ABRIR a inscricao no
 * sabado. E a unica direcao que esta feature nao pode errar. Ilegivel vira
 * `null` e cai na regra conservadora, junto com "a tabela nao alcanca".
 *
 * As colunas sao `timestamptz NOT NULL`, entao o caminho realista nao produz
 * isso. A guarda mora aqui, e nao em cada funcao, porque as tres leem a mesma
 * janela e nenhuma delas deveria decidir sozinha o que fazer com dado podre.
 */
function parseWindow(window: SabbathWindow | null): ParsedWindow | null {
  if (!window) return null;
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { startsAt: window.startsAt, endsAt: window.endsAt, start, end };
}

/**
 * A inscricao esta pausada neste instante?
 *
 * `now` por parametro pela mesma disciplina do `registrationGate`: sem isso nao
 * ha como testar as bordas, que sao o unico lugar onde esta regra pode errar.
 *
 * Bordas inclusivas, coerentes com o resto da feature.
 *
 * Precondicoes que este modulo NAO garante, e que quem chama precisa manter:
 *
 * - `now` valido. Um `Date` invalido lanca no ramo conservador e devolve
 *   `false` no ramo da janela. Sem guarda porque nenhum chamador consegue
 *   produzir isso hoje — quem chama passa `new Date()`.
 * - `window` vinda da consulta atual-ou-proxima. Uma janela ja VENCIDA devolve
 *   `false` sem cair no fallback: daqui nao da para distinguir "ja passou" de
 *   "ainda nao chegou" sem reabrir a decisao de qual janela e a certa. Manter
 *   o `ends_at >= now()` na consulta e requisito, nao detalhe de implementacao.
 */
export function sabbathState(now: Date, window: SabbathWindow | null): boolean {
  const parsed = parseWindow(window);
  if (parsed) {
    const t = now.getTime();
    // Janela futura devolve false, e NAO cai na regra conservadora: a tabela
    // esta funcionando. Sem esta distincao o site pausaria toda sexta as 17h em
    // vez do por do sol real, semana apos semana.
    return t >= parsed.start && t <= parsed.end;
  }

  const { dow, minutes } = brasiliaParts(now);
  return (dow === FRIDAY && minutes >= hhmmToMinutes(SABBATH_FALLBACK_START))
      || (dow === SATURDAY && minutes <= hhmmToMinutes(SABBATH_FALLBACK_END));
}

/**
 * Quando a pausa vigente termina.
 *
 * So faz sentido chamar quando `sabbathState` disse `true` — e o que garante
 * que o ramo sem janela esta numa sexta ou num sabado. Fora disso a resposta e
 * sintaticamente valida e semanticamente lixo: numa terca devolve a quarta as
 * 20h30, e com uma janela vencida devolve um instante no passado. Pergunte se
 * esta pausada antes de perguntar quando termina.
 */
export function sabbathEndsAt(now: Date, window: SabbathWindow | null): string {
  const parsed = parseWindow(window);
  if (parsed) return parsed.endsAt;
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
 *
 * Atencao para quem for montar a tela: DURANTE a pausa os dois ramos discordam.
 * Com janela devolve um inicio ja passado, e `sunsetAlert` le "cutoff"; sem
 * janela, num sabado, devolve `null` e le "none". Nao e alcancavel enquanto a
 * pagina passar `null` enquanto esta pausada — mas isso e escolha de quem
 * chama, nao garantia deste modulo.
 */
export function sabbathStartsAt(now: Date, window: SabbathWindow | null): string | null {
  const parsed = parseWindow(window);
  if (parsed) return parsed.startsAt;
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
