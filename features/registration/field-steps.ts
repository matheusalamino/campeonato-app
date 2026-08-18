/**
 * Em que passo do wizard cada campo do schema aparece.
 *
 * O servidor valida o formulario inteiro e devolve os erros por campo. Sem este
 * mapa o wizard nao sabe qual passo abrir, e acaba mostrando so "Dados
 * invalidos" — o diagnostico ja estava pronto e era descartado na borda.
 */
export const FIELD_STEP: Readonly<Record<string, number>> = {
  cpf: 1,

  name: 2,
  shirt_name: 2,
  email: 2,
  whatsapp: 2,
  birth_date: 2,
  birth_state: 2,
  instagram: 2,
  group_affiliation: 2,
  invite_code: 2,

  // A carta do responsavel tem passo proprio: ela precisa ser baixada,
  // impressa, assinada e digitalizada, o que nao cabe junto dos outros uploads.
  legal_authorization_link: 3,

  preferred_position: 4,
  height: 4,
  weight: 4,
  skills: 4,

  extra_tickets_count: 5,
  profile_photo_link: 5,
  payment_receipt_link: 5,
};

/** Passo da carta do responsavel — so existe quando o jogador e menor. */
export const AUTHORIZATION_STEP = 3;

/** Ultimo passo, de revisao e envio. */
export const REVIEW_STEP = 6;

/**
 * Numero exibido de um passo.
 *
 * Os ids sao fixos para o mapa de erros nao depender de quem esta na tela; o
 * rotulo e que se ajusta. Sem a carta, o passo 3 nao aparece e os seguintes
 * sobem um, de modo que o jogador sempre ve 1, 2, 3... sem buraco.
 */
export function stepNumber(id: number, needsAuthorization: boolean): number {
  if (needsAuthorization || id < AUTHORIZATION_STEP) return id;
  return id - 1;
}

/** Resolve o passo de um caminho do Zod. `skills.visao` cai na raiz `skills`. */
export function stepOfField(path: string): number | null {
  if (!path) return null;
  const root = path.split(".")[0];
  return FIELD_STEP[root] ?? null;
}

/** Recorta, de um mapa de erros, apenas o que pertence a um passo. */
export function errorsForStep(
  step: number,
  fieldErrors: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    if (stepOfField(path) === step) out[path] = message;
  }
  return out;
}

/** Primeiro passo com erro, para abrir o accordion onde o jogador precisa agir. */
export function firstStepWithError(fieldErrors: Record<string, string>): number | null {
  const steps = Object.keys(fieldErrors)
    .map(stepOfField)
    .filter((step): step is number => step !== null);
  return steps.length ? Math.min(...steps) : null;
}
