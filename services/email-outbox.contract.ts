import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOutboxStore } from "@/services/email-outbox";
import type { OutboxStore } from "@/features/email/outbox";
import { hashToken } from "@/features/email/verification-token";

/**
 * O CONTRATO do store contra o Postgres de verdade.
 *
 * NAO roda com `npx vitest run`. Roda com:
 *
 *     npx vitest run --config vitest.contract.config.ts
 *
 * e precisa do stack local de pe (`npm run local:start`). O porque de ser uma
 * suite separada, e o porque do nome nao terminar em `.test.ts`, estao no
 * cabecalho de `vitest.contract.config.ts`.
 *
 * ── O QUE ESTE ARQUIVO PROVA, E QUE NADA MAIS PROVAVA ──
 *
 * A FIACAO de `services/email-outbox.ts`: os NOVE metodos que `OutboxStore`
 * promete, montados sobre o cliente do Supabase. Ate aqui esse arquivo era o
 * unico trecho do caminho `linha do banco -> e-mail enviado` sem portao nenhum,
 * e a prosa dele mesmo dizia: `services/**` nao e coletado pelo vitest, um
 * `services/*.test.ts` afirmando `expect(1).toBe(2)` deixa a suite verde.
 *
 * A defesa que existia era LEITURA DE TEXTO (features/email/service-wiring.test.ts):
 * uma lista de literais proibidos. Denylist so pega o que esta na lista. MEDIDO:
 * uma segunda gravacao a mao dentro de `defer` --
 * `atualizar(supabase, id, { attempts: 0, sent_at: null })` -- passava os QUATRO
 * portoes inteiros e violava justamente o invariante que `deferColumns` existe
 * para proteger (adiar nao gasta degrau da escada), porque `attempts:` e
 * `sent_at:` nao estavam entre os proibidos.
 *
 * Por isso o que esta aqui e contrato de COMPORTAMENTO: o que a LINHA fica
 * depois da chamada. Um invariante afirmado sobre a linha nao tem lista para
 * escapar.
 *
 * ── POR QUE DA PARA EXERCITAR O SERVICO AQUI, SE O `vitest.config.ts` DIZ QUE
 *    NAO DA ──
 *
 * Porque o obstaculo que aquele comentario nomeia nao vale para ESTE ponto de
 * entrada. Ele diz que quase nenhuma funcao exportada do servico aceita cliente
 * de fora -- e conta: das 15 exportadas em `services/*.ts`, 9 montam o cliente
 * dentro, 5 usam um cliente de nivel de modulo, e UMA recebe por argumento.
 *
 * Essa uma e `createSupabaseOutboxStore`, e e por ela que o contrato entra:
 * passa um cliente `service_role` de verdade, apontado para o Postgres local, e
 * nao dubla nada.
 *
 * (Aquela frase ja disse "toda funcao exportada monta o cliente la dentro", que
 * tinha contraexemplo, e depois "QUASE toda", que a contagem tambem desmente.
 * Se ela mudar de novo, esta citacao aqui envelhece junto -- por isso o que
 * importa esta dito pelo numero, e nao pela citacao.)
 *
 * `import "server-only"` nunca foi o obstaculo -- ver o plugin de modulo vazio em
 * `vitest.contract.config.ts`.
 *
 * ── O QUE ELE NAO PROVA ──
 *
 * Nenhum envio. Nada aqui fala com o Brevo, e nao deve: mandar e-mail de verdade
 * a partir de um teste e o defeito que a porta `EmailSender` existe para tornar
 * impossivel. Quem decide QUANDO enviar -- a ordem das guardas, a escada de
 * reentrega, quem recebe cada `kind` -- e `features/email/outbox.ts`, provado na
 * suite principal com store falso. Aqui e so a fiacao.
 */

// ─────────────────────────────────────────────────────────────────────────────
// As credenciais, e a trava que impede este arquivo de rodar fora da maquina
// ─────────────────────────────────────────────────────────────────────────────

/**
 * So loopback. Esta suite ESCREVE em `email_outbox` e em
 * `championship_registrations`, e apontar isso para staging ou producao
 * enfileiraria e-mail de teste numa fila de verdade -- com `kind` de verdade,
 * porque os cenarios do resumo disparam o gatilho da inscricao.
 *
 * Por isso as credenciais saem SO de `supabase status`, e nao de variavel de
 * ambiente: `.env.local` e `.env.production` tem os mesmos nomes de chave, e um
 * deles carregado por engano e exatamente o acidente que esta trava recusa.
 */
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/;

/**
 * A mesma trava, para a string de conexao do Postgres. Ela tem forma diferente
 * da API (`postgresql://usuario:senha@host:porta/base`), entao a regex acima nao
 * serve -- e reaproveita-la com um `startsWith` deixaria passar
 * `postgresql://...@127.0.0.1.exemplo.com/`.
 */
const LOOPBACK_DB = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|\[::1\]|localhost):\d+\//;

function credenciaisDoStackLocal(): { url: string; key: string; dbUrl: string } {
  let saida: string;
  try {
    saida = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  } catch {
    throw new Error(
      "Nao consegui rodar `supabase status -o env`. Este contrato precisa do " +
        "stack local de pe: `npm run local:start`. Ele nao le variavel de " +
        "ambiente de proposito -- veja a nota do LOOPBACK.",
    );
  }
  const pegar = (nome: string): string => {
    const achado = new RegExp(`^${nome}="([^"]*)"`, "m").exec(saida);
    return achado?.[1] ?? "";
  };
  const url = pegar("API_URL");
  const key = pegar("SERVICE_ROLE_KEY");
  const dbUrl = pegar("DB_URL");
  if (!url || !key) {
    throw new Error(
      "Nao achei API_URL ou SERVICE_ROLE_KEY na saida de `supabase status -o env`. " +
        "O stack local esta de pe?",
    );
  }
  if (!LOOPBACK.test(url)) {
    throw new Error(
      `Recusando rodar contra ${url}: este contrato so fala com o stack LOCAL. ` +
        "Ele escreve na fila de e-mail e dispara o gatilho da inscricao.",
    );
  }
  if (!LOOPBACK_DB.test(dbUrl)) {
    throw new Error(
      `Recusando falar com o Postgres em ${dbUrl.replace(/:[^:@]*@/, ":***@")}: ` +
        "este contrato so fala com o stack LOCAL.",
    );
  }
  return { url, key, dbUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// As fixturas, e por que cada cenario tem o SEU `kind`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um `kind` por cenario, e nao um so partilhado. E o que faz a mutacao de um
 * defeito acender UM vermelho: enquanto dois cenarios dividiam kind no script
 * irmao, um defeito deixava linha para tras e a contagem do cenario vizinho caia
 * junto -- dois vermelhos para um defeito, e o leitor procurando dano onde nao
 * havia.
 *
 * A limpeza os lista NOMINALMENTE, nunca por LIKE: em LIKE o `_` e coringa,
 * entao 'test_contract%' tambem casaria com um kind de verdade escrito
 * 'testcontract...'. Apagar linha real de fila de e-mail e dano silencioso.
 */
const KIND_FORMA = "test_contract_claim_forma";
const KIND_RELOGIO = "test_contract_claim_relogio";
const KIND_COTA = "test_contract_cota";
const KIND_SENT = "test_contract_sent";
const KIND_REQUEUE = "test_contract_requeue";
const KIND_DEFER = "test_contract_defer";
const KIND_FALHA = "test_contract_falha";

const KINDS = [
  KIND_FORMA,
  KIND_RELOGIO,
  KIND_COTA,
  KIND_SENT,
  KIND_REQUEUE,
  KIND_DEFER,
  KIND_FALHA,
];

/**
 * Os cenarios do resumo NAO podem ter kind proprio: quem escreve na fila ali e o
 * gatilho `trg_enqueue_registration_emails`, e ele escolhe os kinds DE VERDADE
 * ('registration_committed', 'organizer_new_registration'). Isso troca a rede --
 * a limpeza daquelas linhas e por `dedupe_key`, que e o id da inscricao, e por
 * isso os ids sao FIXOS e listados aqui em vez de sorteados. Igualdade exata,
 * nunca LIKE.
 *
 * O prefixo do CPF e 997 de proposito: `scripts/test-email-outbox.sh` usa 998 e
 * `scripts/test-registration-slots.sh` apaga `cpf LIKE '999%'` -- uma execucao
 * concorrente de qualquer um dos dois levaria estes jogadores embora no meio do
 * contrato.
 */
const CHAMP = "aaaaaaaa-0000-4000-8000-0000000ec401";
const REG_A = "bbbbbbbb-0000-4000-8000-0000000ec401";
const REG_B = "bbbbbbbb-0000-4000-8000-0000000ec402";
const CPF_A = "99700000401";
const CPF_B = "99700000402";
const CHAMP_NOME = "Contrato do store C1";

/**
 * As fixturas da verificacao de e-mail, em campeonato PROPRIO.
 *
 * Nao reaproveitam `CHAMP`: aquele e criado DENTRO do cenario de `loadSummaries`,
 * e depender disso amarraria estes cenarios a ORDEM de execucao do arquivo --
 * rodar so este `describe` (`-t`) deixaria tudo vermelho por falta de fixtura, e
 * o vermelho apontaria para o lugar errado. Aqui as fixturas nascem no
 * `beforeAll` do proprio bloco.
 *
 * Ids e CPFs continuam FIXOS e listados na limpeza, pelo mesmo motivo daqueles:
 * as linhas que o gatilho da inscricao enfileira tem `kind` DE VERDADE, e so a
 * `dedupe_key` (que e o id da inscricao) as distingue de uma fila real.
 */
const CHAMP_VERIF = "aaaaaaaa-0000-4000-8000-0000000ec402";
const REG_PENDENTE = "bbbbbbbb-0000-4000-8000-0000000ec403";
const REG_VERIFICADA = "bbbbbbbb-0000-4000-8000-0000000ec404";
const REG_SEM_EMAIL = "bbbbbbbb-0000-4000-8000-0000000ec405";
const CPF_C = "99700000403";
const CPF_D = "99700000404";
const CPF_E = "99700000405";
const CPFS = [CPF_A, CPF_B, CPF_C, CPF_D, CPF_E];
const REGS = [REG_A, REG_B, REG_PENDENTE, REG_VERIFICADA, REG_SEM_EMAIL];
const CHAMPS = [CHAMP, CHAMP_VERIF];

/**
 * As epocas dos cenarios de claim ficam em 1990 e 2000, e isso e load-bearing.
 *
 * `claim_email_outbox_batch` NAO filtra por kind -- ela pega o proximo lote da
 * FILA INTEIRA, que e o trabalho dela. Num banco local com fila parada de
 * execucoes anteriores, um claim com instante de hoje arrastaria linhas de
 * outra pessoa para 'sending' e as deixaria la.
 *
 * Com o instante injetado num passado absurdo, o conjunto elegivel fica vazio de
 * tudo que nao seja deste arquivo: linha de verdade tem `next_attempt_at` no
 * presente, e nao ha linha em 'sending' com carimbo anterior a 1990.
 */
let db: SupabaseClient;
let store: OutboxStore;
let dbUrl = "";

/**
 * Uma leitura do CATALOGO do Postgres, por `psql`.
 *
 * ── POR QUE NAO PELO CLIENTE DO SUPABASE ──
 *
 * Porque o PostgREST nao expoe `pg_catalog`: `pg_proc`, `proconfig` e `proacl`
 * sao invisiveis por aquele caminho. E sao justamente eles que respondem as
 * perguntas que nenhum cenario de COMPORTAMENTO alcanca -- se a funcao tem
 * `SET search_path`, se e `SECURITY DEFINER`, e quem tem EXECUTE.
 *
 * MEDIDO: removendo `SET search_path = public` da funcao, os 21 cenarios de
 * comportamento ficavam VERDES. O codigo estava certo e nada o prendia.
 *
 * Usa a MESMA `DB_URL` de `supabase status -o env`, com trava de loopback
 * propria -- ver `LOOPBACK_DB`.
 */
function catalogo(sql: string): string {
  return execFileSync("psql", [dbUrl, "-At", "-c", sql], { encoding: "utf8" }).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ferramentas
// ─────────────────────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;

async function inserir(campos: Linha): Promise<string> {
  const { data, error } = await db.from("email_outbox").insert(campos).select("id").single();
  if (error) throw new Error(`fixtura de email_outbox nao entrou: ${error.message}`);
  return (data as { id: string }).id;
}

async function ler(id: string): Promise<Linha> {
  const { data, error } = await db.from("email_outbox").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`leitura da linha ${id} falhou: ${error.message}`);
  if (!data) throw new Error(`a linha ${id} sumiu de email_outbox no meio do cenario`);
  return data as Linha;
}

async function apagarKind(kind: string): Promise<void> {
  const { error } = await db.from("email_outbox").delete().eq("kind", kind);
  if (error) throw new Error(`limpeza do kind ${kind} falhou: ${error.message}`);
}

async function contarPorKinds(kinds: string[]): Promise<number> {
  const { count, error } = await db
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .in("kind", kinds);
  if (error) throw new Error(`contagem por kind falhou: ${error.message}`);
  if (count === null) throw new Error("contagem por kind voltou vazia");
  return count;
}

async function contarPorDedupe(chaves: string[]): Promise<number> {
  const { count, error } = await db
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .in("dedupe_key", chaves);
  if (error) throw new Error(`contagem por dedupe_key falhou: ${error.message}`);
  if (count === null) throw new Error("contagem por dedupe_key voltou vazia");
  return count;
}

async function contarTabela(tabela: string, coluna: string, valores: string[]): Promise<number> {
  const { count, error } = await db
    .from(tabela)
    .select("id", { count: "exact", head: true })
    .in(coluna, valores);
  if (error) throw new Error(`contagem de ${tabela} falhou: ${error.message}`);
  if (count === null) throw new Error(`contagem de ${tabela} voltou vazia`);
  return count;
}

async function totalDaFila(): Promise<number> {
  const { count, error } = await db
    .from("email_outbox")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`contagem total da fila falhou: ${error.message}`);
  if (count === null) throw new Error("contagem total da fila voltou vazia");
  return count;
}

/**
 * O instante como o Postgres o devolve, normalizado. PostgREST escreve
 * `+00:00` e o `toISOString()` escreve `Z`: comparar as strings cruas
 * produziria vermelho por formatacao, que e o pior tipo de vermelho.
 */
function instante(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return new Date(String(valor)).toISOString();
}

/**
 * A limpeza, e as CINCO familias de linha que ela precisa alcancar. Este
 * projeto ja foi mordido por uma limpeza que cobria tres de cinco.
 *
 *  1. as linhas dos sete kinds de teste;
 *  2. as linhas que o GATILHO escreveu -- kind de VERDADE, apagadas por
 *     dedupe_key, que e o id da inscricao;
 *  3. as inscricoes;
 *  4. os jogadores;
 *  5. o campeonato.
 *
 * A ordem importa: inscricao antes de jogador e de campeonato, por causa das
 * duas FKs. E a familia 2 nao sai junto da 3 -- nao ha FK entre `email_outbox` e
 * `championship_registrations`, entao apagar a inscricao NAO leva a linha de
 * fila dela.
 */
async function limpar(): Promise<void> {
  const passos: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ["fila por kind", db.from("email_outbox").delete().in("kind", KINDS)],
    ["fila do gatilho", db.from("email_outbox").delete().in("dedupe_key", REGS)],
    ["inscricoes", db.from("championship_registrations").delete().in("championship_id", CHAMPS)],
    ["jogadores", db.from("players").delete().in("cpf", CPFS)],
    ["campeonatos", db.from("championships").delete().in("id", CHAMPS)],
  ];
  for (const [nome, passo] of passos) {
    const { error } = await passo;
    if (error) throw new Error(`limpeza (${nome}) falhou: ${error.message}`);
  }
}

let filaAntes = 0;

/** A janela de sabado usada pelo cenario do sabbath, lida da tabela. */
let sabbathDentro = new Date(0);
let sabbathFora = new Date(0);

beforeAll(async () => {
  const credenciais = credenciaisDoStackLocal();
  const { url, key } = credenciais;
  dbUrl = credenciais.dbUrl;
  db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  store = createSupabaseOutboxStore(db);

  // `limpar()` ANTES da fotografia, de proposito: lixo de uma execucao abortada
  // sumiria no MEIO da suite e a guarda do fim leria isso como "o contrato
  // apagou uma linha de verdade".
  await limpar();
  filaAntes = await totalDaFila();

  // ── A janela de sabado vem da TABELA, e o contrato nao escreve nela ────────
  //
  // `is_sabbath` le `sabbath_windows`. Montar uma janela de teste ali e o
  // caminho obvio e o errado: `scripts/test-registration-slots.sh` falha POR
  // DESENHO durante a pausa de sabado de verdade (as RPCs que ele exercita
  // chamam `is_sabbath(now())`, sem relogio injetavel), entao uma linha de teste
  // esquecida em `sabbath_windows` CEGA aquele portao e o proximo a rodar acha
  // que quebrou outra coisa.
  //
  // A tabela ja tem 178 janelas reais ate 2029. Usar uma delas nao escreve nada,
  // nao precisa de limpeza, e nao tem como cegar portao nenhum.
  const { data: janelas, error: erroJanela } = await db
    .from("sabbath_windows")
    .select("starts_at,ends_at")
    .order("starts_at")
    .range(10, 10);
  if (erroJanela) throw new Error(`leitura de sabbath_windows falhou: ${erroJanela.message}`);
  const janela = (janelas ?? [])[0] as { starts_at: string; ends_at: string } | undefined;
  if (!janela) {
    throw new Error(
      "sabbath_windows nao tem 11 janelas. O banco local esta sem a migration " +
        "20260819030000, e o cenario do sabado nao tem sobre o que se apoiar.",
    );
  }
  const inicio = new Date(janela.starts_at).getTime();
  const fim = new Date(janela.ends_at).getTime();
  sabbathDentro = new Date(Math.round((inicio + fim) / 2));
  // Tres dias antes do inicio: as janelas vao de sexta ao por do sol de sabado,
  // entao isso cai numa terca-feira. Fora de qualquer janela, e com janela
  // futura existindo -- o que mantem a regra conservadora (o terceiro ramo de
  // `is_sabbath`) fora do caminho.
  sabbathFora = new Date(inicio - 3 * 24 * 60 * 60_000);

  // Guarda de FIXTURA, nao assertiva do store: se alguem acrescentar janelas e
  // a terca escolhida cair dentro de uma, o cenario abaixo viraria verde
  // mentiroso.
  const { count: cobrem, error: erroCobre } = await db
    .from("sabbath_windows")
    .select("starts_at", { count: "exact", head: true })
    .lte("starts_at", sabbathFora.toISOString())
    .gte("ends_at", sabbathFora.toISOString());
  if (erroCobre) throw new Error(`guarda da fixtura de sabado falhou: ${erroCobre.message}`);
  expect(
    cobrem,
    `${sabbathFora.toISOString()} deveria estar FORA de toda janela de sabbath_windows, ` +
      "e nao esta. A fixtura do cenario do sabado parou de valer.",
  ).toBe(0);
});

afterAll(async () => {
  // Rede para a CLASSE: assertiva quebrada, erro no meio, qualquer saida passa
  // por aqui. E BACKSTOP, nao a garantia -- quem AFIRMA que a limpeza aconteceu
  // e o ultimo cenario do arquivo, que roda antes deste gancho.
  if (db) await limpar();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("claimBatch", () => {
  it("traz a linha do banco com o id no id e a dedupe_key na dedupe_key", async () => {
    // A troca dos dois e catastrofica e nao tem sintoma de tipo -- os dois sao
    // `string`. `row.id` e o que volta em `markSent`, `requeue` e `defer`: uma
    // `dedupe_key` no lugar dele faz o UPDATE nao casar NENHUMA linha, a linha
    // fica presa em 'sending', o recolhimento a repesca depois dos 30 minutos
    // do limite de `claim_email_outbox_batch`, e o MESMO e-mail sai de novo a
    // cada disparo do cron, queimando a cota de 300/dia.
    const id = await inserir({
      kind: KIND_FORMA,
      dedupe_key: "contrato-forma",
      payload: { registration_id: "inscricao-da-forma" },
      status: "pending",
      attempts: 2,
      next_attempt_at: "1990-01-01T00:00:00Z",
    });

    const lote = await store.claimBatch(1, new Date("1990-06-01T00:00:00Z"));

    expect(lote).toEqual([
      {
        id,
        kind: KIND_FORMA,
        dedupeKey: "contrato-forma",
        payload: { registration_id: "inscricao-da-forma" },
        attempts: 2,
      },
    ]);

    // E o claim MARCA: pegar e marcar sao a mesma instrucao, e e isso que
    // impede dois disparos do cron de mandarem o mesmo e-mail. Sem esta
    // assertiva, uma funcao que so LESSE passaria igual.
    const linha = await ler(id);
    expect(linha.status).toBe("sending");
    expect(linha.claimed_at).not.toBeNull();

    await apagarKind(KIND_FORMA);
  });

  it("pede o lote do instante que RECEBEU, e nao do relogio da maquina", async () => {
    // A cicatriz que `runOutboxDrain` documenta em dez linhas: instante por
    // argumento, nunca `new Date()` la dentro. Trocar `p_now: now.toISOString()`
    // por `new Date().toISOString()` nao muda tipo nenhum e nao muda a suite
    // principal -- o duble do store nem chega no SQL.
    //
    // As duas linhas cercam o instante injetado: uma antes, outra depois. Com o
    // relogio certo so a primeira e elegivel; com o relogio da maquina (2026) as
    // DUAS sao, e o limite de 2 se esgota nelas -- que e o que mantem este
    // cenario de arrastar linha de verdade para 'sending' quando ele fica
    // vermelho.
    const antes = await inserir({
      kind: KIND_RELOGIO,
      dedupe_key: "contrato-antes",
      status: "pending",
      next_attempt_at: "2000-01-01T00:00:00Z",
    });
    const depois = await inserir({
      kind: KIND_RELOGIO,
      dedupe_key: "contrato-depois",
      status: "pending",
      next_attempt_at: "2000-03-01T00:00:00Z",
    });

    const lote = await store.claimBatch(2, new Date("2000-02-01T00:00:00Z"));
    const chaves = lote.map((r) => r.dedupeKey);

    expect(chaves).toContain("contrato-antes");
    expect(
      chaves,
      "veio a linha cujo next_attempt_at esta DEPOIS do instante injetado: o " +
        "claim leu o relogio da maquina em vez do argumento.",
    ).not.toContain("contrato-depois");
    expect((await ler(depois)).status).toBe("pending");
    expect(await ler(antes).then((l) => l.status)).toBe("sending");

    await apagarKind(KIND_RELOGIO);
  });

  it("carimba claimed_at com o instante injetado", async () => {
    // O carimbo e o que permite recolher a linha que ficou presa em 'sending'
    // porque o processo morreu no meio do envio. Carimbado com o relogio errado,
    // o recolhimento acontece na hora errada.
    const INSTANTE = new Date("1995-04-05T06:07:08.000Z");
    const id = await inserir({
      kind: KIND_FORMA,
      dedupe_key: "contrato-carimbo",
      status: "pending",
      next_attempt_at: "1995-01-01T00:00:00Z",
    });

    await store.claimBatch(1, INSTANTE);

    expect(instante((await ler(id)).claimed_at)).toBe(INSTANTE.toISOString());

    await apagarKind(KIND_FORMA);
  });
});

describe("isSabbath", () => {
  it("diz sim dentro da janela e nao fora dela", async () => {
    // O unico erro desta funcao que nao da para desfazer e mandar e-mail durante
    // a pausa. `data === true` virado em `data !== true` nao muda tipo, nao muda
    // a suite principal (o duble responde direto), e inverte a observancia.
    //
    // As duas assertivas ficam no MESMO cenario de proposito: a mutacao vira as
    // duas, e um cenario so e um vermelho so.
    expect(
      await store.isSabbath(sabbathDentro),
      `${sabbathDentro.toISOString()} esta no meio de uma janela de sabbath_windows.`,
    ).toBe(true);
    expect(
      await store.isSabbath(sabbathFora),
      `${sabbathFora.toISOString()} e uma terca-feira, fora de toda janela.`,
    ).toBe(false);
  });
});

describe("countSentSince", () => {
  it("conta so o que foi ENVIADO, e so a partir do instante pedido", async () => {
    // A cota de 300/dia do plano gratuito e o recurso escasso do bloco. Contar a
    // coluna errada -- 'pending' no lugar de 'sent' -- nao muda tipo nenhum e
    // deixa todos os outros portoes verdes.
    //
    // A medida e o DELTA, e nao o absoluto: a fila do banco local tem linhas de
    // verdade, e um numero fixo aqui viraria vermelho toda vez que alguem se
    // inscrevesse.
    const DESDE = new Date("2010-01-01T00:00:00Z");
    const base = await store.countSentSince(DESDE);

    await inserir({
      kind: KIND_COTA,
      dedupe_key: "cota-enviada-dentro",
      status: "sent",
      sent_at: "2010-06-01T00:00:00Z",
    });
    // Enviada, mas ANTES do instante pedido: e o que prende o `.gte("sent_at")`.
    await inserir({
      kind: KIND_COTA,
      dedupe_key: "cota-enviada-fora",
      status: "sent",
      sent_at: "2009-06-01T00:00:00Z",
    });
    // DUAS pendentes, e nao uma. Com uma so, trocar 'sent' por 'pending' daria o
    // mesmo delta de 1 e a mutacao passaria -- medido. Sao duas para que o
    // numero errado seja um numero DIFERENTE.
    await inserir({
      kind: KIND_COTA,
      dedupe_key: "cota-pendente-1",
      status: "pending",
      sent_at: "2010-06-01T00:00:00Z",
    });
    await inserir({
      kind: KIND_COTA,
      dedupe_key: "cota-pendente-2",
      status: "pending",
      sent_at: "2010-06-01T00:00:00Z",
    });
    // Morta com carimbo de envio: `failedPermanentColumns` zera `sent_at`
    // justamente para isso, e aqui a linha nasce com o carimbo para provar que
    // quem filtra e o STATUS.
    await inserir({
      kind: KIND_COTA,
      dedupe_key: "cota-morta",
      status: "failed_permanent",
      sent_at: "2010-06-01T00:00:00Z",
    });

    expect(await store.countSentSince(DESDE)).toBe(base + 1);

    await apagarKind(KIND_COTA);
  });
});

describe("loadSummaries", () => {
  it("da a cada inscricao o resumo da SUA inscricao, com os seis campos", async () => {
    // A prova de ponta a ponta da leitura: o `select` do servico, o embed
    // aninhado do PostgREST, e `summariesById` montando o mapa. As tres pecas
    // tem rede propria -- o script de banco, e summary-row.test.ts --, e nenhuma
    // delas ve as OUTRAS DUAS. Este cenario e o unico que passa pelas tres.
    //
    // Duas inscricoes, e nao uma: com uma so, a chave fixa
    // (`mapa.set(registrationIds[0], ...)`) sai verde.
    const { error: erroChamp } = await db.from("championships").insert({
      id: CHAMP,
      name: CHAMP_NOME,
      slug: "contrato-store-c1",
      status: "subscribing",
    });
    if (erroChamp) throw new Error(`fixtura do campeonato falhou: ${erroChamp.message}`);

    const { data: jogadores, error: erroPlayers } = await db
      .from("players")
      .insert([
        { cpf: CPF_A, name: "Contrato A", email: "cadastro-a@teste.local", preferred_position: "MEI" },
        { cpf: CPF_B, name: "Contrato B", email: "cadastro-b@teste.local", preferred_position: "GOL" },
      ])
      .select("id,cpf");
    if (erroPlayers) throw new Error(`fixtura dos jogadores falhou: ${erroPlayers.message}`);
    const porCpf = new Map(
      (jogadores as Array<{ id: string; cpf: string }>).map((j) => [j.cpf, j.id]),
    );

    const { error: erroRegs } = await db.from("championship_registrations").insert([
      {
        id: REG_A,
        championship_id: CHAMP,
        player_id: porCpf.get(CPF_A),
        is_waitlist: false,
        // O endereco DIGITADO no formulario, diferente do cadastro. E o que
        // `recipientFor` prefere, porque quem trocou de e-mail e justamente quem
        // digita o novo na inscricao.
        contact_email: "digitado-a@teste.local",
      },
      {
        id: REG_B,
        championship_id: CHAMP,
        player_id: porCpf.get(CPF_B),
        is_waitlist: true,
        contact_email: null,
      },
    ]);
    if (erroRegs) throw new Error(`fixtura das inscricoes falhou: ${erroRegs.message}`);

    const resumos = await store.loadSummaries([REG_A, REG_B]);

    expect(resumos.get(REG_A)).toEqual({
      contactEmail: "digitado-a@teste.local",
      playerEmail: "cadastro-a@teste.local",
      playerName: "Contrato A",
      championshipName: CHAMP_NOME,
      isWaitlist: false,
      preferredPosition: "MEI",
    });
    // A da espera e a que carrega o campo mais caro de inverter: com
    // `isWaitlist` trocado, todo comprovante de lista de espera sai dizendo
    // "sua inscricao esta confirmada".
    expect(resumos.get(REG_B)).toEqual({
      contactEmail: null,
      playerEmail: "cadastro-b@teste.local",
      playerName: "Contrato B",
      championshipName: CHAMP_NOME,
      isWaitlist: true,
      preferredPosition: "GOL",
    });
  });
});

describe("markSent", () => {
  it("marca enviada, guarda o id do provedor e PRESERVA o carimbo do claim", async () => {
    // Estado terminal GUARDA o carimbo. E a leitura uniforme das quatro
    // gravacoes -- terminal guarda, volta para a fila zera --, e e por isso que
    // `markFailedPermanent` nao recebe `at`.
    const CLAIM = "2020-01-01T00:00:00.000Z";
    const QUANDO = new Date("2021-02-03T04:05:06.000Z");
    const id = await inserir({
      kind: KIND_SENT,
      dedupe_key: "contrato-sent",
      status: "sending",
      claimed_at: CLAIM,
      attempts: 1,
      last_error: "erro de uma tentativa anterior",
      next_attempt_at: "2021-01-01T00:00:00Z",
    });

    await store.markSent(id, "<abc@smtp-relay.mailin.fr>", QUANDO);

    const linha = await ler(id);
    expect(linha.status).toBe("sent");
    expect(instante(linha.sent_at)).toBe(QUANDO.toISOString());
    expect(linha.provider_message_id).toBe("<abc@smtp-relay.mailin.fr>");
    expect(linha.last_error).toBeNull();
    expect(instante(linha.claimed_at), "estado terminal guarda o carimbo do claim").toBe(CLAIM);

    await apagarKind(KIND_SENT);
  });
});

describe("requeue", () => {
  it("volta para a fila gastando o degrau e SOLTA o carimbo do claim", async () => {
    // Linha pendente nao esta na mao de ninguem: deixar o `claimed_at` velho
    // confundiria o recolhimento do que ficou parado.
    const QUANDO = new Date("2021-05-06T07:08:09.000Z");
    const id = await inserir({
      kind: KIND_REQUEUE,
      dedupe_key: "contrato-requeue",
      status: "sending",
      claimed_at: "2020-01-01T00:00:00Z",
      attempts: 1,
      next_attempt_at: "2021-01-01T00:00:00Z",
    });

    await store.requeue(id, 4, QUANDO, "500 do provedor");

    const linha = await ler(id);
    expect(linha.status).toBe("pending");
    expect(linha.attempts).toBe(4);
    expect(instante(linha.next_attempt_at)).toBe(QUANDO.toISOString());
    expect(linha.last_error).toBe("500 do provedor");
    expect(instante(linha.claimed_at), "volta para a fila zera o carimbo").toBeNull();

    await apagarKind(KIND_REQUEUE);
  });
});

describe("defer", () => {
  it("volta para a fila SEM gastar degrau e sem mexer em mais nada", async () => {
    // ── O CENARIO QUE A DENYLIST NAO CONSEGUIA ESCREVER ──
    //
    // Adiar e para condicao que NAO e falha desta linha: sabado, cota, base de
    // link, template faltando. Gastar degrau com isso empurraria para 12 horas
    // de espera um e-mail que so precisava do proximo disparo do cron.
    //
    // MEDIDO: uma segunda gravacao a mao dentro de `defer` --
    // `atualizar(supabase, id, { attempts: 0, sent_at: null })` -- passava os
    // portoes de entao, porque a defesa era uma lista de literais proibidos em
    // service-wiring.test.ts e nem `attempts:` nem `sent_at:` estavam nela.
    // Denylist so pega o que esta na lista; um invariante sobre a LINHA nao tem
    // lista de onde escapar.
    const NEXT = "2022-07-08T09:10:11.000Z";
    const SENT = "2019-01-01T00:00:00.000Z";
    const id = await inserir({
      kind: KIND_DEFER,
      dedupe_key: "contrato-defer",
      status: "sending",
      claimed_at: "2020-01-01T00:00:00Z",
      attempts: 3,
      next_attempt_at: NEXT,
      last_error: "motivo anterior",
      // Estado que o dreno nunca produz: uma linha em 'sending' com carimbo de
      // envio. Ela nasce assim de proposito, como ARAME -- se `defer` mexer em
      // `sent_at`, tem o que apagar, e a assertiva ve.
      sent_at: SENT,
    });

    await store.defer(id);

    const linha = await ler(id);
    expect(linha.status).toBe("pending");
    expect(instante(linha.claimed_at), "adiar solta o carimbo do claim").toBeNull();
    expect(linha.attempts, "adiar NAO gasta degrau da escada").toBe(3);
    expect(instante(linha.next_attempt_at), "adiar NAO empurra a proxima tentativa").toBe(NEXT);
    expect(instante(linha.sent_at), "adiar nao toca no carimbo de envio").toBe(SENT);
    expect(linha.last_error, "adiar nao apaga o motivo da falha anterior").toBe("motivo anterior");

    await apagarKind(KIND_DEFER);
  });
});

describe("markFailedPermanent", () => {
  it("mata a linha, zera o carimbo de envio e PRESERVA o do claim", async () => {
    // `sent_at` volta a nulo porque a contagem da cota le
    // `status = 'sent' AND sent_at >= <inicio do dia>`: uma linha morta com
    // carimbo de envio seria cota gasta por e-mail que ninguem recebeu.
    const CLAIM = "2020-01-01T00:00:00.000Z";
    const id = await inserir({
      kind: KIND_FALHA,
      dedupe_key: "contrato-falha",
      status: "sending",
      claimed_at: CLAIM,
      attempts: 2,
      sent_at: "2019-01-01T00:00:00Z",
      next_attempt_at: "2021-01-01T00:00:00Z",
    });

    await store.markFailedPermanent(id, "sem destinatario");

    const linha = await ler(id);
    expect(linha.status).toBe("failed_permanent");
    expect(linha.last_error).toBe("sem destinatario");
    expect(instante(linha.sent_at), "linha morta nao gasta cota").toBeNull();
    expect(instante(linha.claimed_at), "estado terminal guarda o carimbo do claim").toBe(CLAIM);
    expect(linha.attempts, "matar a linha nao mexe na escada").toBe(2);

    await apagarKind(KIND_FALHA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O nono metodo: a emissao do token de verificacao
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Este bloco e a UNICA rede possivel para `issueVerificationToken`.
 *
 * Ele nao tem traducao para extrair para `features/**` que o cobrisse: as
 * regras que dava para tirar de la ja sairam (`canIssueVerificationToken`,
 * `verificationTokenColumns`, `createVerificationToken`, todas com teste na
 * suite principal). O que resta no servico e a ORDEM -- ler a inscricao,
 * decidir, sortear, gravar -- e uma ordem so se prova contra o banco.
 *
 * Os quatro cenarios abaixo cobrem exatamente os quatro caminhos daquele
 * metodo, e o segundo (`emitir duas vezes troca o hash`) e o que transforma a
 * consequencia mais cara em coisa PROVADA em vez de suposta.
 */
describe("issueVerificationToken", () => {
  /** A linha da inscricao, crua. `select("*")` de proposito: o que estes
   *  cenarios afirmam e o estado das TRES colunas da verificacao, e pedir so
   *  duas esconderia uma gravacao a mais na terceira. */
  async function lerInscricao(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await db
      .from("championship_registrations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`leitura da inscricao ${id} falhou: ${error.message}`);
    if (!data) throw new Error(`a inscricao ${id} sumiu no meio do cenario`);
    return data as Record<string, unknown>;
  }

  beforeAll(async () => {
    const { error: erroChamp } = await db.from("championships").insert({
      id: CHAMP_VERIF,
      name: "Contrato da verificacao C1",
      slug: "contrato-verificacao-c1",
      status: "subscribing",
    });
    if (erroChamp) throw new Error(`fixtura do campeonato falhou: ${erroChamp.message}`);

    const { data: jogadores, error: erroPlayers } = await db
      .from("players")
      .insert([
        { cpf: CPF_C, name: "Verif Pendente", email: "cadastro-c@teste.local" },
        { cpf: CPF_D, name: "Verif Ja Feita", email: "cadastro-d@teste.local" },
        { cpf: CPF_E, name: "Verif Sem Email", email: "cadastro-e@teste.local" },
      ])
      .select("id,cpf");
    if (erroPlayers) throw new Error(`fixtura dos jogadores falhou: ${erroPlayers.message}`);
    const porCpf = new Map(
      (jogadores as Array<{ id: string; cpf: string }>).map((j) => [j.cpf, j.id]),
    );

    const { error: erroRegs } = await db.from("championship_registrations").insert([
      {
        id: REG_PENDENTE,
        championship_id: CHAMP_VERIF,
        player_id: porCpf.get(CPF_C),
        is_waitlist: false,
        contact_email: "digitado-c@teste.local",
      },
      {
        id: REG_VERIFICADA,
        championship_id: CHAMP_VERIF,
        player_id: porCpf.get(CPF_D),
        is_waitlist: false,
        contact_email: "digitado-d@teste.local",
        email_verified_at: "2026-08-23T10:00:00Z",
      },
      {
        // Inscricao criada pelo admin: `contact_email` so e preenchida pelo
        // caminho publico (`commit_registration`, migration 20260823030000).
        id: REG_SEM_EMAIL,
        championship_id: CHAMP_VERIF,
        player_id: porCpf.get(CPF_E),
        is_waitlist: false,
        contact_email: null,
      },
    ]);
    if (erroRegs) throw new Error(`fixtura das inscricoes falhou: ${erroRegs.message}`);
  });

  it("grava o hash do claro que devolveu, e nao qualquer hash", async () => {
    const claro = await store.issueVerificationToken(REG_PENDENTE);

    expect(claro, "nao emitiu para inscricao com endereco e sem verificacao").not.toBeNull();
    const linha = await lerInscricao(REG_PENDENTE);
    expect(linha.email_verification_token_hash).not.toBeNull();
    // A junta que importa: o que ficou no banco tem de ser o hash DESTE claro.
    // Gravar o hash de outro sorteio -- ou o proprio claro -- passa por
    // "gravou alguma coisa" e produz um link que nunca casa com a linha dele.
    expect(linha.email_verification_token_hash).toBe(hashToken(claro as string));
    // E emitir NAO verifica: o carimbo continua nulo.
    expect(linha.email_verified_at).toBeNull();
    // Nem toca o endereco da inscricao.
    expect(linha.contact_email).toBe("digitado-c@teste.local");
  });

  it("emitir DE NOVO troca o hash, e mata o claro anterior", async () => {
    // ── A CONSEQUENCIA MAIS CARA DESTA TASK, PROVADA ──
    //
    // O banco guarda so o hash, entao o claro de um token antigo e
    // IRRECUPERAVEL. Reenviar o comprovante obriga a emitir de novo, e o link do
    // e-mail velho passa a responder "este link nao vale mais".
    //
    // Isso e comportamento, e nao defeito -- um endereco tem um link valido por
    // vez. Mas so vira comportamento SABIDO se estiver provado: sem este
    // cenario, a proxima pessoa a ver um link velho falhando abre chamado.
    const primeiro = await store.issueVerificationToken(REG_PENDENTE);
    const hashDoPrimeiro = (await lerInscricao(REG_PENDENTE)).email_verification_token_hash;

    const segundo = await store.issueVerificationToken(REG_PENDENTE);
    const hashDoSegundo = (await lerInscricao(REG_PENDENTE)).email_verification_token_hash;

    expect(primeiro).not.toBe(segundo);
    expect(hashDoPrimeiro).not.toBe(hashDoSegundo);
    expect(hashDoSegundo).toBe(hashToken(segundo as string));
    // E o hash do PRIMEIRO nao esta mais em lugar nenhum: o link antigo nao tem
    // como casar.
    expect(hashDoSegundo).not.toBe(hashToken(primeiro as string));
  });

  it("inscricao JA verificada devolve null e nao mexe no hash", async () => {
    const antes = await lerInscricao(REG_VERIFICADA);

    const claro = await store.issueVerificationToken(REG_VERIFICADA);

    expect(claro).toBeNull();
    const depois = await lerInscricao(REG_VERIFICADA);
    // As tres colunas intactas. `toEqual` sobre as tres, e nao so sobre o hash:
    // um metodo que devolvesse null DEPOIS de gravar passaria numa assertiva
    // sobre o retorno sozinho.
    expect(depois.email_verification_token_hash).toBe(antes.email_verification_token_hash);
    expect(depois.email_verification_token_hash).toBeNull();
    expect(instante(depois.email_verified_at)).toBe(instante(antes.email_verified_at));
    expect(depois.contact_email).toBe(antes.contact_email);
  });

  it("inscricao sem contact_email devolve null e nao grava nada", async () => {
    const claro = await store.issueVerificationToken(REG_SEM_EMAIL);

    expect(claro).toBeNull();
    const linha = await lerInscricao(REG_SEM_EMAIL);
    expect(linha.email_verification_token_hash).toBeNull();
    expect(linha.email_verified_at).toBeNull();
  });

  it("inscricao que nao existe devolve null, e nao estoura", async () => {
    // `maybeSingle()` e nao `single()`: linha apagada depois de a fila enche-la
    // e caso real (nao ha FK entre `email_outbox` e `championship_registrations`),
    // e estourar aqui derrubaria o lote inteiro por uma linha orfa.
    const claro = await store.issueVerificationToken("bbbbbbbb-0000-4000-8000-00000000dead");
    expect(claro).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A funcao do banco que fecha o ciclo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `verify_registration_email` (migration 20260824010000), chamada direto.
 *
 * Ela nao e metodo do store -- quem a chama e
 * `app/(public)/verify-email/[token]/actions.ts` --, e esta e a unica suite
 * deste repo que fala com o Postgres local. Sem estes cenarios, a propriedade
 * central da funcao (as duas gravacoes caem JUNTAS) nao teria prova nenhuma:
 * `app/**` esta fora de todo `include`.
 */
describe("verify_registration_email", () => {
  async function verificar(hash: string | null): Promise<string> {
    const { data, error } = await db.rpc("verify_registration_email", { p_token_hash: hash });
    if (error) throw new Error(`verify_registration_email falhou: ${error.message}`);
    return String(data);
  }

  async function emailDoCadastro(cpf: string): Promise<string | null> {
    const { data, error } = await db.from("players").select("email").eq("cpf", cpf).maybeSingle();
    if (error) throw new Error(`leitura do cadastro ${cpf} falhou: ${error.message}`);
    return (data as { email: string | null } | null)?.email ?? null;
  }

  it("carimba a inscricao E propaga o endereco para o cadastro", async () => {
    // A propagacao acontece SO aqui, e essa e a razao de o clique existir: o
    // formulario publico descarta o e-mail digitado para CPF ja cadastrado
    // (`shouldPersistPlayerIdentity`), e e o clique que prova que a caixa e da
    // pessoa. Sem esta assertiva, "verificar" viraria carimbo decorativo.
    expect(await emailDoCadastro(CPF_C)).toBe("cadastro-c@teste.local");

    const claro = await store.issueVerificationToken(REG_PENDENTE);
    expect(await verificar(hashToken(claro as string))).toBe("verified");

    const { data, error } = await db
      .from("championship_registrations")
      .select("email_verified_at")
      .eq("id", REG_PENDENTE)
      .maybeSingle();
    if (error) throw new Error(`leitura do carimbo falhou: ${error.message}`);
    expect((data as { email_verified_at: string | null }).email_verified_at).not.toBeNull();

    // O endereco DIGITADO venceu o do cadastro, e so depois do clique.
    expect(await emailDoCadastro(CPF_C)).toBe("digitado-c@teste.local");

    // ── O ESCOPO DA PROPAGACAO, E POR QUE ELE PRECISA DE ASSERTIVA PROPRIA ──
    //
    // A assertiva de cima prova que o cadastro CERTO mudou. Nao prova que so ele
    // mudou. MEDIDO nesta branch: alargando o `WHERE id = v_player_id` do
    // `UPDATE public.players` para `WHERE id IS NOT NULL`, os 21 cenarios
    // ficavam VERDES -- e o banco local terminava com 64 de 64 jogadores
    // carregando o e-mail de UMA pessoa so. Nenhum cenario olhava para fora da
    // propria fixtura.
    //
    // (A mutacao ingenua -- `UPDATE` sem `WHERE` -- nem chega a rodar: o
    // `pg_safeupdate` do Supabase a recusa. A que passa e esta, e e por ela que
    // esta assertiva foi escrita.)
    expect(await emailDoCadastro(CPF_D), "o cadastro de OUTRO jogador mudou").toBe(
      "cadastro-d@teste.local",
    );
    expect(await emailDoCadastro(CPF_E), "o cadastro de OUTRO jogador mudou").toBe(
      "cadastro-e@teste.local",
    );
    // E a contagem, que pega o dano em massa mesmo quando ele nao toca nenhum
    // dos CPFs listados acima: um `UPDATE` de escopo aberto colapsa os enderecos
    // de todo mundo num so.
    const distintos = Number(catalogo("select count(distinct email) from public.players;"));
    const total = Number(catalogo("select count(*) from public.players;"));
    expect(
      distintos,
      `os ${total} jogadores ficaram com ${distintos} endereco(s) distinto(s) -- ` +
        "a propagacao escapou do jogador desta inscricao",
    ).toBe(total);
  });

  it("o SEGUNDO clique no mesmo link diz 'already', e nao 'unknown'", async () => {
    // O hash NAO e apagado na verificacao, e e isso que faz o segundo clique
    // encontrar a linha. Apagando-o, esta chamada responderia 'unknown' e a
    // tela diria "este link nao vale mais" para quem so clicou duas vezes --
    // o comportamento mais comum que existe.
    //
    // Depende do cenario acima ter rodado: a inscricao ja esta verificada aqui.
    const { data, error } = await db
      .from("championship_registrations")
      .select("email_verification_token_hash")
      .eq("id", REG_PENDENTE)
      .maybeSingle();
    if (error) throw new Error(`leitura do hash falhou: ${error.message}`);
    const hash = (data as { email_verification_token_hash: string | null })
      .email_verification_token_hash;
    expect(hash, "a verificacao apagou o hash").not.toBeNull();

    expect(await verificar(hash)).toBe("already");
  });

  it("hash que nao casa com nada devolve 'unknown'", async () => {
    expect(await verificar(hashToken("um token que nunca foi emitido"))).toBe("unknown");
  });

  it("hash nulo ou vazio NUNCA casa com uma linha de hash nulo", async () => {
    // `REG_SEM_EMAIL` tem `email_verification_token_hash` nulo, e e a forma mais
    // comum de linha nesta tabela. Em SQL, `coluna = NULL` nunca e verdadeiro --
    // mas a funcao nao se apoia nisso: ela recusa o hash ausente ANTES da
    // consulta. As duas chamadas abaixo provam o resultado, que e o que importa.
    expect(await verificar(null)).toBe("unknown");
    expect(await verificar("")).toBe("unknown");
    expect(await verificar("   ")).toBe("unknown");

    // E a linha de hash nulo continua intacta -- nao foi carimbada por nenhuma
    // das tres.
    const { data, error } = await db
      .from("championship_registrations")
      .select("email_verified_at")
      .eq("id", REG_SEM_EMAIL)
      .maybeSingle();
    if (error) throw new Error(`leitura de ${REG_SEM_EMAIL} falhou: ${error.message}`);
    expect((data as { email_verified_at: string | null }).email_verified_at).toBeNull();
  });

  it("inscricao sem jogador verifica assim mesmo, sem cadastro para atualizar", async () => {
    // `player_id` e NULLABLE. Sem jogador nao ha `players.email` para gravar, e
    // a verificacao da INSCRICAO continua valendo: o que ela afirma e que alguem
    // abriu o link enviado, e isso segue verdade.
    const { error: erroReg } = await db
      .from("championship_registrations")
      .update({ player_id: null, email_verified_at: null, email_verification_token_hash: null })
      .eq("id", REG_SEM_EMAIL);
    if (erroReg) throw new Error(`ajuste da fixtura falhou: ${erroReg.message}`);
    const { error: erroEmail } = await db
      .from("championship_registrations")
      .update({ contact_email: "orfa@teste.local" })
      .eq("id", REG_SEM_EMAIL);
    if (erroEmail) throw new Error(`ajuste do endereco falhou: ${erroEmail.message}`);

    const claro = await store.issueVerificationToken(REG_SEM_EMAIL);
    expect(claro).not.toBeNull();
    expect(await verificar(hashToken(claro as string))).toBe("verified");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O catalogo: o que nenhum cenario de comportamento alcanca
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As propriedades de SEGURANCA de `verify_registration_email`, lidas do
 * `pg_catalog`.
 *
 * Nenhuma delas tem sintoma no caminho feliz -- e por isso que precisam de
 * assertiva propria. MEDIDO: removendo `SET search_path = public` da funcao, os
 * 21 cenarios de comportamento ficavam VERDES.
 */
describe("verify_registration_email, pelo catalogo", () => {
  const REGPROC = "'public.verify_registration_email(text)'::regprocedure";

  it("fixa o search_path", () => {
    // Sem `SET search_path`, a funcao resolve nomes pelo search_path de QUEM
    // CHAMA. Numa funcao `SECURITY DEFINER`, isso e a escalada classica: um
    // schema antecedente com uma `players` falsa passa a receber a gravacao,
    // com os privilegios do dono.
    //
    // As referencias de tabela ja sao qualificadas (`public.`), o que fecha o
    // caminho por outra via -- mas as duas defesas sao independentes, e esta e a
    // que sobrevive a alguem escrever `FROM players` sem prefixo amanha.
    const config = catalogo(
      `select coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = ${REGPROC};`,
    );
    expect(config, "a funcao perdeu o SET search_path").toContain("search_path=public");
  });

  it("continua SECURITY DEFINER", () => {
    // Sem o definer, o INSERT/UPDATE roda com o papel de quem chamou e a RLS de
    // `championship_registrations` (ligada) volta a valer. Nao e furo de
    // seguranca -- e o oposto: a funcao para de funcionar, e a tela responde
    // `error`. Como o `service_role` ignora RLS, nenhum cenario deste arquivo
    // notaria.
    expect(catalogo(`select prosecdef::text from pg_proc where oid = ${REGPROC};`)).toBe(
      "true",
    );
  });

  it("da EXECUTE ao service_role e a mais ninguem", () => {
    // `REVOKE ... FROM PUBLIC` nao fecha nada sozinho neste banco: `anon` e
    // `authenticated` recebem EXECUTE nominalmente por ALTER DEFAULT PRIVILEGES.
    // E o GRANT ao `service_role` e explicito de proposito -- `CREATE OR REPLACE`
    // NAO reaplica as default privileges, entao numa base onde alguem tenha
    // revogado o privilegio, reaplicar a migration sem o GRANT deixaria a funcao
    // existindo e inalcancavel.
    const papeis = catalogo(
      "select coalesce(string_agg(grantee, ',' order by grantee), '') " +
        "from information_schema.role_routine_grants " +
        "where specific_schema = 'public' and routine_name = 'verify_registration_email';",
    ).split(",");

    expect(papeis).toContain("service_role");
    expect(papeis).not.toContain("anon");
    expect(papeis).not.toContain("authenticated");
    expect(papeis).not.toContain("PUBLIC");
  });
});

// Ultimo do arquivo, e tem de continuar sendo: o vitest roda os cenarios na
// ordem em que estao escritos, e este e o que AFIRMA que a limpeza aconteceu. O
// gancho `afterAll` e backstop, nao prova -- no script irmao um trap com
// `|| true` ja engoliu o erro de um DELETE e uma linha viva ficou onze minutos
// numa fila de e-mail; foi a contagem que gritou, nao o trap.
describe("a limpeza", () => {
  it("devolve as tabelas ao estado de antes", async () => {
    await limpar();

    expect(await contarPorKinds(KINDS), "sobrou linha de teste na fila").toBe(0);
    // Assertiva PROPRIA para as linhas do gatilho, porque elas tem kind DE
    // VERDADE: a de cima nao as ve, e a do total so acusaria um numero
    // diferente, sem dizer quem sobrou. Sao as unicas linhas deste arquivo que,
    // esquecidas, ficariam numa fila de e-mail real esperando um dreno.
    expect(
      await contarPorDedupe(REGS),
      "sobrou linha do GATILHO na fila -- kind de verdade, dedupe_key de teste",
    ).toBe(0);
    expect(await contarTabela("championship_registrations", "id", REGS)).toBe(0);
    expect(await contarTabela("players", "cpf", CPFS)).toBe(0);
    expect(await contarTabela("championships", "id", CHAMPS)).toBe(0);
    // A ultima rede: o TOTAL. Ela pega o que as de cima nao enumeram -- uma
    // linha escrita por um cenario com kind que ninguem listou aqui.
    expect(await totalDaFila(), "a fila nao voltou ao tamanho de antes").toBe(filaAntes);
  });
});
