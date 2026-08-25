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
  type DrainDeps,
  type OutboxRow,
  type OutboxStore,
  type RegistrationSummary,
} from "./outbox";
import type { EmailRenderer, RenderInput } from "./render";

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

  /**
   * ── A UTC-IDADE, QUE E O PONTO DA FUNCAO, E QUE NAO TINHA REDE ──
   *
   * O docblock de `startOfUtcDay` chama a ancoragem em UTC de load-bearing: o
   * teto de 300/dia do Brevo vira em UTC, e nao no fuso do campeonato. MEDIDO:
   * trocar `Date.UTC(at.getUTCFullYear(), ...)` por
   * `new Date(at.getFullYear(), ...)` deixava os CINCO portoes verdes.
   *
   * E o caminho obvio de asseverar isso nao funciona: `vitest.config.ts` fixa
   * `env: { TZ: "UTC" }`, e com o fuso do processo em UTC o local e o UTC sao a
   * MESMA coisa -- o certo e o defeituoso devolvem identico. Rodar
   * `TZ=America/Sao_Paulo npx vitest` tambem nao adianta: o config sobrescreve.
   *
   * Entao o fuso e trocado AQUI DENTRO, e devolvido no `finally`. Nao e truque:
   * e a unica forma de a assertiva enxergar a diferenca que ela existe para
   * medir, sem tirar o `TZ` fixo do config -- que serve a outra cicatriz
   * (lib/datetime-br.ts).
   */
  describe("ancora o dia em UTC, e nao no fuso do processo", () => {
    function comFuso(tz: string, corpo: () => void): void {
      const original = process.env.TZ;
      try {
        process.env.TZ = tz;
        corpo();
      } finally {
        // Devolver SEMPRE: o worker do vitest e reaproveitado entre arquivos, e
        // um fuso vazado daqui iria contaminar assertiva de outra pessoa.
        process.env.TZ = original;
      }
    }

    it("atras de UTC: o instante que ainda e ontem no fuso local", () => {
      comFuso("America/Sao_Paulo", () => {
        const at = new Date("2026-08-24T02:00:00.000Z");

        // SENTINELA, e ela e obrigatoria. Se a troca de fuso em runtime parar
        // de funcionar -- outro Node, outra plataforma --, local volta a ser
        // igual a UTC e a assertiva de baixo passaria com o codigo DEFEITUOSO,
        // silenciosamente. Esta linha faz esse dia virar vermelho em vez de
        // virar cobertura falsa.
        expect(
          at.getDate(),
          "a troca de TZ em runtime nao teve efeito: com o fuso local igual a " +
            "UTC, a assertiva abaixo NAO distingue Date.UTC de new Date(local) " +
            "e esta rede morreria vazia. Confira o suporte do Node a " +
            "process.env.TZ nesta plataforma.",
        ).toBe(23);

        expect(startOfUtcDay(at).toISOString()).toBe("2026-08-24T00:00:00.000Z");
      });
    });

    it("a frente de UTC: o instante que ja e amanha no fuso local", () => {
      // Os dois lados, porque um so nao prende a direcao: um defeito que
      // somasse o deslocamento em vez de ignora-lo passaria por metade.
      comFuso("Asia/Tokyo", () => {
        const at = new Date("2026-08-24T20:00:00.000Z");

        expect(at.getDate(), "a troca de TZ em runtime nao teve efeito").toBe(25);

        expect(startOfUtcDay(at).toISOString()).toBe("2026-08-24T00:00:00.000Z");
      });
    });

    it("devolve o fuso ao sair, para nao contaminar quem roda depois", () => {
      const antes = process.env.TZ;
      comFuso("Asia/Tokyo", () => {
        expect(process.env.TZ).toBe("Asia/Tokyo");
      });
      expect(process.env.TZ).toBe(antes);
      // E o efeito de verdade voltou junto, nao so a variavel.
      expect(new Date("2026-08-24T20:00:00.000Z").getUTCDate()).toBe(24);
    });
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
// Os tres campos de ENDERECO mais os tres de CONTEUDO. `recipientFor` so olha
// os primeiros, e ha assertiva disso logo abaixo -- a separacao entre destino e
// conteudo e o que impede o aviso interno de cair na caixa do inscrito.
const resumo: RegistrationSummary = {
  contactEmail: "novo@exemplo.test",
  playerEmail: "velho@exemplo.test",
  playerName: "Fulano",
  championshipName: "Copa Teste",
  isWaitlist: false,
  preferredPosition: "ATA",
};

describe("recipientFor", () => {
  it("prefere o e-mail digitado NESTA inscricao", () => {
    // `contact_email` existe justamente porque players.email pode estar velho:
    // a submissao publica so grava identidade para CPF novo. Ver a migration
    // 20260823020000.
    expect(recipientFor("registration_committed", resumo, "org@exemplo.test")).toEqual({
      email: "novo@exemplo.test",
      name: "Fulano",
    });
  });

  it("cai para players.email quando contact_email e nulo", () => {
    expect(
      recipientFor("registration_committed", { ...resumo, contactEmail: null }, "org@exemplo.test"),
    ).toEqual({ email: "velho@exemplo.test", name: "Fulano" });
  });

  it("trata string vazia como ausente nos dois", () => {
    expect(
      recipientFor("registration_committed", { ...resumo, contactEmail: "  " }, "org@x.test"),
    ).toEqual({ email: "velho@exemplo.test", name: "Fulano" });
    expect(
      recipientFor(
        "registration_committed",
        { ...resumo, contactEmail: "", playerEmail: "", playerName: null },
        "org@x.test",
      ),
    ).toBeNull();
  });

  it("nao deixa o CONTEUDO escolher o DESTINO", () => {
    // O resumo passou a carregar nome de campeonato, lista de espera e posicao
    // junto com os tres campos de endereco. `recipientFor` continua olhando so
    // os de endereco, e e ISSO que impede o aviso interno de cair na caixa do
    // inscrito: uma funcao que soubesse o que o e-mail diz poderia, um dia,
    // escolher o destino em funcao do texto.
    //
    // Sem esta assertiva, nada acusaria a mistura -- o `tsc` fica limpo, e as
    // outras assertivas deste describe passam o resumo INTEIRO, entao nenhuma
    // delas ve a diferenca entre "ignora os tres" e "usa os tres por acaso do
    // mesmo jeito".
    const conteudoDiferente = {
      ...resumo,
      championshipName: "Outra Copa",
      isWaitlist: true,
      preferredPosition: "GOL",
    };

    expect(recipientFor("registration_committed", conteudoDiferente, "org@exemplo.test")).toEqual(
      recipientFor("registration_committed", resumo, "org@exemplo.test"),
    );
    expect(
      recipientFor("organizer_new_registration", conteudoDiferente, "org@exemplo.test"),
    ).toEqual(recipientFor("organizer_new_registration", resumo, "org@exemplo.test"));
  });

  it("manda o aviso da organizacao para a organizacao, nao para o jogador", () => {
    // O erro que esta assertiva impede e o pior desta task: o aviso interno de
    // inscricao nova cair na caixa do proprio inscrito. Ele nao e o
    // destinatario, e o texto nem e escrito para ele.
    expect(recipientFor("organizer_new_registration", resumo, "org@exemplo.test")).toEqual({
      email: "org@exemplo.test",
      name: null,
    });
  });

  it("sem ORGANIZER_EMAIL, o aviso da organizacao nao tem para onde ir", () => {
    expect(recipientFor("organizer_new_registration", resumo, null)).toBeNull();
    expect(recipientFor("organizer_new_registration", resumo, "")).toBeNull();
  });

  it("sem resumo, o e-mail do jogador nao tem para onde ir", () => {
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
  dead: Array<{ id: string; lastError: string; extras: number }>;
  enviados: EmailMessage[];
  // O que o dreno ENTREGOU ao render, e nao so o que saiu do send. Duble que
  // ignora a entrada torna a entrada INOBSERVAVEL, e foi assim que a fiacao do
  // `summary` ficou sem rede: MEDIDO, trocar o argumento por `summary: null` na
  // chamada real deixava os 806 testes verdes e o `tsc` em zero -- e em
  // producao todo e-mail cairia em `no_body`, adiado para sempre, calado.
  renderizados: RenderInput[];
  /** Para QUAIS inscricoes o dreno pediu token, e quantas vezes. Emitir mata o
   *  link anterior de forma irreversivel, entao um pedido a mais nao e
   *  desperdicio: e um link valido apagado da caixa de alguem. */
  tokensPedidos: string[];
};

/** O claro que o store falso devolve. Reconhecivel de proposito: ele tem de
 *  aparecer DENTRO do link que chega ao render. */
const TOKEN_PADRAO = "t0ken-em-claro";

function fakeStore(
  rows: OutboxRow[],
  opts: {
    sabbath?: boolean;
    sentToday?: number;
    resumos?: Record<string, RegistrationSummary>;
    /** `null` para a inscricao que nao tem o que verificar (ja verificada, ou
     *  sem `contact_email`). */
    tokens?: Record<string, string | null>;
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
    renderizados: [],
    tokensPedidos: [],
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
    async loadSummaries(ids) {
      const mapa = new Map<string, RegistrationSummary>();
      for (const id of ids) {
        const c = opts.resumos?.[id];
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
    async markFailedPermanent(id, lastError, ...resto: unknown[]) {
      // O `...resto` e a rede do parametro morto: `markFailedPermanent` ja
      // recebeu um terceiro argumento que ninguem lia, e o `tsc` nao acusou --
      // funcao com menos parametros e atribuivel a um tipo com mais.
      registro.dead.push({ id, lastError, extras: resto.length });
    },
    async issueVerificationToken(registrationId) {
      // Anota a CHAMADA, e nao so devolve: emitir tem efeito colateral
      // irreversivel no banco de verdade (mata o link anterior), entao "quantas
      // vezes e para qual inscricao" e justamente o que precisa ser observavel.
      registro.tokensPedidos.push(registrationId);
      // `in`, e nao `?? TOKEN_PADRAO`: o valor configurado pode ser `null` de
      // proposito (inscricao sem o que verificar), e `??` engoliria justamente
      // esse caso, devolvendo o token padrao para quem nao deveria receber
      // nenhum.
      const configurados = opts.tokens;
      return configurados && registrationId in configurados
        ? configurados[registrationId]
        : TOKEN_PADRAO;
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

/**
 * O mesmo duble, agora ANOTANDO a entrada.
 *
 * Continua sendo duble e nao `renderEmail`: o que estes testes exercitam e o
 * DRENO, e amarra-los ao texto de verdade faria uma frase reescrita no template
 * quebrar a suite da fila. O que mudou e so a observabilidade -- sem ela, o
 * dreno podia passar qualquer coisa em `summary` e nenhuma assertiva veria.
 */
function renderRegistrando(registro: Registro): EmailRenderer {
  return (input) => {
    registro.renderizados.push(input);
    return renderOk(input);
  };
}

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
    render: renderRegistrando(registro),
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
      resumos: { "reg-1": resumo },
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
    const { store, registro } = fakeStore(rows, { resumos: { "reg-1": resumo } });
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
      resumos: { "reg-1": resumo },
    });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.deferred).toEqual(["row-1"]);
    expect(registro.requeued).toHaveLength(0);
    expect(r.reasons.sabbath).toBe(1);
  });

  it("falha retriavel volta para a fila no primeiro degrau", async () => {
    const { store, registro } = fakeStore([linha({ attempts: 0 })], {
      resumos: { "reg-1": resumo },
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
      resumos: { "reg-1": resumo },
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
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    const r = await drainOutbox(
      deps(store, registro, {}, { ok: false, retriable: false, error: "400 email invalido" }),
    );
    expect(registro.dead).toEqual([{ id: "row-1", lastError: "400 email invalido", extras: 0 }]);
    expect(registro.requeued).toHaveLength(0);
    expect(r.failedPermanent).toBe(1);
  });

  it("kind desconhecido morre e nao chega no provedor", async () => {
    const { store, registro } = fakeStore([linha({ kind: "test_outbox_alpha" })], {
      resumos: { "reg-1": resumo },
    });
    const r = await drainOutbox(deps(store, registro));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.dead).toHaveLength(1);
    expect(registro.dead[0].lastError).toMatch(/kind desconhecido/);
    expect(r.failedPermanent).toBe(1);
  });

  it("o aviso da organizacao vai para ORGANIZER_EMAIL", async () => {
    const { store, registro } = fakeStore([linha({ kind: "organizer_new_registration" })], {
      resumos: { "reg-1": resumo },
    });
    await drainOutbox(deps(store, registro));
    expect(registro.enviados[0].to).toBe("org@exemplo.test");
  });

  it("cai para players.email quando contact_email e nulo", async () => {
    const { store, registro } = fakeStore([linha()], {
      resumos: { "reg-1": { ...resumo, contactEmail: null } },
    });
    await drainOutbox(deps(store, registro));
    expect(registro.enviados[0].to).toBe("velho@exemplo.test");
  });

  it("sem destinatario a linha morre, e nao volta para a fila", async () => {
    const { store, registro } = fakeStore([linha()], { resumos: {} });
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
      resumos: { "reg-1": resumo },
    });
    const r = await drainOutbox(deps(store, registro, { dailyQuota: 300 }));
    expect(registro.enviados).toHaveLength(1);
    expect(registro.deferred).toEqual(["b", "c"]);
    expect(r.reasons.quota).toBe(2);
  });

  it("sem base de link, a linha e ADIADA, e sem gastar tentativa", async () => {
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
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
      resumos: { "reg-1": resumo },
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
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    const semTemplate: EmailRenderer = () => null;
    const r = await drainOutbox(deps(store, registro, { render: semTemplate }));
    expect(registro.enviados).toHaveLength(0);
    expect(registro.dead).toHaveLength(0);
    expect(registro.deferred).toEqual(["row-1"]);
    expect(r.reasons.no_body).toBe(1);
  });

  it("entrega ao render o RESUMO carregado, e nao nulo", async () => {
    // A fiacao `summary` -> `render`, que ate a revisao da T5 nao tinha rede: a
    // palavra `summary` nao aparecia uma vez sequer neste arquivo. MEDIDO:
    // trocar o argumento por `summary: null` na chamada real de drainOutbox
    // deixava 806/806 verde e `tsc` em zero -- e em producao TODO e-mail cairia
    // em `no_body` e seria adiado para sempre. A fila cresce, nada sai, e
    // nenhum portao acende.
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    await drainOutbox(deps(store, registro));

    expect(registro.renderizados).toHaveLength(1);
    expect(registro.renderizados[0].summary).toEqual(resumo);
  });

  it("entrega nulo ao render quando a inscricao nao resolve", async () => {
    // O outro lado da mesma fiacao. `organizer_new_registration` porque o
    // destino dele sai do ORGANIZER_EMAIL e nao do cadastro: com um kind de
    // jogador, a linha morreria antes em `no_recipient` e o render nem seria
    // chamado -- e a assertiva ficaria verde sem provar nada.
    const { store, registro } = fakeStore([linha({ kind: "organizer_new_registration" })], {
      resumos: {},
    });
    await drainOutbox(deps(store, registro));

    expect(registro.renderizados).toHaveLength(1);
    expect(registro.renderizados[0].summary).toBeNull();
  });

  it("da a cada linha o resumo da SUA inscricao", async () => {
    // O lote com DUAS inscricoes distintas, que nao existia: os unicos ids do
    // arquivo eram `reg-1`, `abc` e `""`. Com uma inscricao so, trocar
    // `resumos.get(regId)` por "o primeiro do mapa" e INVISIVEL -- MEDIDO,
    // 806/806 verde.
    //
    // O defeito que isso esconde e o e-mail de A com os dados de B: nome,
    // campeonato e situacao de outra pessoa, num envio bem-sucedido. Nenhum
    // portao acende, porque tudo o que se mede e "saiu e-mail".
    const linhaA = linha({ id: "row-a", dedupeKey: "reg-a", payload: { registration_id: "reg-a" } });
    const linhaB = linha({ id: "row-b", dedupeKey: "reg-b", payload: { registration_id: "reg-b" } });
    const resumoA = {
      ...resumo,
      contactEmail: "ana@exemplo.test",
      playerName: "Ana",
      championshipName: "Copa A",
      isWaitlist: false,
    };
    const resumoB = {
      ...resumo,
      contactEmail: "bruno@exemplo.test",
      playerName: "Bruno",
      championshipName: "Copa B",
      isWaitlist: true,
    };
    const { store, registro } = fakeStore([linhaA, linhaB], {
      resumos: { "reg-a": resumoA, "reg-b": resumoB },
    });

    await drainOutbox(deps(store, registro));

    // Cada campo separado, e nao so o objeto: assim a mensagem de falha diz
    // QUAL dado atravessou para a linha errada.
    expect(registro.renderizados.map((r) => r.row.id)).toEqual(["row-a", "row-b"]);
    expect(registro.renderizados.map((r) => r.summary?.playerName)).toEqual(["Ana", "Bruno"]);
    expect(registro.renderizados.map((r) => r.summary?.championshipName)).toEqual([
      "Copa A",
      "Copa B",
    ]);
    expect(registro.renderizados.map((r) => r.summary?.isWaitlist)).toEqual([false, true]);
    // E o DESTINO segue a inscricao junto com o conteudo: um resumo trocado que
    // mantivesse o endereco certo seria o pior caso -- o e-mail chega a pessoa
    // certa contando a vida de outra.
    expect(registro.enviados.map((m) => m.to)).toEqual([
      "ana@exemplo.test",
      "bruno@exemplo.test",
    ]);
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
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    await drainOutbox(deps(store, registro));
    expect(registro.quotaSince).toEqual(["2026-08-24T00:00:00.000Z"]);
    expect(registro.quotaSince[0]).toBe(startOfUtcDay(AGORA).toISOString());
  });

  it("pergunta pelo sabado no instante recebido", async () => {
    // Mesmo buraco, outra pergunta, e esta e a pior das duas: perguntar pela
    // pausa com o instante errado manda e-mail durante o sabado, e isso nao se
    // desfaz. `sabbathCalls` sozinho so contava as chamadas -- o QUANDO era
    // inobservavel.
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    await drainOutbox(deps(store, registro));
    expect(registro.sabbathAt).toEqual([AGORA.toISOString()]);
  });

  it("nao passa argumento morto para markFailedPermanent", async () => {
    // Prende a assinatura de fora. `markFailedPermanent` carregou um terceiro
    // parametro `at: Date` que a fiacao ignorava e o tipo declarava; o `tsc`
    // ficou calado porque funcao com menos parametros e atribuivel a um tipo
    // com mais. Sem esta assertiva, o parametro morto volta na primeira vez que
    // alguem achar que "seria bom ter o instante aqui".
    //
    // A escolha que ela defende: estado terminal GUARDA o carimbo do claim, e
    // so quem volta para a fila o zera. Um `at` aqui existiria para sobrescrever
    // `claimed_at` com o instante da falha, que quebraria essa uniformidade.
    const { store, registro } = fakeStore([linha({ kind: "test_outbox_alpha" })], {
      resumos: { "reg-1": resumo },
    });
    await drainOutbox(deps(store, registro));
    expect(registro.dead).toHaveLength(1);
    expect(registro.dead[0].extras).toBe(0);
  });

  it("uma linha ruim nao derruba o resto do lote", async () => {
    const ruim = linha({ id: "a", kind: "test_outbox_alpha", dedupeKey: "reg-1" });
    const boa = linha({ id: "b", dedupeKey: "reg-1" });
    const { store, registro } = fakeStore([ruim, boa], { resumos: { "reg-1": resumo } });
    await drainOutbox(deps(store, registro));
    expect(registro.sent.map((s) => s.id)).toEqual(["b"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O link de verificacao
  // ───────────────────────────────────────────────────────────────────────────

  it("monta o link com o token emitido, na base de link do envio", async () => {
    // A fiacao, num lote de UMA linha: monta o caminho `/verify-email/<claro>`
    // sobre a base que a decisao de envio devolveu, e entrega isso ao render.
    //
    // Com uma linha so, este cenario NAO distingue "o token desta inscricao" de
    // "o token de qualquer uma" -- e esta frase ja prometia que sim. Quem
    // discrimina isso e `da a cada inscricao o link da SUA inscricao`, logo
    // abaixo, com duas inscricoes distintas. MEDIDO: emitir sempre o token da
    // primeira do lote deixava ESTE cenario verde.
    //
    // Trocar `decision.siteUrl` por outra string aqui manda todo mundo para o
    // ambiente errado, e o `tsc` nao ve: sao duas strings.
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": resumo } });
    await drainOutbox(deps(store, registro));

    expect(registro.tokensPedidos).toEqual(["reg-1"]);
    expect(registro.renderizados[0].verificationLink).toBe(
      `https://campeonato.exemplo/verify-email/${TOKEN_PADRAO}`,
    );
  });

  it("da a cada inscricao o link da SUA inscricao", async () => {
    // ── O TOKEN DO VIZINHO, E POR QUE ESTE CENARIO PRECISOU EXISTIR ──
    //
    // MEDIDO nesta branch: emitir o token da PRIMEIRA inscricao do lote para
    // TODAS passava 873/873 e `tsc` em zero. Em producao isso e o jogador B
    // recebendo um link que verifica a inscricao de A -- grava o `contact_email`
    // de A no cadastro de A -- enquanto o e-mail de B nunca verifica.
    //
    // E a MESMA familia que mordeu na T5 ("o e-mail de A com os dados de B"),
    // consertada no mesmo arquivo pela suite `da a cada linha o resumo da SUA
    // inscricao`. A junta nova nao herdou o padrao, e a causa foi de FIXTURA:
    // todo cenario que afirmava `tokensPedidos` usava um lote de UMA inscricao
    // so, e o de duas linhas compartilhava o mesmo `dedupeKey`. Com um lote
    // homogeneo, "o token de todos" e "o token de cada um" sao indistinguiveis.
    //
    // Por isso aqui sao DUAS inscricoes distintas, com resumos distintos e
    // tokens distintos -- e a assertiva olha o par, e nao a lista.
    const a = linha({ id: "a", dedupeKey: "reg-1", payload: { registration_id: "reg-1" } });
    const b = linha({ id: "b", dedupeKey: "reg-2", payload: { registration_id: "reg-2" } });
    const { store, registro } = fakeStore([a, b], {
      resumos: {
        "reg-1": { ...resumo, contactEmail: "a@exemplo.test", playerName: "Pessoa A" },
        "reg-2": { ...resumo, contactEmail: "b@exemplo.test", playerName: "Pessoa B" },
      },
      tokens: { "reg-1": "TOKEN-DE-A", "reg-2": "TOKEN-DE-B" },
    });
    await drainOutbox(deps(store, registro));

    expect(registro.tokensPedidos).toEqual(["reg-1", "reg-2"]);
    // O PAR destinatario/link, junto: e a unica forma que distingue "cada um
    // recebeu um link" de "cada um recebeu O SEU".
    expect(
      registro.renderizados.map((i) => [i.recipient.email, i.verificationLink]),
    ).toEqual([
      ["a@exemplo.test", "https://campeonato.exemplo/verify-email/TOKEN-DE-A"],
      ["b@exemplo.test", "https://campeonato.exemplo/verify-email/TOKEN-DE-B"],
    ]);
    // E dita ao contrario tambem: o link de B nao pode carregar o token de A.
    expect(registro.renderizados[1].verificationLink).not.toContain("TOKEN-DE-A");
  });

  it("no par comprovante/aviso, so o comprovante pede token", async () => {
    // Um token gasto pelo aviso interno nao e desperdicio: ele MATA o link que
    // o jogador acabou de receber, porque o banco guarda um hash por inscricao.
    //
    // O nome deste cenario dizia "SO o comprovante", e o corpo exercita DOIS dos
    // sete kinds. Quem varre os sete e `kindNeedsVerificationLink`, em
    // verification.test.ts (`so o comprovante pede token`), que filtra
    // `EMAIL_KINDS` inteiro. Aqui o que se prende e o par passando pelo DRENO.
    const comprovante = linha({ id: "a", kind: "registration_committed", dedupeKey: "reg-1" });
    const aviso = linha({ id: "b", kind: "organizer_new_registration", dedupeKey: "reg-1" });
    const { store, registro } = fakeStore([comprovante, aviso], {
      resumos: { "reg-1": resumo },
    });
    await drainOutbox(deps(store, registro));

    expect(registro.sent.map((s) => s.id)).toEqual(["a", "b"]);
    // UMA emissao para as DUAS linhas, e ela e a do comprovante.
    expect(registro.tokensPedidos).toEqual(["reg-1"]);
    const links = registro.renderizados.map((i) => i.verificationLink);
    expect(links).toEqual([`https://campeonato.exemplo/verify-email/${TOKEN_PADRAO}`, null]);
  });

  it("inscricao sem o que verificar sai com o comprovante e sem link", async () => {
    // `issueVerificationToken` devolve null nos dois casos declarados -- ja
    // verificada, e sem `contact_email`. O comprovante continua saindo: o que
    // nao sai e o bloco do convite.
    const { store, registro } = fakeStore([linha()], {
      resumos: { "reg-1": resumo },
      tokens: { "reg-1": null },
    });
    await drainOutbox(deps(store, registro));

    expect(registro.tokensPedidos).toEqual(["reg-1"]);
    expect(registro.renderizados[0].verificationLink).toBeNull();
    expect(registro.sent).toHaveLength(1);
  });

  it("linha ADIADA nao gasta token", async () => {
    // ── A ORDEM ENTRE AS GUARDAS E A EMISSAO, PROVADA ──
    //
    // Emitir e IRREVERSIVEL: o banco so guarda o hash, entao o claro do token
    // anterior nao existe mais em lugar nenhum. Emitindo ANTES das guardas, uma
    // noite de sabado -- ou uma cota estourada, ou uma base de link faltando --
    // apagaria o link que ja estava valendo na caixa da pessoa E nao mandaria
    // nada no lugar. O e-mail antigo passaria a levar a "este link nao vale
    // mais", sem que ninguem tivesse feito nada.
    //
    // Tres das QUATRO condicoes de adiar, uma a uma: elas fazem a linha voltar
    // para a fila sem chamar o render, e portanto sem emitir.
    //
    // A quarta -- `no_body`, template faltando -- fica de fora por construcao, e
    // nao por esquecimento: ela so e descoberta DEPOIS do render, e o render so
    // roda depois da emissao. Quer dizer que `no_body` adia uma linha cujo token
    // JA foi gasto. Nao ha defeito nisso hoje (os dois kinds enfileirados tem
    // template), mas o dia em que houver, a linha volta para a fila com o link
    // anterior ja morto -- e o proximo disparo emite outro.
    for (const [nome, over] of [
      ["sabado", {}],
      ["cota", {}],
      ["base de link", { siteUrl: null }],
    ] as const) {
      const { store, registro } = fakeStore([linha()], {
        resumos: { "reg-1": resumo },
        sabbath: nome === "sabado",
        sentToday: nome === "cota" ? 300 : 0,
      });
      await drainOutbox(deps(store, registro, over));

      expect(registro.deferred, `${nome}: a linha deveria ter sido adiada`).toEqual(["row-1"]);
      expect(registro.tokensPedidos, `${nome}: gastou token numa linha adiada`).toEqual([]);
    }
  });

  it("linha MORTA por falta de destino nao gasta token", async () => {
    // As guardas que MATAM em vez de adiar, e o efeito sobre o token e o mesmo:
    // e-mail que nao vai sair nao pode invalidar o link de um que ja saiu.
    //
    // ── POR QUE `registration_committed` E NAO UM LEMBRETE ──
    //
    // A morte por descadastro so alcanca `kind` de massa, e nenhum deles pede
    // link. MEDIDO: com a emissao hoistada para ANTES das guardas -- a mutacao
    // que este bloco existe para pegar --, uma versao deste cenario montada com
    // `reminder_waitlist` ficava VERDE, porque `kindNeedsVerificationLink`
    // recusava o kind antes de a ordem importar. A mutacao tem de tocar o caso
    // que a assertiva exercita.
    //
    // `no_recipient` e a guarda que mata um kind que PEDE link: resumo sem
    // endereco nenhum.
    const semEndereco = { ...resumo, contactEmail: null, playerEmail: null };
    const { store, registro } = fakeStore([linha()], { resumos: { "reg-1": semEndereco } });
    const r = await drainOutbox(deps(store, registro));

    expect(r.reasons.no_recipient).toBe(1);
    expect(registro.dead.map((d) => d.id)).toEqual(["row-1"]);
    expect(registro.tokensPedidos).toEqual([]);
  });

  it("linha sem inscricao no payload nao pede token", async () => {
    // Sem `registration_id` nao ha inscricao para verificar. Pedir com string
    // vazia -- ou com `undefined` virando "undefined" -- viraria consulta que
    // nao acha nada, e um `null` devolvido pelo motivo errado.
    const semId = linha({ payload: {} });
    const { store, registro } = fakeStore([semId]);
    await drainOutbox(deps(store, registro));

    expect(registro.tokensPedidos).toEqual([]);
  });
});

describe("a cota padrao", () => {
  it("e o teto do plano gratuito do Brevo", () => {
    expect(BREVO_DAILY_QUOTA).toBe(300);
  });
});
