import type { EmailSender } from "@/lib/email/port";
import { isBulkKind, isEmailKind, isOrganizerKind, type EmailKind } from "./kinds";
// `import type`, e dos DOIS lados: `render.ts` importa `OutboxRow`,
// `Recipient` e `RegistrationSummary` daqui. Import de TIPO e apagado na
// compilacao, entao nao existe ciclo em tempo de execucao -- e `tsc --noEmit`
// em zero e a prova. No dia em que um dos dois lados precisar de um VALOR do
// outro, a saida e mover os tipos partilhados para `features/email/types.ts`,
// e nao forcar.
import type { EmailRenderer } from "./render";
import { kindNeedsVerificationLink, verificationLinkFor } from "./verification";

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
 * `expect(1).toBe(2)` deixa a suite verde e a contagem de arquivos e de testes
 * exatamente onde estava -- ele nao e coletado. A regra do repo, escrita no
 * proprio vitest.config.ts, e que regra vai para `features/**` e so a FIACAO
 * fica no servico.
 *
 * Entao a divisao aqui e essa: TUDO que decide alguma coisa esta neste arquivo,
 * e `services/email-outbox.ts` so amarra o cliente do Supabase, as variaveis de
 * ambiente e o remetente do Brevo a estas funcoes.
 *
 * ── O instante e ARGUMENTO ───────────────────────────────────────────────────
 *
 * `drainOutbox` recebe `now` e nunca chama `Date.now()` por dentro. Isso vem de
 * cicatriz: `scripts/test-registration-slots.sh` nao tem relogio injetavel --
 * `reserve_registration_slot` e `commit_registration` chamam `is_sabbath(now())`
 * --, entao durante a pausa de sabado toda reserva e todo commit devolvem
 * `sabbath` e a suite fica inutilizavel. Nao e a suite inteira que cai (o
 * cabecalho daquele arquivo tem a medicao: passam os cenarios que montam a
 * janela DENTRO de uma transacao), mas o portao fica cego 24 horas por semana,
 * todo fim de semana.
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
 * Acima da faixa a espera para no ultimo degrau; abaixo dela, e para entrada
 * que nao e numero, cai no primeiro -- nunca em NaN. Uma espera NaN vira
 * `next_attempt_at` invalido, e isso e um e-mail que nunca mais sai sem
 * ninguem perceber que faltou.
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
 *  2. `siteUrl` antes da cota pelo MESMO motivo do item 1, e nao por economia
 *     de consulta: a contagem da cota e lida uma vez por lote, antes deste
 *     laco, com base de link ou sem ela -- esta ordem nao poupa leitura
 *     nenhuma. O que ela decide e o motivo gravado. Base de link faltando e
 *     configuracao de implantacao errada, e mostrar isso como cota estourada
 *     manda quem for depurar procurar no provedor um problema que esta no
 *     ambiente.
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

/**
 * O que o banco sabe sobre uma inscricao, do ponto de vista de quem vai montar
 * o e-mail: para onde ele vai, e o que ele precisa dizer.
 *
 * ── POR QUE NAO SE CHAMA `RegistrationContact` ──
 *
 * Porque chamava, enquanto tinha so os tres campos de ENDERECO. Nome de
 * campeonato e lista de espera nao sao contato de ninguem, e um tipo chamado
 * `Contact` carregando-os e prosa que nasce mentindo -- este repo ja pagou por
 * isso.
 *
 * ── TUDO NULAVEL, E NADA DISSO E DESCUIDO ──
 *
 * `championship_registrations.championship_id` e `player_id` sao NULLABLE
 * (medido em `\d championship_registrations`), entao os dois joins podem voltar
 * vazios. O `?? ""` que calaria o TypeScript aqui e exatamente o que produz
 * "Olá , sua inscrição em  está confirmada": quem decide o que dizer sem o dado
 * e o TEMPLATE, e ele tem assertiva para cada buraco.
 *
 * `isWaitlist` nao e nulavel porque a coluna e NOT NULL DEFAULT false.
 */
export type RegistrationSummary = {
  contactEmail: string | null;
  playerEmail: string | null;
  playerName: string | null;
  championshipName: string | null;
  isWaitlist: boolean;
  /** O CODIGO da coluna (`GOL|ZAG|MEI|ATA`), cru. Quem traduz para palavra e o
   *  template, com `positionLabel`. */
  preferredPosition: string | null;
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
 *
 * Recebe o RESUMO inteiro e olha so os tres campos de endereco, e isso e
 * deliberado: DESTINO e CONTEUDO se decidem separado. Enquanto esta funcao nao
 * souber o que o e-mail diz, ela nao tem como escolher o destino em funcao do
 * texto -- que e o caminho para o aviso interno cair na caixa do inscrito.
 */
export function recipientFor(
  kind: EmailKind,
  summary: RegistrationSummary | null,
  organizerEmail: string | null,
): Recipient | null {
  if (isOrganizerKind(kind)) {
    const org = limpo(organizerEmail);
    return org ? { email: org, name: null } : null;
  }
  if (!summary) return null;
  const email = limpo(summary.contactEmail) ?? limpo(summary.playerEmail);
  return email ? { email, name: limpo(summary.playerName) } : null;
}

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
  /** Chamava-se `loadContacts` enquanto so trazia endereco. Trocou de nome pelo
   *  mesmo motivo que o tipo: leitura que traz nome de campeonato e lista de
   *  espera nao e leitura de contato. */
  loadSummaries(registrationIds: string[]): Promise<Map<string, RegistrationSummary>>;
  markSent(id: string, providerMessageId: string, at: Date): Promise<void>;
  /** Volta para `pending` GASTANDO um degrau da escada: e para falha de envio. */
  requeue(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  /** Volta para `pending` sem gastar degrau nem adiar: e para condicao que nao
   *  e falha da linha (sabado, cota, base de link, template faltando). */
  defer(id: string): Promise<void>;
  /**
   * Sem `at`, e a ausencia e deliberada. Estado terminal GUARDA o carimbo do
   * claim -- e assim que `markSent` se comporta, e e a leitura uniforme das
   * quatro gravacoes: terminal guarda, volta para a fila zera. Um `at` aqui so
   * teria uso para sobrescrever `claimed_at` com o instante da falha, que e
   * justamente o que quebraria essa uniformidade.
   *
   * Ha assertiva prendendo isto em outbox.test.ts ("nao passa argumento morto
   * para markFailedPermanent"): funcao com menos parametros e atribuivel a um
   * tipo com mais, entao o `tsc` NAO acusa um argumento que ninguem le -- foi
   * assim que `at` ficou aqui morto por uma rodada inteira.
   */
  markFailedPermanent(id: string, lastError: string): Promise<void>;
  /**
   * Emite um token NOVO para esta inscricao, grava o hash e devolve o valor em
   * claro para o link. `null` quando nao ha o que verificar.
   *
   * ── TRES CONSEQUENCIAS, E NENHUMA E DETALHE ──
   *
   * 1. **Emitir SEMPRE mata o link anterior.** O banco guarda so o hash
   *    (migration 20260823020000), entao o valor em claro de um token antigo e
   *    IRRECUPERAVEL: reenviar o comprovante obriga a emitir de novo, e o link
   *    do e-mail velho passa a responder "este link nao vale mais". E o
   *    comportamento certo -- um endereco tem um link valido por vez --, mas
   *    quem nao souber disso vai abrir chamado achando que e defeito.
   *
   * 2. **Ja verificada devolve `null`.** Nao ha o que pedir a quem ja provou a
   *    posse da caixa, e o comprovante sai sem o bloco do link -- a T5 ja abriu
   *    essa porta com `verificationLink: string | null`.
   *
   * 3. **Sem `contact_email` devolve `null`.** Inscricao criada pelo admin nao
   *    tem endereco nesta edicao: a coluna so e preenchida pelo caminho publico
   *    (`commit_registration`, migration 20260823030000).
   *
   * A regra dos dois `null` mora em `canIssueVerificationToken`
   * (features/email/verification.ts), onde ha teste; aqui fica so a assinatura.
   *
   * ── QUANDO O DRENO CHAMA, E POR QUE NAO ANTES ──
   *
   * Depois de `decideSend` dizer que ENVIA, e nao antes. A chamada tem efeito
   * colateral irreversivel (consequencia 1), e as guardas adiam linha: emitir
   * antes delas faria um sabado, uma cota estourada ou uma base de link
   * faltando MATAREM o link que ja estava valendo na caixa da pessoa, sem
   * mandar nenhum e-mail novo no lugar.
   */
  issueVerificationToken(registrationId: string): Promise<string | null>;
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

/**
 * Emite o token e devolve o LINK, ou `null` quando nao ha o que verificar.
 *
 * A montagem do link mora em `verificationLinkFor`, e nao aqui, porque o
 * caminho da rota (`verify-email`) tem de existir num lugar so -- ele tambem e
 * o nome de uma pasta em `app/`, e nada no TypeScript liga os dois.
 */
async function emitirLinkDeVerificacao(
  store: OutboxStore,
  registrationId: string,
  siteUrl: string,
): Promise<string | null> {
  const plain = await store.issueVerificationToken(registrationId);
  return plain ? verificationLinkFor(siteUrl, plain) : null;
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
  const resumos = ids.length > 0 ? await store.loadSummaries(ids) : new Map();

  for (const row of rows) {
    // `kind` e coluna `text` sem CHECK de valor. Uma linha com nome que este
    // codigo nao conhece nao tem como ser classificada nem montada, e ficar
    // adiando para sempre esconderia o defeito: morre e deixa o nome no
    // `last_error`.
    if (!isEmailKind(row.kind)) {
      await store.markFailedPermanent(row.id, `kind desconhecido: ${row.kind}`);
      report.failedPermanent += 1;
      conta(report, "unknown_kind");
      continue;
    }
    const kind: EmailKind = row.kind;

    const regId = registrationIdFrom(row);
    const summary: RegistrationSummary | null = regId ? (resumos.get(regId) ?? null) : null;
    const recipient = recipientFor(kind, summary, deps.organizerEmail);

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
        await store.markFailedPermanent(row.id, `recusado: ${decision.reason}`);
        report.failedPermanent += 1;
      }
      continue;
    }

    // ── O TOKEN NASCE AQUI, E A POSICAO DESTA LINHA E LOAD-BEARING ──
    //
    // Depois das guardas, e antes do corpo.
    //
    // Depois das guardas porque emitir MATA o link anterior de forma
    // irreversivel (o banco so guarda o hash). Emitindo antes, um sabado, uma
    // cota estourada ou uma base de link faltando -- que apenas ADIAM a linha --
    // apagariam o link que ja estava valendo na caixa da pessoa sem mandar
    // nenhum e-mail novo no lugar.
    //
    // Antes do corpo porque `renderEmail` e funcao PURA: ela nao escreve no
    // banco, e o hash precisa estar gravado antes de o link ir no texto.
    //
    // `regId` nulo (payload sem `registration_id`) nao emite nada: nao ha
    // inscricao para verificar.
    //
    // MEDIDO com sonda, porque a versao anterior desta frase errava o motivo:
    // uma linha assim NAO chega ate aqui. Sem `registration_id` nao ha resumo,
    // sem resumo `recipientFor` devolve null, e a guarda `no_recipient` MATA a
    // linha antes de qualquer emissao -- o relatorio volta
    // `{ failedPermanent: 1, reasons: { no_recipient: 1 } }`, e nao `no_body`.
    // A guarda continua escrita porque o dia em que um `kind` de organizador
    // passar a pedir link (o destino dele nao depende do resumo) ela e o que
    // sobra.
    const verificationLink =
      kindNeedsVerificationLink(kind) && regId
        ? await emitirLinkDeVerificacao(store, regId, decision.siteUrl)
        : null;

    // `recipient` e nao-nulo aqui porque `decision.recipient` so existe depois
    // da guarda `no_recipient`; o `??` e para o TypeScript, nao para o caso.
    const message = deps.render({
      kind,
      row,
      recipient: recipient ?? { email: decision.recipient, name: null },
      siteUrl: decision.siteUrl,
      summary,
      verificationLink,
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
    await store.markFailedPermanent(row.id, result.error);
    report.failedPermanent += 1;
  }

  return report;
}
