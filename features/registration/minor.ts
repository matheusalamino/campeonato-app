import { requiresLegalAuthorization } from "./age-policy";

/**
 * Mantido como apelido de `requiresLegalAuthorization` para nao quebrar quem ja
 * importa daqui. A regra de idade vive em `age-policy.ts`.
 */
export function isMinor(birthDate: string | Date, asOf: Date = new Date()): boolean {
  return requiresLegalAuthorization(birthDate, asOf);
}
