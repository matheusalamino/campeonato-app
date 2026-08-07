"use server";
import { lookupPlayerByCpf, submitRegistration } from "@/services/public-registration";

export async function lookupCpfAction(cpf: string) {
  return lookupPlayerByCpf(cpf);
}

export async function submitRegistrationAction(input: unknown) {
  return submitRegistration(input);
}
