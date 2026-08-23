import { z } from "zod";
import { CHAMPIONSHIP_STATUS } from "@/types/championship";
import { MAX_PIX_KEY, pixKeyFits } from "@/lib/pix";

export const championshipStatusSchema = z.enum(CHAMPIONSHIP_STATUS);

const optionalDate = z.coerce.date().optional();

// Este id vem da coluna uuid do Postgres, nao de entrada de usuario — a
// coluna ja rejeita qualquer coisa malformada. z.string().uuid() exige
// versao (1-8) e variante (8/9/a/b) conforme a RFC 4122, o que rejeita um id
// legitimo mas fabricado a mao, migrado de outro sistema ou de seed (ex.:
// "10000000-0000-0000-0000-000000000001", com "versao zero"). O Zod aqui so
// precisa pegar chamada malformada da propria aplicacao, entao validamos
// apenas a forma 8-4-4-4-12 hexadecimal, sem exigir conformidade com a RFC.
const databaseId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Id inválido");

export const baseChampionshipObject = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  season: z.string().trim().optional(),
  description: z.string().trim().optional(),
  registration_start_date: optionalDate,
  registration_end_date: optionalDate,
  gala_night_date: optionalDate,
  tournament_start_date: optionalDate,
  // `max_players` e `max_waitlist_players` continuam no schema porque continuam
  // existindo como COLUNA — sao o que as duas RPCs leem. O que muda e a autoria:
  // `toRow` os deriva do formato abaixo, e o valor que chegar aqui e ignorado.
  //
  // O `.positive()` de `max_players` tinha que cair junto: ele recusava 0, que
  // agora e o valor de "fechado". O CHECK do banco foi relaxado no mesmo sentido
  // (`max_players IS NULL OR max_players >= 0`, em 20260820010000).
  max_players: z.coerce.number().int().min(0).optional(),
  max_waitlist_players: z.coerce.number().int().min(0).default(0),
  max_extra_tickets: z.coerce.number().int().min(0).default(4),
  // O formato: as cinco colunas de 20260820010000, na mesma ordem e com os
  // mesmos defaults que a DDL declara.
  //
  // As duas primeiras sao opcionais porque a coluna e nulavel de proposito —
  // formato nao configurado e um estado legitimo, que `derivedCapacity` traduz
  // em zero vagas. As tres com `.default()` espelham `NOT NULL DEFAULT`.
  teams_count: z.coerce.number().int().min(0).optional(),
  players_per_team: z.coerce.number().int().min(0).optional(),
  goalkeepers_per_team: z.coerce.number().int().min(0).default(1),
  waitlist_goalkeepers: z.coerce.number().int().min(0).default(0),
  waitlist_outfield: z.coerce.number().int().min(0).default(0),
  status: championshipStatusSchema.default("draft"),
  registration_image_url: z.string().trim().url().optional().or(z.literal("")).transform((v) => v || undefined),
  base_price: z.coerce.number().min(0).optional(),
  extra_ticket_price: z.coerce.number().min(0).optional(),
  // O teto nao e estetico: acima dele o campo 26 do BR Code declara o tamanho
  // em tres digitos e o QR sai malformado, sem nada avisar. `pixKeyFits` mede
  // em bytes, que e como o leitor do QR conta.
  pix_key: z
    .string()
    .trim()
    .refine(pixKeyFits, `Máximo de ${MAX_PIX_KEY} caracteres`)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  pix_merchant_name: z.string().trim().max(25, "Máximo de 25 caracteres").optional().or(z.literal("")).transform((v) => v || undefined),
  pix_merchant_city: z.string().trim().max(15, "Máximo de 15 caracteres").optional().or(z.literal("")).transform((v) => v || undefined),
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
      // O formato, e nao mais o total: `max_players` sai dos obrigatorios porque
      // `toRow` o IGNORA — quem escreve a coluna e `derivedCapacity`. O input
      // continua na tela e `buildPayload` continua mandando o valor; mante-lo
      // aqui recusaria quem o deixasse em branco por causa de um numero que nao
      // chega mais na coluna.
      ["teams_count", data.teams_count],
      ["players_per_team", data.players_per_team],
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
  .extend({ id: databaseId })
  .superRefine(refineChampionship);

export type ChampionshipFormValues = z.infer<typeof championshipFormSchema>;

// Admins may switch a championship to any status; the only rule is that the
// new status must differ from the current one. The stale-status safety check
// lives in the changeChampionshipStatus server action (.eq("status", from)).
export const statusChangeSchema = z
  .object({
    id: databaseId,
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
