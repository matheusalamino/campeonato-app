/**
 * Acionar o dreno DEPOIS de uma acao, sem poder quebra-la.
 *
 * Dois chamadores, a mesma forma: o submit da inscricao publica
 * (`services/public-registration.ts`) e o "pagamento conferido" do admin
 * (`app/(protected)/championship/players/PlayersSection.tsx`). O primeiro chama
 * `runOutboxDrain` direto, porque ja esta no servidor; o segundo bate na rota
 * `/api/email/drain`, porque esta no navegador. O que os dois precisam e igual,
 * e por isso mora aqui.
 *
 * ── POR QUE `await` COM TETO, E NAO "PROMESSA SOLTA" ──
 *
 * O esboco desta task pedia "chamar o dreno sem bloquear". Numa funcao
 * serverless isso nao existe: a instancia pode ser congelada ou derrubada assim
 * que a resposta sai, e a promessa que sobrou nao tem garantia nenhuma de
 * terminar. O primitivo correto seria `waitUntil` de `@vercel/functions`, e ele
 * NAO esta instalado -- CONFERIDO: nao ha `node_modules/@vercel`, nem
 * `@vercel/*` em `package.json`.
 *
 * Entao a decisao e esperar com teto:
 *
 *  - O comprovante e justamente o que a pessoa esta esperando ver.
 *  - Nao acrescenta dependencia.
 *  - E DETERMINISTICO: ou o e-mail saiu, ou a linha continua na fila para o
 *    cron. Promessa solta nao da nem uma coisa nem outra, e falha em silencio.
 *  - A fila e duravel e o dreno trata erro por linha. Estourar o teto nao perde
 *    nada: `claim_email_outbox_batch` (migration 20260823040000) recolhe a linha
 *    que ficou em 'sending' passados 30 minutos.
 *
 * ── O TETO SO PARA DE ESPERAR; ELE NAO ABORTA NADA ──
 *
 * `Promise.race` nao cancela o perdedor. Quem chamou segue a vida; o dreno
 * continua ate onde o ambiente deixar. Isso e proposital nos dois lados:
 *
 *  - no servidor, o que for congelado volta pela recolha dos 30 minutos;
 *  - no navegador, nada e congelado -- a requisicao termina normalmente, e o
 *    teto so devolve o controle a tela antes.
 *
 * Nao ha `AbortController` aqui de proposito. Abortar o `fetch` do dreno no meio
 * deixaria linha em 'sending' com o e-mail JA ENVIADO, que e o unico estado que
 * a caixa de saida nao sabe desfazer.
 */

/**
 * O caminho da rota do dreno, num lugar so.
 *
 * A pasta que o serve -- `app/api/email/drain/` -- e o unico outro lugar onde
 * esse caminho existe, e NADA no TypeScript liga os dois. Quem renomear a pasta
 * e esquecer esta linha faz a tela pedir um 404, e o "pagamento conferido"
 * continua verde: o dreno pos-acao nao pode quebrar a acao, entao o silencio e
 * a resposta certa e a errada ao mesmo tempo.
 *
 * A ponte e assertiva: `features/email/drain-wiring.test.ts` deriva o caminho do
 * arquivo DESTA constante e le `route.ts` de la. Constante mudada sem a pasta
 * mudar junto = vermelho.
 */
export const DRAIN_ENDPOINT = "/api/email/drain";

/**
 * O verbo da SEGUNDA porta, e ele carrega decisao.
 *
 * O cron da Vercel dispara GET. A porta de sessao de admin aceita SO este verbo,
 * e a razao e estreitar o que um site de terceiro consegue provocar no navegador
 * de quem esta logado: um `<img src="/api/email/drain">` numa pagina qualquer
 * dispara GET com os cookies junto, e nao ha nada que o impeca. Com a porta de
 * admin so no POST, esse vetor morre.
 *
 * O que sobra e o formulario cross-site, que POSTa sem preflight. O estrago
 * possivel e um dreno rodando: ele manda o que a fila JA tinha, para os
 * destinatarios que a fila JA determinou, dentro da cota do dia -- que e o
 * mesmo que o cron faria algumas horas depois. Nao ha corpo, nao ha parametro,
 * nao ha nada a escolher. Por isso nao ha token de CSRF aqui: ele custaria mais
 * do que protege.
 */
export const DRAIN_ENDPOINT_METHOD = "POST";

/**
 * O teto do lado do SERVIDOR (submit da inscricao).
 *
 * Aqui esperar custa: a pessoa esta olhando o botao "Enviar". Quatro segundos
 * cobrem, com folga, as duas linhas que o gatilho enfileira -- comprovante e
 * aviso ao organizador -- somando as idas ao Postgres e as duas chamadas ao
 * provedor.
 *
 * Estourar nao e falha: as linhas continuam na fila.
 */
export const SUBMIT_DRAIN_BUDGET_MS = 4_000;

/**
 * O teto do lado da TELA (admin marcando pagamento).
 *
 * Menor que o do servidor, e por um motivo que nao vale para o outro: no
 * navegador desistir de esperar NAO interrompe a requisicao -- ela segue e o
 * dreno termina do lado de la. Aqui o teto e concessao de interface, nao de
 * corretude, e um organizador conferindo pagamentos em serie nao pode pagar
 * quatro segundos de ampulheta por clique.
 */
export const SCREEN_DRAIN_BUDGET_MS = 1_500;

/**
 * Quantas linhas o dreno POS-ACAO pega por vez.
 *
 * O padrao do dreno e 25 (`DEFAULT_BATCH_SIZE`, features/email/outbox.ts), e ele
 * e dimensionado para o cron, que tem o dia inteiro. Aqui ha teto de segundos, e
 * lote grande so aumenta o numero de linhas que ficam em 'sending' quando o teto
 * estoura -- cada uma esperando os 30 minutos da recolha.
 *
 * ── O QUE CINCO NAO GARANTE ──
 *
 * `claim_email_outbox_batch` ordena por `next_attempt_at, created_at`, ou seja,
 * FIFO: o lote pega as linhas MAIS ANTIGAS, e nao as que a acao acabou de
 * enfileirar. Com a fila vazia -- que e o estado normal, porque cada submit
 * drena -- as duas linhas da inscricao que entrou sao as unicas que ha, e saem.
 * Com fila acumulada (uma pausa de sabado inteira, por exemplo), o que sai sao
 * as cinco mais velhas, e o comprovante de quem acabou de se inscrever espera a
 * fila andar.
 *
 * Isso e proposital: a ordem da fila e justa, e furar a fila pelo evento que
 * acionou o dreno faria a linha mais antiga esperar para sempre num fluxo
 * movimentado.
 */
export const POST_ACTION_DRAIN_BATCH_SIZE = 5;

export type PostActionDrainOutcome =
  /** O dreno respondeu dentro do teto. */
  | { status: "done" }
  /** O teto estourou primeiro. A fila continua de pe; o cron termina. */
  | { status: "timeout" }
  /** O dreno levantou. A acao principal segue como se nada tivesse acontecido. */
  | { status: "failed"; error: string };

/**
 * Roda `run` e devolve o que aconteceu, SEM NUNCA LEVANTAR.
 *
 * As duas garantias, e as duas tem assertiva em `post-action-drain.test.ts`:
 *
 *  1. devolve mesmo quando `run` nunca responde (o teto);
 *  2. devolve mesmo quando `run` levanta -- inclusive de forma sincrona, antes
 *     de haver promessa.
 *
 * A (2) e a que protege a inscricao: quando o dreno explode, a linha JA foi
 * gravada. Deixar a excecao subir trocaria um problema pequeno -- o e-mail sai
 * no proximo disparo -- por um grande: a pessoa le "nao foi possivel concluir a
 * inscricao" para uma inscricao que existe, e tenta de novo.
 *
 * `budgetMs` e obrigatorio de proposito. Sao dois tetos com razoes diferentes
 * (ver as constantes acima), e um default aqui deixaria o chamador escolher sem
 * saber que escolheu.
 */
export async function drainWithinBudget(
  run: () => Promise<unknown>,
  budgetMs: number,
): Promise<PostActionDrainOutcome> {
  let trabalho: Promise<unknown>;
  try {
    trabalho = run();
  } catch (err) {
    // `run` levantou ANTES de devolver promessa. Nao e hipotese de laboratorio:
    // uma variavel de ambiente ausente lida na montagem do cliente levanta aqui.
    return { status: "failed", error: String(err) };
  }

  let relogio: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<PostActionDrainOutcome>((resolve) => {
    relogio = setTimeout(() => resolve({ status: "timeout" }), budgetMs);
  });

  // Os dois desfechos de `trabalho` sao tratados AQUI, e nao depois do `race`:
  // se o teto ganhar e a rejeicao chegar sem tratador, o processo colhe uma
  // `unhandledRejection` -- que no servidor e um log de erro para um caso que
  // esta decidido, e em teste derruba a suite inteira.
  const corrida = trabalho.then(
    (): PostActionDrainOutcome => ({ status: "done" }),
    (err): PostActionDrainOutcome => ({ status: "failed", error: String(err) }),
  );

  try {
    return await Promise.race([corrida, teto]);
  } finally {
    // Sem isto o `setTimeout` segura o laco de eventos ate o fim do teto mesmo
    // quando o dreno respondeu em 50ms.
    clearTimeout(relogio);
  }
}

/**
 * O dreno visto da TELA: bate na rota pela segunda porta.
 *
 * Aqui, e nao dentro do `.tsx`, porque `app/**` nao esta no `include` de
 * `vitest.config.ts` e nenhum glob deste repo alcanca `.test.tsx` -- regra
 * escrita la nasce sem rede. Ver o docblock de
 * `features/registration/payment-check.ts`.
 */
export function requestDrain(
  fetchImpl: typeof fetch = fetch,
  budgetMs: number = SCREEN_DRAIN_BUDGET_MS,
): Promise<PostActionDrainOutcome> {
  return drainWithinBudget(
    () => fetchImpl(DRAIN_ENDPOINT, { method: DRAIN_ENDPOINT_METHOD }),
    budgetMs,
  );
}
