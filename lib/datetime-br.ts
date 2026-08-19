/**
 * Conversao entre o texto de <input type="datetime-local"> e o instante gravado.
 *
 * O input nao carrega fuso: "2026-08-12T00:00" e so um texto. Alguem precisa
 * decidir de onde e aquela meia-noite, e a resposta e sempre Brasilia — o
 * campeonato acontece em Sorocaba e o admin pensa em hora daqui. Sem esta
 * peca, `new Date("2026-08-12")` interpretaria como meia-noite UTC e a
 * inscricao abriria as 21h do dia anterior.
 *
 * Nao use `new Date(texto)` direto em lugar nenhum: o resultado depende do fuso
 * da maquina, e o servidor roda em UTC enquanto o dev roda em -03.
 */
export const CHAMPIONSHIP_TIME_ZONE = "America/Sao_Paulo";

/**
 * Offset do fuso do campeonato, em minutos, para um instante.
 *
 * Calculado em vez de fixado em -180 porque o Brasil ja teve horario de verao e
 * pode voltar a ter; fixar transformaria isso numa bomba-relogio de uma hora.
 */
function zoneOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  // `hour` pode vir "24" para meia-noite com hour12:false em alguns runtimes.
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  // Le os milissegundos em vez de zera-los com `setMilliseconds`, que mutaria
  // o `Date` recebido — quem chama esta funcao nao deveria ter o argumento
  // alterado por baixo dos panos.
  const base = instant.getTime() - instant.getMilliseconds();
  return (asUtc - base) / 60000;
}

/** "2026-08-12T00:00" (hora de Brasilia) -> instante ISO em UTC. */
export function brasiliaInputToIso(input: string): string | undefined {
  // Ancorado nas duas pontas: sem o `$`, um ISO completo como
  // "2026-08-12T03:00:00.000Z" casaria so pelo prefixo e devolveria um
  // instante deslocado em vez de recusar a entrada — o caso da funcao
  // chamada com o par trocado. Segundos sao aceitos e ignorados, porque um
  // <input type="datetime-local" step="1"> emite "HH:MM:SS".
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(input ?? "");
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  // Primeiro palpite: trata a hora escrita como se fosse UTC. Isso da um
  // instante errado, mas proximo o bastante para perguntar qual era o offset
  // naquela epoca do ano — e ai corrigir.
  const guess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  const offset = zoneOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** Instante -> "2026-08-12T00:00", para preencher o input. */
export function isoToBrasiliaInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // `sv-SE` porque o formato dessa localidade e "2026-08-12 00:00:00", que so
  // precisa trocar o espaco por T. Nao e capricho: e a forma mais curta de
  // pedir ISO ao Intl sem montar as partes na mao.
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
  return text.replace(" ", "T").slice(0, 16);
}

/**
 * A data local, o minuto do dia e o dia da semana em Brasilia.
 *
 * Terceiro consumidor do fuso, e por isso mora aqui: a regra conservadora do
 * sabado e a escolha do versiculo precisam saber o dia da semana LOCAL, e
 * `getDay()` responderia com o fuso da maquina — que no servidor e UTC. Numa
 * sexta as 22h de Brasilia, UTC ja e sabado.
 */
export function brasiliaParts(instant: Date): { date: string; minutes: number; dow: number } {
  const text = isoToBrasiliaInput(instant.toISOString()); // "2026-08-21T17:00"
  const date = text.slice(0, 10);
  const minutes = Number(text.slice(11, 13)) * 60 + Number(text.slice(14, 16));
  // A data ja esta em Brasilia; le-la de volta como meia-noite UTC devolve o
  // dia da semana correto sem reabrir a questao do fuso.
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, minutes, dow };
}
