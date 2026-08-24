import type { EmailMessage, EmailSender } from "@/lib/email/port";
import { isBulkKind, isEmailKind, isOrganizerKind, type EmailKind } from "./kinds";

/**
 * O DRENO da caixa de saida: quem tira as linhas de `email_outbox` e as
 * transforma em e-mail enviado.
 *
 * Ate aqui a fila so enchia. O gatilho da inscricao escreve duas linhas por
 * inscricao (migration 20260823030000) e ninguem as lia.
 *
 * ── Por que este arquivo esta em features/ e nao em services/ ────────────────
 *
 * Porque `vitest.config.ts` nao inclui `services/**`, e um teste escrito la NAO
 * RODA. Isso e medido, nao suposto: um arquivo `services/*.test.ts` afirmando
 * `expect(1).toBe(2)` deixa a suite em 60 arquivos e 702 testes, verde. A regra
 * do repo, escrita no proprio vitest.config.ts, e que regra vai para
 * `features/**` e so a FIACAO fica no servico.
 *
 * Entao a divisao aqui e essa: TUDO que decide alguma coisa esta neste arquivo,
 * e `services/email-outbox.ts` so amarra o cliente do Supabase, as variaveis de
 * ambiente e o remetente do Brevo a estas funcoes.
 *
 * ── O instante e ARGUMENTO ───────────────────────────────────────────────────
 *
 * `drainOutbox` recebe `now` e nunca chama `Date.now()` por dentro. Isso vem de
 * cicatriz: `scripts/test-registration-slots.sh` nao tem relogio injetavel e
 * por isso falha inteiro durante a pausa de sabado -- um portao cego 24 horas
 * por semana, todo fim de semana.
 *
 * ── Nada aqui conhece o Brevo ────────────────────────────────────────────────
 *
 * O dreno recebe um `EmailSender` (lib/email/port.ts) e nao sabe quem esta do
 * outro lado. E por isso que a suite deste arquivo nao toca a rede -- e por
 * isso que ela pode envenenar o `fetch` global e continuar verde.
 */

// ─────────────────────────────────────────────────────────────────────────────
// A escada de reentrega
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1min, 5min, 30min, 2h, 12h. Depois disso, 12h para sempre.
 *
 * O teto existe porque uma escada sem fim vira linha que nunca mais e tentada,
 * e uma escada curta demais gasta a cota de 300/dia retentando o que so vai
 * voltar quando o provedor voltar.
 */
export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

/**
 * A espera depois da tentativa de numero `attempts` -- ou seja, `attempts` ja
 * CONTA a que acabou de falhar. Quem chama incrementa primeiro.
 *
 * Entrada fora da faixa cai no primeiro degrau em vez de virar NaN: uma espera
 * NaN vira `next_attempt_at` invalido, e isso e um e-mail que nunca mais sai
 * sem ninguem perceber que faltou.
 */
export function nextAttemptDelay(attempts: number): number {
  const degrau = Math.min(Math.max(Math.trunc(attempts) - 1, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[Number.isFinite(degrau) ? degrau : 0];
}

/** A meia-noite UTC do dia de `at`. E a janela da cota diaria: o teto do Brevo
 *  vira em UTC, e nao no fuso do campeonato. */
export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** O teto do plano gratuito do Brevo: 300 e-mails por dia, remetente unico. */
export const BREVO_DAILY_QUOTA = 300;

/** Quantas linhas um disparo do dreno leva de uma vez. */
export const DEFAULT_BATCH_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// A decisao de enviar
// ─────────────────────────────────────────────────────────────────────────────

export type SendDecisionContext = {
  sabbath: boolean;
  siteUrl: string | null;
  sentToday: number;
  dailyQuota: number;
  optOut: boolean;
  kind: EmailKind;
  recipient: string | null;
};

export type SendRefusalReason =
  | "sabbath"
  | "no_site_url"
  | "quota"
  | "opt_out"
  | "no_recipient";

export type SendDecision =
  | { send: true; siteUrl: string; recipient: string }
  | { send: false; reason: SendRefusalReason; requeue: boolean };

/**
 * A ORDEM das cinco guardas nao e arbitraria, e o motivo de cada posicao e o
 * que o motivo REGISTRADO vai dizer a quem for depurar:
 *
 *  1. `sabbath` primeiro porque e a unica condicao que nao e defeito de nada.
 *     Se a cota viesse antes, uma fila cheia na noite de sexta apareceria como
 *     cota estourada -- as duas adiam a linha, entao o banco fica igual, e o
 *     leitor de domingo de manha procura o problema no lugar errado.
 *  2. `siteUrl` antes da cota porque sem base de link nada pode sair, e gastar
 *     leitura de cota para uma linha que nao vai sair e ruido.
 *  3. `quota` antes de `opt_out` porque as consequencias divergem: cota ADIA,
 *     descadastro MATA. Na ordem trocada, um dia de cota estourada mataria
 *     lembretes que voltariam a ser enviaveis no dia seguinte.
 *  4. `opt_out` antes de `no_recipient` porque uma linha de quem se
 *     descadastrou morre por descadastro, e nao por endereco faltando -- e o
 *     motivo e a unica coisa que sobra no `last_error`.
 *  5. `no_recipient` por ultimo: e o que so se descobre depois de resolver o
 *     destino, e quase sempre significa dado ausente, nao politica.
 *
 * `isBulkKind` dentro da guarda 4 e a linha que separa "respeitar descadastro"
 * de "engolir o comprovante". Transacional sai mesmo para quem se descadastrou:
 * a pessoa PEDIU o comprovante ao se inscrever, e ele nao existe em outro
 * lugar.
 */
export function decideSend(ctx: SendDecisionContext): SendDecision {
  if (ctx.sabbath) return { send: false, reason: "sabbath", requeue: true };
  if (!ctx.siteUrl) return { send: false, reason: "no_site_url", requeue: true };
  if (ctx.sentToday >= ctx.dailyQuota) return { send: false, reason: "quota", requeue: true };
  if (ctx.optOut && isBulkKind(ctx.kind)) {
    return { send: false, reason: "opt_out", requeue: false };
  }
  if (!ctx.recipient) return { send: false, reason: "no_recipient", requeue: false };
  return { send: true, siteUrl: ctx.siteUrl, recipient: ctx.recipient };
}

// ─────────────────────────────────────────────────────────────────────────────
// A linha, o destino e o corpo
// ─────────────────────────────────────────────────────────────────────────────

export type OutboxRow = {
  id: string;
  kind: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type Recipient = { email: string; name: string | null };

/** O que o banco sabe sobre quem se inscreveu, do ponto de vista do endereco. */
export type RegistrationContact = {
  contactEmail: string | null;
  playerEmail: string | null;
  playerName: string | null;
};

/** O identificador que o gatilho grava no payload. Nao aceita numero nem string
 *  vazia: `payload` e jsonb livre, e um id malformado que passasse daqui viraria
 *  consulta que nao acha nada e linha morta por "sem destinatario" -- motivo
 *  errado para o defeito certo. */
export function registrationIdFrom(row: OutboxRow): string | null {
  const raw = row.payload?.["registration_id"];
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id === "" ? null : id;
}

function limpo(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Para onde vai esta linha.
 *
 * Dois destinos possiveis, e confundi-los e o pior erro alcancavel aqui: o
 * aviso interno de inscricao nova cair na caixa do proprio inscrito, com um
 * texto que nem foi escrito para ele.
 *
 * Para o jogador, `contact_email` vence `players.email`. Nao e preferencia de
 * estilo: a submissao publica so grava identidade para CPF novo
 * (`shouldPersistPlayerIdentity`), entao para quem ja tem cadastro o endereco
 * de `players` pode estar velho -- e e justamente quem trocou de e-mail que
 * digita o novo no formulario.
 */
export function recipientFor(
  kind: EmailKind,
  contact: RegistrationContact | null,
  organizerEmail: string | null,
): Recipient | null {
  if (isOrganizerKind(kind)) {
    const org = limpo(organizerEmail);
    return org ? { email: org, name: null } : null;
  }
  if (!contact) return null;
  const email = limpo(contact.contactEmail) ?? limpo(contact.playerEmail);
  return email ? { email, name: limpo(contact.playerName) } : null;
}

export type RenderInput = {
  kind: EmailKind;
  row: OutboxRow;
  recipient: Recipient;
  siteUrl: string;
};

/** Monta o corpo, ou devolve null quando nao ha corpo a montar para esta linha. */
export type EmailRenderer = (input: RenderInput) => EmailMessage | null;

/**
 * STUB, e nada alem disso: nao existe template neste repo na data deste
 * arquivo, e inventar um aqui seria escrever texto que ninguem revisou para
 * mandar a jogador de verdade.
 *
 * Devolve null para toda linha, e null ADIA em vez de matar -- ver `no_body` em
 * drainOutbox. Enquanto este for o `render` em uso, a fila cresce e nenhum
 * e-mail sai, e essa e a falha correta: visivel e reversivel.
 */
export const stubRenderer: EmailRenderer = () => null;

// ─────────────────────────────────────────────────────────────────────────────
// O dreno
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O banco, visto pelo dreno. Quem implementa isto sobre o Supabase e
 * `services/email-outbox.ts`.
 */
export type OutboxStore = {
  /** Pega o lote e o marca `sending` na MESMA instrucao, com FOR UPDATE SKIP
   *  LOCKED, para dois disparos simultaneos do cron nao mandarem o mesmo
   *  e-mail duas vezes. */
  claimBatch(limit: number, now: Date): Promise<OutboxRow[]>;
  isSabbath(at: Date): Promise<boolean>;
  countSentSince(since: Date): Promise<number>;
  loadContacts(registrationIds: string[]): Promise<Map<string, RegistrationContact>>;
  markSent(id: string, providerMessageId: string, at: Date): Promise<void>;
  /** Volta para `pending` GASTANDO um degrau da escada: e para falha de envio. */
  requeue(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  /** Volta para `pending` sem gastar degrau nem adiar: e para condicao que nao
   *  e falha da linha (sabado, cota, base de link, template faltando). */
  defer(id: string): Promise<void>;
  markFailedPermanent(id: string, lastError: string, at: Date): Promise<void>;
};

export type DrainDeps = {
  store: OutboxStore;
  send: EmailSender;
  render: EmailRenderer;
  /** Hoje nao existe registro de descadastro neste repo -- nao ha tabela nem
   *  coluna. A pergunta ja e feita, e a resposta de hoje e sempre "nao". */
  isOptedOut: (email: string) => Promise<boolean>;
  now: Date;
  siteUrl: string | null;
  organizerEmail: string | null;
  batchSize?: number;
  dailyQuota?: number;
};

export type DrainSkipReason = SendRefusalReason | "no_body" | "unknown_kind";

export type DrainReport = {
  claimed: number;
  sent: number;
  requeued: number;
  deferred: number;
  failedPermanent: number;
  reasons: Partial<Record<DrainSkipReason, number>>;
};

function conta(report: DrainReport, reason: DrainSkipReason): void {
  report.reasons[reason] = (report.reasons[reason] ?? 0) + 1;
}

export async function drainOutbox(deps: DrainDeps): Promise<DrainReport> {
  const limit = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const dailyQuota = deps.dailyQuota ?? BREVO_DAILY_QUOTA;
  const { store, now } = deps;

  const rows = await store.claimBatch(limit, now);
  const report: DrainReport = {
    claimed: rows.length,
    sent: 0,
    requeued: 0,
    deferred: 0,
    failedPermanent: 0,
    reasons: {},
  };
  if (rows.length === 0) return report;

  // UMA vez por lote. Uma consulta por linha nao seria so desperdicio: a pausa
  // poderia comecar no meio do lote e a metade de baixo sairia com decisao
  // diferente da de cima, para o mesmo disparo do cron.
  const sabbath = await store.isSabbath(now);
  let sentToday = await store.countSentSince(startOfUtcDay(now));

  const ids = [...new Set(rows.map(registrationIdFrom).filter((id): id is string => id !== null))];
  const contacts = ids.length > 0 ? await store.loadContacts(ids) : new Map();

  for (const row of rows) {
    // `kind` e coluna `text` sem CHECK de valor. Uma linha com nome que este
    // codigo nao conhece nao tem como ser classificada nem montada, e ficar
    // adiando para sempre esconderia o defeito: morre e deixa o nome no
    // `last_error`.
    if (!isEmailKind(row.kind)) {
      await store.markFailedPermanent(row.id, `kind desconhecido: ${row.kind}`, now);
      report.failedPermanent += 1;
      conta(report, "unknown_kind");
      continue;
    }
    const kind: EmailKind = row.kind;

    const regId = registrationIdFrom(row);
    const contact = regId ? (contacts.get(regId) ?? null) : null;
    const recipient = recipientFor(kind, contact, deps.organizerEmail);

    const decision = decideSend({
      sabbath,
      siteUrl: deps.siteUrl,
      sentToday,
      dailyQuota,
      optOut: recipient ? await deps.isOptedOut(recipient.email) : false,
      kind,
      recipient: recipient?.email ?? null,
    });

    if (!decision.send) {
      conta(report, decision.reason);
      if (decision.requeue) {
        await store.defer(row.id);
        report.deferred += 1;
      } else {
        await store.markFailedPermanent(row.id, `recusado: ${decision.reason}`, now);
        report.failedPermanent += 1;
      }
      continue;
    }

    // `recipient` e nao-nulo aqui porque `decision.recipient` so existe depois
    // da guarda `no_recipient`; o `??` e para o TypeScript, nao para o caso.
    const message = deps.render({
      kind,
      row,
      recipient: recipient ?? { email: decision.recipient, name: null },
      siteUrl: decision.siteUrl,
    });

    // Template que falta e buraco de implantacao, nao dado ruim: matar a linha
    // perderia o acontecimento em silencio, e adiar deixa a fila crescer, que e
    // visivel.
    if (!message) {
      conta(report, "no_body");
      await store.defer(row.id);
      report.deferred += 1;
      continue;
    }

    const result = await deps.send(message);

    if (result.ok) {
      await store.markSent(row.id, result.providerMessageId, now);
      report.sent += 1;
      // Em memoria, de proposito: sem isto, um lote de 50 com a cota faltando 1
      // mandaria os 50, porque toda linha leria a mesma contagem tirada do
      // banco antes do lote.
      sentToday += 1;
      continue;
    }

    if (result.retriable) {
      const attempts = row.attempts + 1;
      await store.requeue(
        row.id,
        attempts,
        new Date(now.getTime() + nextAttemptDelay(attempts)),
        result.error,
      );
      report.requeued += 1;
      continue;
    }

    // Endereco invalido continua invalido, e chave errada continua errada.
    // Retentar isso para sempre queima a cota de 300/dia a toa.
    await store.markFailedPermanent(row.id, result.error, now);
    report.failedPermanent += 1;
  }

  return report;
}
