import { z } from "zod";
import { isValidCpf } from "@/lib/cpf";
import { isMinor } from "./minor";
import { groupRequiresInviteCode } from "./groups";
import { skillsFor } from "./skills";
import type { GroupOption } from "@/types/championship";

const rating = z.coerce.number().int().min(1).max(5);

export function makeRegistrationSchema(groupOptions: GroupOption[]) {
  return z
    .object({
      championship_slug: z.string().min(1),
      cpf: z.string().refine(isValidCpf, "CPF inválido"),
      name: z.string().trim().min(1, "Nome é obrigatório"),
      shirt_name: z.string().trim().min(1, "Nome da camisa é obrigatório"),
      email: z.string().trim().email("E-mail inválido"),
      whatsapp: z.string().trim().min(8, "WhatsApp é obrigatório"),
      birth_date: z.string().min(1, "Data de nascimento é obrigatória"),
      birth_state: z.string().trim().min(1, "Estado é obrigatório"),
      instagram: z.string().trim().optional().default(""),
      preferred_position: z.enum(["Zagueiro", "Meia", "Atacante", "Goleiro"]),
      height: z.coerce.number().positive("Altura inválida"),
      weight: z.coerce.number().positive("Peso inválido"),
      group_affiliation: z.string().trim().min(1, "Grupo é obrigatório"),
      invite_code: z.string().trim().optional().default(""),
      skills: z.record(z.string(), rating),
      extra_tickets_count: z.coerce.number().int().min(0).default(0),
      profile_photo_link: z.string().url("Foto de perfil é obrigatória"),
      payment_receipt_link: z.string().trim().optional().default(""),
      legal_authorization_link: z.string().trim().optional().default(""),
    })
    .superRefine((data, ctx) => {
      if (groupRequiresInviteCode(groupOptions, data.group_affiliation) && !data.invite_code) {
        ctx.addIssue({
          code: "custom",
          path: ["invite_code"],
          message: "Código de convite é obrigatório para este grupo",
        });
      }
      if (data.birth_date && isMinor(data.birth_date) && !data.legal_authorization_link) {
        ctx.addIssue({
          code: "custom",
          path: ["legal_authorization_link"],
          message: "Autorização do responsável é obrigatória para menores de 18",
        });
      }
      for (const skill of skillsFor(data.preferred_position)) {
        if (data.skills[skill] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["skills", skill],
            message: "Avaliação obrigatória",
          });
        }
      }
    });
}

export type RegistrationInput = z.infer<ReturnType<typeof makeRegistrationSchema>>;
