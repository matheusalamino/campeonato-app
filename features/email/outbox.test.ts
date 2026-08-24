import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { EmailMessage, EmailSender, SendResult } from "@/lib/email/port";
import {
  BREVO_DAILY_QUOTA,
  RETRY_DELAYS_MS,
  decideSend,
  drainOutbox,
  nextAttemptDelay,
  recipientFor,
  registrationIdFrom,
  startOfUtcDay,
  stubRenderer,
  type DrainDeps,
  type EmailRenderer,
  type OutboxRow,
  type OutboxStore,
  type RegistrationContact,
} from "./outbox";

// ─────────────────────────────────────────────────────────────────────────────
// A rede, envenenada
//
// O dreno existe para falar com um provedor de e-mail, e um teste que o
// exercita "quase de verdade" e exatamente o teste que um dia manda e-mail para
// alguem. Este par troca o `fetch` global por uma armadilha durante TODO o
// arquivo: qualquer chamada estoura em vez de sair.
//
// Isto discrimina, e a prova e curta: pondo `createBrevoSender({...})()` no
// lugar de um dos dubles abaixo, o teste fica vermelho com esta mensagem.
// ─────────────────────────────────────────────────────────────────────────────
const fetchOriginal = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("teste tocou a rede: o dreno recebe um EmailSender e nao deve conhecer fetch");
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = fetchOriginal;
});

describe("a armadilha da rede", () => {
  it("estoura se alguem chamar fetch", () => {
    // Sem esta assertiva, a armadilha acima passaria despercebida se alguem a
    // apagasse -- o resto do arquivo ficaria verde do mesmo jeito, porque
    // nenhum outro teste chama fetch nem por engano.
    //
    // Estouro SINCRONO, e nao promessa rejeitada: a armadilha lanca antes de
    // devolver qualquer coisa, entao `rejects` nao a alcanca.
    expect(() => fetch("https://exemplo.invalido")).toThrow(/tocou a rede/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A escada de reentrega
// ─────────────────────────────────────────────────────────────────────────────
describe("nextAttemptDelay", () => {
  it("comeca em um minuto", () => {
    expect(nextAttemptDelay(1)).toBe(60_000);
  });

  it("cresce a cada tentativa", () => {
    const escada = [1, 2, 3, 4, 5].map(nextAttemptDelay);
    for (let i = 1; i < escada.length; i += 1) {
      expect(escada[i]).toBeGreaterThan(escada[i - 1]);
    }
    expect(escada).toEqual([60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000]);
  });

  it("para no teto de doze horas", () => {
    const teto = 12 * 60 * 60_000;
    expect(nextAttemptDelay(5)).toBe(teto);
    expect(nextAttemptDelay(6)).toBe(teto);
    expect(nextAttemptDelay(50)).toBe(teto);
    expect(nextAttemptDelay(1_000_000)).toBe(teto);
  });

  it("nao devolve NaN nem negativo para entrada estranha", () => {
    // `attempts` vem da coluna `attempts` do banco. Ela e NOT NULL DEFAULT 0,
    // mas um 0 chega aqui em qualquer caminho que compute a espera antes de
    // incrementar -- e uma espera NaN vira `next_attempt_at` invalido, que e um
    // e-mail que nunca mais sai e ninguem ve faltando.
    expect(nextAttemptDelay(0)).toBe(60_000);
    expect(nextAttemptDelay(-3)).toBe(60_000);
    for (const d of RETRY_DELAYS_MS) expect(d).toBeGreaterThan(0);
  });
});

describe("startOfUtcDay", () => {
  it("zera a hora sem andar de dia", () => {
    expect(startOfUtcDay(new Date("2026-08-24T23:59:59.999Z")).toISOString()).toBe(
      "2026-08-24T00:00:00.000Z",
    );
    expect(startOfUtcDay(new Date("2026-08-24T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-24T00:00:00.000Z",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A decisao de enviar
//
// O `base` abaixo libera. Cada teste de guarda muda UM campo, e e por isso que
// apagar uma guarda acende um teste so: nenhum outro caso depende dela.
// ─────────────────────────────────────────────────────────────────────────────
const base = {
  sabbath: false,
  siteUrl: "https://campeonato.exemplo" as string | null,
  sentToday: 0,
  dailyQuota: 300,
  optOut: false,
  kind: "registration_committed" as const,
  recipient: "jogador@exemplo.test" as string | null,
};

describe("decideSend", () => {
  it("o caso normal libera", () => {
    expect(decideSend(base)).toEqual({
      send: true,
      siteUrl: "https://campeonato.exemplo",
      recipient: "jogador@exemplo.test",
    });
  });

  it("o sabado barra, e a linha espera", () => {
    expect(decideSend({ ...base, sabbath: true })).toEqual({
      send: false,
      reason: "sabbath",
      requeue: true,
    });
  });

  it("sem base de link, barra", () => {
    // A base errada manda o jogador para o ambiente errado e ele nao tem como
    // saber. `siteUrlFrom` devolve null em vez de palpite (lib/email/site-url.ts);
    // aqui e onde esse null vira recusa.
    expect(decideSend({ ...base, siteUrl: null })).toEqual({
      send: false,
      reason: "no_site_url",
      requeue: true,
    });
    expect(decideSend({ ...base, siteUrl: "" })).toEqual({
      send: false,
      reason: "no_site_url",
      requeue: true,
    });
  });

  it("a cota estourada barra, e a linha espera", () => {
    expect(decideSend({ ...base, sentToday: 300, dailyQuota: 300 })).toEqual({
      send: false,
      reason: "quota",
      requeue: true,
    });
    expect(decideSend({ ...base, sentToday: 299, dailyQuota: 300 }).send).toBe(true);
  });

  it("o descadastro barra o lembrete, e a linha morre", () => {
    expect(decideSend({ ...base, optOut: true, kind: "reminder_waitlist" })).toEqual({
      send: false,
      reason: "opt_out",
      requeue: false,
    });
  });

  it("o descadastro NAO barra o transacional", () => {
    // A separacao entre "respeitar descadastro" e "engolir o comprovante". Sem
    // o `isBulkKind` na guarda, quem clicou em descadastrar para de receber o
    // comprovante da propria inscricao -- e nao ha outro lugar onde ele exista.
    expect(decideSend({ ...base, optOut: true, kind: "registration_committed" }).send).toBe(true);
    expect(decideSend({ ...base, optOut: true, kind: "payment_verified" }).send).toBe(true);
    expect(decideSend({ ...base, optOut: true, kind: "waitlist_promoted" }).send).toBe(true);
    expect(decideSend({ ...base, optOut: true, kind: "organizer_new_registration" }).send).toBe(
      true,
    );
  });

  it("sem destinatario, barra e a linha morre", () => {
    expect(decideSend({ ...base, recipient: null })).toEqual({
      send: false,
      reason: "no_recipient",
      requeue: false,
    });
    expect(decideSend({ ...base, recipient: "" })).toEqual({
      send: false,
      reason: "no_recipient",
      requeue: false,
    });
  });

  it("o sabado vence a cota", () => {
    // A ORDEM, provada. Se a cota viesse antes do sabado, uma fila cheia na
    // noite de sexta seria lida como cota estourada. As duas recusas adiam a
    // linha, entao o efeito no banco e o mesmo e nada quebraria visivelmente --
    // o que muda e o motivo registrado, e o motivo e o que alguem vai ler as
    // duas da manha de domingo tentando entender por que nada saiu.
    expect(decideSend({ ...base, sabbath: true, sentToday: 300, dailyQuota: 300 })).toEqual({
      send: false,
      reason: "sabbath",
      requeue: true,
    });
  });

  it("o sabado vence a falta de base de link", () => {
    expect(decideSend({ ...base, sabbath: true, siteUrl: null }).send).toBe(false);
    expect(decideSend({ ...base, sabbath: true, siteUrl: null })).toMatchObject({
      reason: "sabbath",
    });
  });

  it("a falta de base de link vence a cota", () => {
    // A ordem entre a guarda 2 e a 3. As duas ADIAM, entao trocar uma pela
    // outra nao muda o estado da linha no banco -- muda so o `reason` gravado,
    // e o `reason` e a unica coisa que sobra para quem for entender por que
    // nada saiu. Sem esta assertiva o comentario de `decideSend` afirmava uma
    // ordem que nenhum teste defendia.
    expect(decideSend({ ...base, siteUrl: null, sentToday: 300, dailyQuota: 300 })).toEqual({
      send: false,
      reason: "no_site_url",
      requeue: true,
    });
  });

  it("a cota vence o descadastro", () => {
    // Cota antes de opt-out importa porque as consequencias sao diferentes:
    // cota ADIA, opt-out MATA. Na ordem trocada, um lembrete de quem se
    // descadastrou seria morto durante um dia de cota estourada -- o que aqui
    // da no mesmo, mas nao daria se a linha voltasse a ser enviavel depois.
    expect(
      decideSend({
        ...base,
        sentToday: 300,
        dailyQuota: 300,
        optOut: true,
        kind: "reminder_waitlist",
      }),
    ).toEqual({ send: false, reason: "quota", requeue: true });
  });

  it("o descadastro vence a falta de destinatario", () => {
    expect(
      decideSend({ ...base, optOut: true, kind: "reminder_waitlist", recipient: null }),
    ).toEqual({ send: false, reason: "opt_out", requeue: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quem recebe
// ─────────────────────────────────────────────────────────────────────────────
const contato: RegistrationContact = {
  contactEmail: "novo@exemplo.test",
  playerEmail: "velho@exemplo.test",
  playerName: "Fulano",
};

describe("recipientFor", () => {
  it("prefere o e-mail digitado NESTA inscricao", () => {
    // `contact_email` existe justamente porque players.email pode estar velho:
    // a submissao publica so grava identidade para CPF novo. Ver a migration
    // 20260823020000.
    expect(recipientFor("registration_committed", contato, "org@exemplo.test")).toEqual({
      email: "novo@exemplo.test",
      name: "Fulano",
    });
  });

  it("cai para players.email quando contact_email e nulo", () => {
    expect(
      recipientFor("registration_committed", { ...contato, contactEmail: null }, "org@exemplo.test"),
    ).toEqual({ email: "velho@exemplo.test", name: "Fulano" });
  });

  it("trata string vazia como ausente nos dois", () => {
    expect(
      recipientFor("registration_committed", { ...contato, contactEmail: "  " }, "org@x.test"),
    ).toEqual({ email: "velho@exemplo.test", name: "Fulano" });
    expect(
      recipientFor(
        "registration_committed",
        { contactEmail: "", playerEmail: "", playerName: null },
        "org@x.test",
      ),
    ).toBeNull();
  });

  it("manda o aviso da organizacao para a organizacao, nao para o jogador", () => {
    // O erro que esta assertiva impede e o pior desta task: o aviso interno de
    // inscricao nova cair na caixa do proprio inscrito. Ele nao e o
    // destinatario, e o texto nem e escrito para ele.
    expect(recipientFor("organizer_new_registration", contato, "org@exemplo.test")).toEqual({
      email: "org@exemplo.test",
      name: null,
    });
  });

  it("sem ORGANIZER_EMAIL, o aviso da organizacao nao tem para onde ir", () => {
    expect(recipientFor("organizer_new_registration", contato, null)).toBeNull();
    expect(recipientFor("organizer_new_registration", contato, "")).toBeNull();
  });

  it("sem contato, o e-mail do jogador nao tem para onde ir", () => {
    expect(recipientFor("registration_committed", null, "org@exemplo.test")).toBeNull();
  });
});

describe("registrationIdFrom", () => {
  const linha = (payload: Record<string, unknown>): OutboxRow => ({
    id: "row-1",
    kind: "registration_committed",
    dedupeKey: "d1",
    payload,
    attempts: 0,
  });

  it("le o identificador que o gatilho escreve", () => {
    expect(registrationIdFrom(linha({ registration_id: "abc" }))).toBe("abc");
  });

  it("devolve null quando nao ha identificador utilizavel", () => {
    expect(registrationIdFrom(linha({}))).toBeNull();
    expect(registrationIdFrom(linha({ registration_id: null }))).toBeNull();
    expect(registrationIdFrom(linha({ registration_id: 42 }))).toBeNull();
    expect(registrationIdFrom(linha({ registration_id: "" }))).toBeNull();
  });
});

describe("stubRenderer", () => {
  it("nao monta corpo nenhum, e diz isso devolvendo null", () => {
    // A montagem do corpo e de outro passo. O stub esta aqui para o dreno ter
    // um `render` de verdade nos testes de fiacao sem que este arquivo invente
    // um template -- e devolver null faz a linha ser ADIADA, nao morta.
    expect(
      stubRenderer({
        kind: "registration_committed",
        row: { id: "r", kind: "registration_committed", dedupeKey: "d", payload: {}, attempts: 0 },
        recipient: { email: "a@b.test", name: null },
        siteUrl: "https://x.test",
      }),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O dreno
// ─────────────────────────────────────────────────────────────────────────────
type Registro = {
  claims: Array<{ limit: number; now: string }>;
  sabbathCalls: number;
  // Os instantes com que o dreno pergunta, e nao so quantas vezes perguntou.
  // Duble que ignora o argumento torna o argumento INOBSERVAVEL: a chamada pode
  // passar qualquer coisa e nenhuma assertiva ve. Foi assim que a janela da
  // cota ficou sem rede -- havia teste para `startOfUtcDay` e teste para a
  // guarda de cota, e nenhum para a linha que liga os dois.
  sabbathAt: string[];
  quotaSince: string[];
  sent: Array<{ id: string; providerMessageId: string }>;
  requeued: Array<{ id: string; attempts: number; nextAttemptAt: string; lastError: string }>;
  deferred: string[];
  dead: Array<{ id: string; lastError: string }>;
  enviados: EmailMessage[];
};

function fakeStore(
  rows: OutboxRow[],
  opts: {
    sabbath?: boolean;
    sentToday?: number;
    contacts?: Record<string, RegistrationContact>;
  } = {},
): { store: OutboxStore; registro: Registro } {
  const registro: Registro = {
    claims: [],
    sabbathCalls: 0,
    sabbathAt: [],
    quotaSince: [],
    sent: [],
    requeued: [],
    deferred: [],
    dead: [],
    enviados: [],
  };
  const store: OutboxStore = {
    async claimBatch(limit, now) {
      registro.claims.push({ limit, now: now.toISOString() });
      return rows;
    },
    async isSabbath(at) {
      registro.sabbathCalls += 1;
      registro.sabbathAt.push(at.toISOString());
      return opts.sabbath ?? false;
    },
    async countSentSince(since) {
      registro.quotaSince.push(since.toISOString());
      return opts.sentToday ?? 0;
    },
    async loadContacts(ids) {
      const mapa = new Map<string, RegistrationContact>();
      for (const id of ids) {
        const c = opts.contacts?.[id];
        if (c) mapa.set(id, c);
      }
      return mapa;
    },
    async markSent(id, providerMessageId) {
      registro.sent.push({ id, providerMessageId });
    },
    async requeue(id, attempts, nextAttemptAt, lastError) {
      registro.requeued.push({
        id,
        attempts,
        nextAttemptAt: nextAttemptAt.toISOString(),
        lastError,
      });
    },
    async defer(id) {
      registro.deferred.push(id);
    },
    async markFailedPermanent(id, lastError) {
      registro.dead.push({ id, lastError });
    },
  };
  return { store, registro };
}

const AGORA = new Date("2026-08-24T12:00:00.000Z");

function linha(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: "row-1",
    kind: "registration_committed",
    dedupeKey: "reg-1",
    payload: { registration_id: "reg-1" },
    attempts: 0,
    ...over,
  };
}

const renderOk: EmailRenderer = ({ recipient, siteUrl }) => ({
  to: recipient.email,
  subject: "assunto",
  html: `<p>${siteUrl}</p>`,
  text: siteUrl,
});

function deps(
  store: OutboxStore,
  registro: Registro,
  over: Partial<DrainDeps> = {},
  resultado: SendResult = { ok: true, providerMessageId: "mid-1" },
): DrainDeps {
  const send: EmailSender = async (msg) => {
    registro.enviados.push(msg);
    return resultado;
  };
  return {
    store,
    send,
    render: renderOk,
    isOptedOut: async () => false,
    now: AGORA,
    siteUrl: "https://campeonato.exemplo",
    organizerEmail: "org@exemplo.test",
    ...over,
  };
}

describe("drainOutbox", () => {
  it("lote vazio nao pergunta mais nada", async () => {
    const { store, registro } = fakeStore([]);
    const r = await drainOutbox(deps(store, registro));
    expect(r.claimed).toBe(0);
    expect(registro.sabbathCalls).toBe(0);
    // A cota tambem nao. "Mais nada" so vale se as DUAS perguntas de lote
    // ficarem de fora -- e a da cota e uma contagem sobre a tabela inteira.
    expect(registro.quotaSince).toHaveLength(0);
    expect(registro.enviados).toHaveLength(0);
  });

  it("envia e marca sent", async () => {
    const { store, registro } = fakeStore([linha()], {
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(1);
    expect(registro.enviados[0].to).toBe("novo@exemplo.test");
    expect(registro.sent).toEqual([{ id: "row-1", providerMessageId: "mid-1" }]);
    expect(r).toMatchObject({ claimed: 1, sent: 1, deferred: 0, failedPermanent: 0, requeued: 0 });
  });

  it("consulta is_sabbath UMA vez por lote", async () => {
    // Uma consulta por linha nao seria so desperdicio: a pausa poderia comecar
    // no meio do lote e a metade de baixo sairia com decisao diferente da de
    // cima, para o mesmo disparo.
    const rows = [linha({ id: "a", dedupeKey: "reg-1" }), linha({ id: "b", dedupeKey: "reg-1" })];
    const { store, registro } = fakeStore(rows, { contacts: { "reg-1": contato } });
    await drainOutbox(deps(store, registro));
    expect(registro.sabbathCalls).toBe(1);
  });

  it("no sabado a linha e ADIADA, e sem gastar tentativa", async () => {
    // O que se mede aqui e a escolha entre `defer` e `requeue`: `defer` nao
    // mexe em `attempts` nem em `next_attempt_at`. Se o sabado gastasse degrau
    // da escada, uma pausa de 25 horas empurraria toda linha parada para o teto
    // de 12h -- e o comprovante de quem se inscreveu na sexta a noite so sairia
    // meio dia depois de a pausa acabar. Que a decisao vale para o LOTE, e nao
    // por linha, e o que "consulta is_sabbath UMA vez por lote" prende.
    const { store, registro } = fakeStore([linha()], {
      sabbath: true,
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.deferred).toEqual(["row-1"]);
    expect(registro.requeued).toHaveLength(0);
    expect(r.reasons.sabbath).toBe(1);
  });

  it("falha retriavel volta para a fila no primeiro degrau", async () => {
    const { store, registro } = fakeStore([linha({ attempts: 0 })], {
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(
      deps(store, registro, {}, { ok: false, retriable: true, error: "429 devagar" }),
    );
    expect(registro.requeued).toEqual([
      {
        id: "row-1",
        attempts: 1,
        nextAttemptAt: new Date(AGORA.getTime() + 60_000).toISOString(),
        lastError: "429 devagar",
      },
    ]);
    expect(registro.dead).toHaveLength(0);
    expect(r).toMatchObject({ requeued: 1, sent: 0 });
  });

  it("a escada anda com a tentativa que ja estava gravada", async () => {
    const { store, registro } = fakeStore([linha({ attempts: 3 })], {
      contacts: { "reg-1": contato },
    });
    await drainOutbox(
      deps(store, registro, {}, { ok: false, retriable: true, error: "500" }),
    );
    expect(registro.requeued[0].attempts).toBe(4);
    expect(registro.requeued[0].nextAttemptAt).toBe(
      new Date(AGORA.getTime() + 2 * 60 * 60_000).toISOString(),
    );
  });

  it("falha nao retriavel mata a linha", async () => {
    // Endereco invalido continua invalido. Retentar para sempre queima a cota
    // de 300/dia -- o teto do plano gratuito do Brevo.
    const { store, registro } = fakeStore([linha()], { contacts: { "reg-1": contato } });
    const r = await drainOutbox(
      deps(store, registro, {}, { ok: false, retriable: false, error: "400 email invalido" }),
    );
    expect(registro.dead).toEqual([{ id: "row-1", lastError: "400 email invalido" }]);
    expect(registro.requeued).toHaveLength(0);
    expect(r.failedPermanent).toBe(1);
  });

  it("kind desconhecido morre e nao chega no provedor", async () => {
    const { store, registro } = fakeStore([linha({ kind: "test_outbox_alpha" })], {
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.dead).toHaveLength(1);
    expect(registro.dead[0].lastError).toMatch(/kind desconhecido/);
    expect(r.failedPermanent).toBe(1);
  });

  it("o aviso da organizacao vai para ORGANIZER_EMAIL", async () => {
    const { store, registro } = fakeStore([linha({ kind: "organizer_new_registration" })], {
      contacts: { "reg-1": contato },
    });
    await drainOutbox(deps(store, registro));
    expect(registro.enviados[0].to).toBe("org@exemplo.test");
  });

  it("cai para players.email quando contact_email e nulo", async () => {
    const { store, registro } = fakeStore([linha()], {
      contacts: { "reg-1": { ...contato, contactEmail: null } },
    });
    await drainOutbox(deps(store, registro));
    expect(registro.enviados[0].to).toBe("velho@exemplo.test");
  });

  it("sem destinatario a linha morre, e nao volta para a fila", async () => {
    const { store, registro } = fakeStore([linha()], { contacts: {} });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.dead).toHaveLength(1);
    expect(registro.deferred).toHaveLength(0);
    expect(r.reasons.no_recipient).toBe(1);
  });

  it("a cota conta o que ESTE lote ja mandou", async () => {
    // Sem o incremento em memoria, um lote de 50 com a cota faltando 1 mandaria
    // os 50: cada linha leria a mesma contagem do banco, tirada antes do lote.
    const rows = [
      linha({ id: "a", dedupeKey: "reg-1" }),
      linha({ id: "b", dedupeKey: "reg-1" }),
      linha({ id: "c", dedupeKey: "reg-1" }),
    ];
    const { store, registro } = fakeStore(rows, {
      sentToday: 299,
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(deps(store, registro, { dailyQuota: 300 }));
    expect(registro.enviados).toHaveLength(1);
    expect(registro.deferred).toEqual(["b", "c"]);
    expect(r.reasons.quota).toBe(2);
  });

  it("sem base de link, a linha e ADIADA, e sem gastar tentativa", async () => {
    const { store, registro } = fakeStore([linha()], { contacts: { "reg-1": contato } });
    const r = await drainOutbox(deps(store, registro, { siteUrl: null }));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.deferred).toEqual(["row-1"]);
    // A metade "sem gastar tentativa" do nome, dita direto em vez de deduzida
    // da de cima: pega o dreno que adia E gasta degrau na mesma linha, que a
    // assertiva de `deferred` sozinha nao ve. E o mesmo par que o cenario do
    // sabado ja tinha.
    expect(registro.requeued).toHaveLength(0);
    expect(r.reasons.no_site_url).toBe(1);
  });

  it("o descadastro cala o lembrete e nao cala o comprovante", async () => {
    const lembrete = linha({ id: "a", kind: "reminder_waitlist", dedupeKey: "reg-1" });
    const comprovante = linha({ id: "b", kind: "registration_committed", dedupeKey: "reg-1" });
    const { store, registro } = fakeStore([lembrete, comprovante], {
      contacts: { "reg-1": contato },
    });
    const r = await drainOutbox(deps(store, registro, { isOptedOut: async () => true }));
    expect(registro.dead.map((d) => d.id)).toEqual(["a"]);
    expect(registro.sent.map((s) => s.id)).toEqual(["b"]);
    expect(r.reasons.opt_out).toBe(1);
  });

  it("sem template, ADIA a linha em vez de mata-la", async () => {
    // Template que falta e buraco de implantacao, nao dado ruim. Matar a linha
    // aqui perderia o acontecimento para sempre e em silencio; adiar deixa a
    // fila crescer, que e visivel.
    const { store, registro } = fakeStore([linha()], { contacts: { "reg-1": contato } });
    const r = await drainOutbox(deps(store, registro, { render: stubRenderer }));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.dead).toHaveLength(0);
    expect(registro.deferred).toEqual(["row-1"]);
    expect(r.reasons.no_body).toBe(1);
  });

  it("pede o lote com o tamanho e o instante recebidos", async () => {
    // O instante e ARGUMENTO. O dreno nunca chama now() por dentro: o
    // scripts/test-registration-slots.sh nao tem relogio injetavel e por isso
    // falha inteiro durante a pausa de sabado, 24 horas por semana.
    const { store, registro } = fakeStore([]);
    await drainOutbox(deps(store, registro, { batchSize: 7 }));
    expect(registro.claims).toEqual([{ limit: 7, now: AGORA.toISOString() }]);
  });

  it("a janela da cota comeca na meia-noite UTC do instante recebido", async () => {
    // A linha que liga `startOfUtcDay` a guarda de cota. Sem esta assertiva,
    // trocar `countSentSince(startOfUtcDay(now))` por `countSentSince(now)`
    // passa com a suite inteira verde -- e o dano nao aparece em teste nenhum:
    // `sent_at >= now` nunca casa com envio anterior, entao `sentToday` nasce 0
    // em TODO disparo. O teto de 300/dia deixa de existir entre disparos e sobra
    // so o contador em memoria do lote. Um cron de cinco em cinco minutos passa
    // a permitir milhares de e-mails por dia contra uma cota de 300, e quem
    // recusa e o Brevo, calado.
    const { store, registro } = fakeStore([linha()], { contacts: { "reg-1": contato } });
    await drainOutbox(deps(store, registro));
    expect(registro.quotaSince).toEqual(["2026-08-24T00:00:00.000Z"]);
    expect(registro.quotaSince[0]).toBe(startOfUtcDay(AGORA).toISOString());
  });

  it("pergunta pelo sabado no instante recebido", async () => {
    // Mesmo buraco, outra pergunta, e esta e a pior das duas: perguntar pela
    // pausa com o instante errado manda e-mail durante o sabado, e isso nao se
    // desfaz. `sabbathCalls` sozinho so contava as chamadas -- o QUANDO era
    // inobservavel.
    const { store, registro } = fakeStore([linha()], { contacts: { "reg-1": contato } });
    await drainOutbox(deps(store, registro));
    expect(registro.sabbathAt).toEqual([AGORA.toISOString()]);
  });

  it("uma linha ruim nao derruba o resto do lote", async () => {
    const ruim = linha({ id: "a", kind: "test_outbox_alpha", dedupeKey: "reg-1" });
    const boa = linha({ id: "b", dedupeKey: "reg-1" });
    const { store, registro } = fakeStore([ruim, boa], { contacts: { "reg-1": contato } });
    await drainOutbox(deps(store, registro));
    expect(registro.sent.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("a cota padrao", () => {
  it("e o teto do plano gratuito do Brevo", () => {
    expect(BREVO_DAILY_QUOTA).toBe(300);
  });
});
