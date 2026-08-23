"use server";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";
import {
  lookupPlayerByCpf,
  submitRegistration,
  checkLookupRateLimit,
  deleteRegistrationFile,
  reserveSlot,
} from "@/services/public-registration";

export async function lookupCpfAction(cpf: string) {
  const h = await headers();
  // Nunca o primeiro elemento de x-forwarded-for: e o valor que o proprio
  // cliente enviou, e usa-lo como chave torna o rate limit decorativo.
  const ip = clientIpFrom((name) => h.get(name)) ?? "unknown";
  const allowed = await checkLookupRateLimit(ip);
  if (!allowed) return { throttled: true as const };
  return lookupPlayerByCpf(cpf);
}

export async function submitRegistrationAction(input: unknown) {
  return submitRegistration(input);
}

/**
 * `isGoalkeeper` e o BALDE — goleiro ou linha —, e nao a posicao: quem converte
 * a palavra em booleano e a tela, uma vez so. Ver `reserveSlot`.
 */
export async function reserveSlotAction(
  championshipId: string,
  cpf: string,
  isGoalkeeper: boolean,
) {
  return reserveSlot(championshipId, cpf, isGoalkeeper);
}

export async function deleteRegistrationFileAction(
  ref: string,
  bucket: "registration-photos" | "registration-docs",
) {
  await deleteRegistrationFile(ref, bucket);
}
