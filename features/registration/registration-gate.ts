import type { SabbathPause } from "./sabbath";

/**
 * O que a pagina de inscricao mostra.
 *
 * Existe como uniao discriminada, e nao como uma escada de `if` dentro do JSX,
 * porque a decisao tem seis saidas e precisa ser testavel sem montar React. A
 * pagina vira burra: chama, faz `switch`, renderiza.
 */
export type RegistrationGate =
  | { view: "rest"; endsAt: string | null }
  | { view: "wizard" }
  | { view: "not_open" }
  | { view: "not_yet"; opensAt: string }
  | { view: "ended_by_deadline"; endedAt: string }
  | { view: "ended_by_capacity" };

export type GateChampionship = {
  status?: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
};

/** Instante utilizavel, ou null. Data corrompida vira borda inexistente. */
function instant(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Decide a tela. `now` entra por parametro de proposito: sem isso nao ha como
 * testar as bordas, que sao o unico lugar onde esta regra pode errar.
 */
export function registrationGate(
  champ: GateChampionship,
  now: Date,
  sabbath: SabbathPause | null,
): RegistrationGate {
  // O override manual vem primeiro, para um feriado ou uma pausa nao prevista,
  // mas herda o horario do sabado quando os dois valem: `rest` na mao nao sabe
  // quando volta, o sabado sabe. Sozinho fica sem horario, porque prometer um
  // seria inventar.
  if (champ.status === "rest") return { view: "rest", endsAt: sabbath?.endsAt ?? null };

  // `subscribed` so e setado pela RPC quando a lotacao enche. Por isso ele conta
  // "as vagas acabaram" e o prazo vencido conta "o tempo acabou": a causa vem do
  // status, nao da data.
  if (champ.status === "subscribed") return { view: "ended_by_capacity" };
  if (champ.status !== "subscribing") return { view: "not_open" };

  const opensAt = instant(champ.registration_start_date);
  const endsAt = instant(champ.registration_end_date);

  // Bordas inclusivas: escolhido 23:59, aquele minuto conta inteiro.
  if (opensAt && now < opensAt) return { view: "not_yet", opensAt: opensAt.toISOString() };
  if (endsAt && now > endsAt) return { view: "ended_by_deadline", endedAt: endsAt.toISOString() };

  // A pausa substitui o WIZARD, e so ele. Nos estados fechados nao ha escrita a
  // impedir, e dizer "volta apos o por do sol" seria promessa falsa: aquele
  // campeonato nao reabre ali. A observancia nao perde nada — o wizard e o unico
  // caminho para gravar inscricao, e as RPCs recusam no banco de qualquer jeito.
  if (sabbath) return { view: "rest", endsAt: sabbath.endsAt };

  return { view: "wizard" };
}
