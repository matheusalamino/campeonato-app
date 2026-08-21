import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeCpf } from "@/lib/cpf";
import { shouldPersistPlayerIdentity } from "@/features/registration/player-identity";
import { storagePathFromRef, type RegistrationBucket } from "@/features/registration/storage-ref";
import { makeRegistrationSchema } from "@/features/registration/schema";
import { computeTicketsTotal } from "@/features/registration/pricing";
import { skillsFor } from "@/features/registration/skills";
import { fieldErrorsFrom } from "@/features/registration/field-errors";
import type { SlotReservation } from "@/features/registration/slot";
import type { GroupOption } from "@/types/championship";

export type PlayerPrefill = {
  name?: string;
  shirt_name?: string;
  email?: string;
  whatsapp?: string;
  birth_date?: string;
  instagram?: string;
  birth_state?: string;
  preferred_position?: string;
  height?: number;
  weight?: number;
  group_affiliation?: string;
  shirt_size?: string;
  profile_photo_link?: string;
};

const PREFILL_COLUMNS =
  "id, name, shirt_name, email, whatsapp, birth_date, instagram, birth_state, preferred_position, height, weight";

export async function lookupPlayerByCpf(
  cpf: string,
): Promise<{ exists: false } | { exists: true; player: PlayerPrefill }> {
  const normalized = normalizeCpf(cpf);
  if (normalized.length !== 11) return { exists: false };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("players")
    .select(PREFILL_COLUMNS)
    .eq("cpf", normalized)
    .maybeSingle();

  if (!data) return { exists: false };

  const { id, ...prefill } = data as PlayerPrefill & { id: string };

  // Carry over the group, shirt size, and profile photo from the player's
  // most recent registration so returning players don't re-pick their group
  // and can see (and optionally replace) their existing photo. Shirt size is
  // deliberately not on `players`: shirts are ordered per championship
  // edition, so storing only the player's current size would make a past
  // edition's order lie as soon as the player's size changed.
  const { data: lastReg } = await supabase
    .from("championship_registrations")
    .select("group_affiliation, profile_photo_link, shirt_size")
    .eq("player_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    exists: true,
    player: {
      ...prefill,
      group_affiliation: lastReg?.group_affiliation ?? undefined,
      shirt_size: lastReg?.shirt_size ?? undefined,
      profile_photo_link: lastReg?.profile_photo_link ?? undefined,
    },
  };
}

/** Colunas de `championship_registrations` que apontam para um arquivo. */
const FILE_COLUMNS = [
  "profile_photo_link",
  "payment_receipt_link",
  "legal_authorization_link",
] as const;

/**
 * Diz se a referencia ja pertence a alguma inscricao. `null` quando a consulta
 * falha — quem chama trata como "nao sei" e nao apaga nada.
 *
 * Usa um `.eq()` por coluna em vez de montar um `.or()`: a referencia vem do
 * cliente e nao pode ser concatenada dentro da sintaxe de filtro do PostgREST.
 */
async function refIsInUse(supabase: SupabaseClient, ref: string): Promise<boolean | null> {
  for (const column of FILE_COLUMNS) {
    const { data, error } = await supabase
      .from("championship_registrations")
      .select("id")
      .eq(column, ref)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    if (data) return true;
  }
  return false;
}

/**
 * Remove um arquivo de inscricao que ainda nao foi vinculado a ninguem.
 *
 * Roda a partir de uma Server Action publica e usa o client service-role, que
 * ignora RLS — entao nao pode aceitar um caminho qualquer. Sem a checagem
 * abaixo, quem listasse o bucket publico de fotos apagaria a foto de qualquer
 * inscrito. O unico uso legitimo e a troca de arquivo no wizard, antes do
 * envio, quando o arquivo anterior ainda nao foi referenciado por nenhuma
 * inscricao.
 */
export async function deleteRegistrationFile(
  ref: string,
  bucket: RegistrationBucket,
): Promise<void> {
  const path = storagePathFromRef(ref, bucket);
  if (!path) return;

  const supabase = createAdminClient();

  // Falha fechada: so apaga o que conseguiu provar que esta livre.
  if ((await refIsInUse(supabase, ref)) !== false) return;

  await supabase.storage.from(bucket).remove([path]);
}

/** Per-IP sliding-window limit for the public CPF lookup. Returns true if allowed. */
export async function checkLookupRateLimit(ip: string): Promise<boolean> {
  const supabase = createAdminClient();
  const now = Date.now();
  const windowStart = new Date(now - 60_000).toISOString();
  // Opportunistic prune of this IP's stale rows (keeps the table bounded).
  await supabase
    .from("registration_lookup_attempts")
    .delete()
    .eq("ip", ip)
    .lt("attempted_at", new Date(now - 3_600_000).toISOString());
  const { count, error } = await supabase
    .from("registration_lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("attempted_at", windowStart);
  if (error) return false; // fail closed on a rate-check error
  if ((count ?? 0) >= 20) return false;
  await supabase.from("registration_lookup_attempts").insert({ ip });
  return true;
}

/** Razoes que a RPC declara no seu COMMENT, fora `all_reserved`, que tem forma propria. */
const RPC_REASONS = ["not_found", "not_open", "already_registered", "full"] as const;

function isKnownReason(value: unknown): value is (typeof RPC_REASONS)[number] {
  return typeof value === "string" && (RPC_REASONS as readonly string[]).includes(value);
}

/**
 * Reserva a vaga do jogador enquanto ele preenche.
 *
 * A decisao de principal ou espera acontece dentro da funcao do banco, sob lock
 * da linha do campeonato — e a unica forma de contar e classificar sem que
 * outra transacao insira no meio.
 */
export async function reserveSlot(
  championshipId: string,
  cpf: string,
): Promise<SlotReservation> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("reserve_registration_slot", {
    p_championship_id: championshipId,
    p_cpf: normalizeCpf(cpf),
  });

  // A chamada nao completou: nada aqui diz se ha vaga. Devolver `not_found`,
  // como era antes, transformava PostgREST fora do ar em "campeonato esgotado"
  // na tela do jogador.
  if (error || !data) return { ok: false, reason: "error" };

  const result = data as {
    success: boolean;
    reason?: string;
    is_waitlist?: boolean;
    expires_at?: string;
    retry_at?: string | null;
  };

  if (result.success) {
    return { ok: true, isWaitlist: !!result.is_waitlist, expiresAt: result.expires_at! };
  }
  if (result.reason === "all_reserved") {
    return { ok: false, reason: "all_reserved", retryAt: result.retry_at ?? null };
  }
  // O `as` que estava aqui carimbava qualquer string vinda do JSON como uma das
  // quatro razoes, entao uma razao nova na RPC — ou uma resposta malformada —
  // seria renderizada como um veredito que ninguem deu. Razao que nao esta na
  // lista e resposta que nao entendemos, e nao ha lotacao a declarar: `error`
  // convida a tentar de novo, que e a unica resposta honesta.
  return isKnownReason(result.reason)
    ? { ok: false, reason: result.reason }
    : { ok: false, reason: "error" };
}

export async function getOpenRegistrationChampionship(): Promise<{ slug: string; name: string } | null> {
  // Reads public championship data (anon-readable) for the landing header, so it
  // uses the anon server client — NOT the service-role admin client. This keeps
  // the public landing independent of SUPABASE_SERVICE_ROLE_KEY. Any failure
  // degrades to "no open championship" (button hidden) rather than crashing the
  // landing, since this is a non-critical convenience link.
  try {
    const supabase = await createClient();
    const agora = new Date().toISOString();
    const { data } = await supabase
      .from("championships")
      .select("slug, name, registration_start_date, registration_end_date")
      .in("status", ["subscribing", "rest"])
      .not("slug", "is", null)
      .is("deleted_at", null)
      // Data nula nao e borda: campeonato sem janela configurada continua
      // elegivel, do mesmo jeito que registrationGate e as RPCs tratam nulo.
      .or(`registration_start_date.is.null,registration_start_date.lte.${agora}`)
      .or(`registration_end_date.is.null,registration_end_date.gte.${agora}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function submitRegistration(
  input: unknown,
): Promise<
  | { ok: true; registrationId: string; isWaitlist: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; alreadyRegistered?: boolean }
> {
  const supabase = createAdminClient();

  // Peek the slug so we can load the championship config for the schema.
  const slug =
    typeof input === "object" && input && "championship_slug" in input
      ? String((input as { championship_slug: unknown }).championship_slug)
      : "";

  const { data: champ } = await supabase
    .from("championships")
    .select("id, status, max_players, max_waitlist_players, base_price, extra_ticket_price, registration_group_options, max_extra_tickets")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!champ) return { ok: false, error: "Campeonato não encontrado." };
  if (champ.status !== "subscribing") {
    return { ok: false, error: "As inscrições não estão abertas para este campeonato." };
  }

  const groupOptions = (champ.registration_group_options ?? []) as GroupOption[];
  const parsed = makeRegistrationSchema(groupOptions, champ.max_extra_tickets).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const data = parsed.data;

  // Server-authoritative total; require receipt when there is anything to pay.
  const total = computeTicketsTotal({
    basePrice: champ.base_price,
    extraTicketPrice: champ.extra_ticket_price,
    extraTicketsCount: data.extra_tickets_count,
  });
  if (total > 0 && !data.payment_receipt_link) {
    return {
      ok: false,
      error: "Comprovante de pagamento é obrigatório.",
      fieldErrors: { payment_receipt_link: "Envie o comprovante de pagamento" },
    };
  }

  // Idempotency: reject a second registration for this player + championship,
  // BEFORE any write, so a duplicate attempt never mutates the player's
  // existing identity fields.
  const cpf = normalizeCpf(data.cpf);
  const { data: existingPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();
  if (existingPlayer) {
    const { data: existingReg } = await supabase
      .from("championship_registrations")
      .select("id")
      .eq("championship_id", champ.id)
      .eq("player_id", existingPlayer.id)
      .maybeSingle();
    if (existingReg) {
      return { ok: false, error: "Você já está inscrito neste campeonato.", alreadyRegistered: true };
    }
  }

  // Grava a identidade apenas para um CPF novo — ver shouldPersistPlayerIdentity.
  // Um upsert aqui deixaria qualquer pessoa que digitasse o CPF de outra
  // reescrever nome, e-mail, WhatsApp e data de nascimento dela.
  let playerId: string;
  if (shouldPersistPlayerIdentity(existingPlayer?.id ?? null)) {
    const playerRow = {
      cpf,
      name: data.name,
      shirt_name: data.shirt_name,
      email: data.email,
      whatsapp: data.whatsapp,
      birth_date: data.birth_date,
      birth_state: data.birth_state,
      instagram: data.instagram || null,
      preferred_position: data.preferred_position,
      height: data.height,
      weight: data.weight,
    };
    const { data: created, error: playerErr } = await supabase
      .from("players")
      .insert(playerRow)
      .select("id")
      .single();
    // Uma submissao concorrente com o mesmo CPF perde no UNIQUE de players.cpf;
    // nesse caso o jogador ja existe e seguimos com o registro dele.
    if (playerErr || !created) {
      const { data: raced } = await supabase
        .from("players")
        .select("id")
        .eq("cpf", cpf)
        .maybeSingle();
      if (!raced) return { ok: false, error: "Não foi possível salvar o jogador." };
      playerId = raced.id;
    } else {
      playerId = created.id;
    }
  } else {
    playerId = existingPlayer!.id;
  }

  // A gravacao inteira vai numa transacao do banco: inscricao, autoavaliacoes,
  // consumo da reserva e fechamento por lotacao. Antes, as autoavaliacoes eram
  // inseridas com o erro descartado, e a contagem de vagas era feita fora de
  // qualquer lock.
  const skillKeys = skillsFor(data.preferred_position);
  const skills: Record<string, number> = {};
  for (const skill of skillKeys) skills[skill] = Number(data.skills[skill] ?? 1);

  const { data: committed, error: commitErr } = await supabase.rpc("commit_registration", {
    p_championship_id: champ.id,
    p_player_id: playerId,
    p_cpf: cpf,
    p_registration: {
      group_affiliation: data.group_affiliation,
      shirt_size: data.shirt_size,
      invite_code: data.invite_code,
      extra_tickets_count: data.extra_tickets_count,
      tickets_total: total,
      profile_photo_link: data.profile_photo_link,
      payment_receipt_link: data.payment_receipt_link,
      legal_authorization_link: data.legal_authorization_link,
      pix_txid: data.pix_txid,
    },
    p_skills: skills,
  });

  if (commitErr || !committed) {
    return { ok: false, error: "Não foi possível concluir a inscrição. Tente novamente." };
  }

  const result = committed as {
    success: boolean;
    reason?: string;
    registration_id?: string;
    is_waitlist?: boolean;
  };

  if (!result.success) {
    if (result.reason === "already_registered") {
      return { ok: false, error: "Você já está inscrito neste campeonato.", alreadyRegistered: true };
    }
    if (result.reason === "reservation_expired") {
      return {
        ok: false,
        error: "Sua vaga expirou e as inscrições lotaram. Fale com a organização.",
      };
    }
    return { ok: false, error: "As inscrições não estão abertas para este campeonato." };
  }

  return { ok: true, registrationId: result.registration_id!, isWaitlist: !!result.is_waitlist };
}
