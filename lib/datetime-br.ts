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
  return (asUtc - instant.setMilliseconds(0)) / 60000;
}

/** "2026-08-12T00:00" (hora de Brasilia) -> instante ISO em UTC. */
export function brasiliaInputToIso(input: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(input ?? "");
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  // Primeiro palpite: trata a hora escrita como se fosse UTC. Isso da um
  // instante errado, mas proximo o bastante para perguntar qual era o offset
  // naquela epoca do ano — e ai corrigir.
  const guess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  const offset = zoneOffsetMinutes(new Date(guess));
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
  const texto = new Intl.DateTimeFormat("sv-SE", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
  return texto.replace(" ", "T").slice(0, 16);
}
