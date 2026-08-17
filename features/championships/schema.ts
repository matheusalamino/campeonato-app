import { z } from "zod";
import { CHAMPIONSHIP_STATUS } from "@/types/championship";

export const championshipStatusSchema = z.enum(CHAMPIONSHIP_STATUS);

const optionalDate = z.coerce.date().optional();

const baseChampionshipObject = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  season: z.string().trim().optional(),
  description: z.string().trim().optional(),
  registration_start_date: optionalDate,
  registration_end_date: optionalDate,
  gala_night_date: optionalDate,
  tournament_start_date: optionalDate,
  max_players: z.coerce.number().int().positive().optional(),
  max_waitlist_players: z.coerce.number().int().min(0).default(0),
  status: championshipStatusSchema.default("draft"),
  registration_image_url: z.string().trim().url().optional().or(z.literal("")).transform((v) => v || undefined),
  base_price: z.coerce.number().min(0).optional(),
  extra_ticket_price: z.coerce.number().min(0).optional(),
  registration_group_options: z
    .array(z.object({ label: z.string().trim().min(1), requires_invite_code: z.boolean() }))
    .default([]),
});

function refineChampionship(
  data: z.infer<typeof baseChampionshipObject>,
  ctx: z.RefinementCtx,
) {
  const rs = data.registration_start_date;
  const re = data.registration_end_date;
  const gn = data.gala_night_date;
  const ts = data.tournament_start_date;

  if (rs && re && rs >= re) {
    ctx.addIssue({
      code: "custom",
      path: ["registration_end_date"],
      message: "Fim das inscrições deve ser após a abertura",
    });
  }
  if (re && ts && re >= ts) {
    ctx.addIssue({
      code: "custom",
      path: ["tournament_start_date"],
      message: "Início dos jogos deve ser após o fim das inscrições",
    });
  }
  if (gn && re && gn < re) {
    ctx.addIssue({
      code: "custom",
      path: ["gala_night_date"],
      message: "Noite de gala deve ser após o fim das inscrições",
    });
  }
  if (gn && ts && gn > ts) {
    ctx.addIssue({
      code: "custom",
      path: ["gala_night_date"],
      message: "Noite de gala deve ser antes do início dos jogos",
    });
  }

  if (data.status !== "draft") {
    const required: [string, unknown][] = [
      ["registration_start_date", rs],
      ["registration_end_date", re],
      ["gala_night_date", gn],
      ["tournament_start_date", ts],
      ["max_players", data.max_players],
    ];
    for (const [field, value] of required) {
      if (value === undefined || value === null) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Obrigatório para campeonatos publicados",
        });
      }
    }
  }
}

export const championshipFormSchema =
  baseChampionshipObject.superRefine(refineChampionship);

export const createChampionshipSchema = championshipFormSchema;

export const updateChampionshipSchema = baseChampionshipObject
  .extend({ id: z.string().uuid() })
  .superRefine(refineChampionship);

export type ChampionshipFormValues = z.infer<typeof championshipFormSchema>;

// Admins may switch a championship to any status; the only rule is that the
// new status must differ from the current one. The stale-status safety check
// lives in the changeChampionshipStatus server action (.eq("status", from)).
export const statusChangeSchema = z
  .object({
    id: z.string().uuid(),
    from: championshipStatusSchema,
    to: championshipStatusSchema,
  })
  .superRefine((data, ctx) => {
    if (data.to === data.from) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "O novo status deve ser diferente do atual",
      });
    }
  });
