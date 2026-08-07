"use server";
import { headers } from "next/headers";
import { lookupPlayerByCpf, submitRegistration, checkLookupRateLimit } from "@/services/public-registration";

export async function lookupCpfAction(cpf: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const allowed = await checkLookupRateLimit(ip);
  if (!allowed) return { throttled: true as const };
  return lookupPlayerByCpf(cpf);
}

export async function submitRegistrationAction(input: unknown) {
  return submitRegistration(input);
}
