/** Idade minima para se inscrever no campeonato. */
export const MIN_AGE = 12;

/** Idade a partir da qual nao e mais preciso autorizacao do responsavel. */
export const ADULT_AGE = 18;

/** Anos completos entre o nascimento e a data de referencia. */
export function ageAt(birthDate: string | Date, asOf: Date = new Date()): number {
  const born = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  let age = asOf.getFullYear() - born.getFullYear();
  const monthDiff = asOf.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < born.getDate())) age--;
  return age;
}

/** Abaixo da idade minima o jogador nao pode se inscrever. */
export function isBelowMinimumAge(birthDate: string | Date, asOf: Date = new Date()): boolean {
  return ageAt(birthDate, asOf) < MIN_AGE;
}

/**
 * Todo menor de idade precisa da carta assinada pelo responsavel.
 *
 * A carta nao autoriza so a participacao: ela carrega a clausula de
 * responsabilidade medica — atendimento de emergencia e quem responde pelos
 * custos — e o termo de isencao por lesao. Por isso a regra acompanha a
 * maioridade civil, e nao uma faixa esportiva menor.
 */
export function requiresLegalAuthorization(
  birthDate: string | Date,
  asOf: Date = new Date(),
): boolean {
  return ageAt(birthDate, asOf) < ADULT_AGE;
}
