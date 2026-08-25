import { describe, it, expect, vi, afterEach } from "vitest";
import {
  drainWithinBudget,
  requestDrain,
  DRAIN_ENDPOINT,
  DRAIN_ENDPOINT_METHOD,
  POST_ACTION_DRAIN_BATCH_SIZE,
  SCREEN_DRAIN_BUDGET_MS,
  SUBMIT_DRAIN_BUDGET_MS,
} from "./post-action-drain";
import { DEFAULT_BATCH_SIZE } from "./outbox";

/**
 * As duas garantias do dreno pos-acao, e nada mais.
 *
 * Os tetos sao curtos aqui (milissegundos) porque o relogio e de VERDADE: uma
 * suite que espera quatro segundos de proposito e uma suite que ninguem roda.
 * O que esta sendo provado nao e a duracao, e o DESFECHO.
 */

/** Uma promessa que nunca responde -- o provedor pendurado. */
function nuncaResponde(): Promise<never> {
  return new Promise<never>(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drainWithinBudget", () => {
  it("devolve `done` quando o dreno responde dentro do teto", async () => {
    await expect(drainWithinBudget(async () => "relatorio", 1_000)).resolves.toEqual({
      status: "done",
    });
  });

  it("DEVOLVE quando o envio nunca responde", async () => {
    // ── A PRIMEIRA GARANTIA ──
    //
    // Uma chamada pendurada ao provedor nao pode segurar a inscricao de
    // ninguem. Sem o teto, esta assertiva nunca termina -- e o `testTimeout` do
    // vitest a mata em vermelho, que e o vermelho certo.
    await expect(drainWithinBudget(nuncaResponde, 10)).resolves.toEqual({
      status: "timeout",
    });
  });

  it("devolve `timeout` ANTES de o dreno terminar, e nao depois", async () => {
    // A diferenca entre "tem teto" e "espera ate o fim e chama de teto". Com o
    // teto em 10ms e o trabalho em 300ms, quem espera o trabalho gasta 300ms.
    let terminou = false;
    const devagar = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          terminou = true;
          resolve();
        }, 300),
      );
    const desfecho = await drainWithinBudget(devagar, 10);
    expect(desfecho).toEqual({ status: "timeout" });
    expect(
      terminou,
      "o teto so devolveu depois de o trabalho acabar, entao teto nenhum.",
    ).toBe(false);
  });

  it("excecao do dreno vira desfecho, e NAO sobe", async () => {
    // ── A SEGUNDA GARANTIA ──
    //
    // Quando o dreno explode, a inscricao JA esta gravada. Deixar a excecao
    // subir troca um problema pequeno -- o e-mail sai no proximo disparo -- por
    // um grande: a pessoa le "nao foi possivel concluir a inscricao" para uma
    // inscricao que existe, e tenta de novo.
    const desfecho = await drainWithinBudget(async () => {
      throw new Error("Faltam BREVO_API_KEY, EMAIL_FROM ou EMAIL_FROM_NAME");
    }, 1_000);
    expect(desfecho).toMatchObject({ status: "failed" });
    expect(desfecho).toHaveProperty("error", expect.stringContaining("BREVO_API_KEY"));
  });

  it("excecao SINCRONA, antes de haver promessa, tambem vira desfecho", async () => {
    // `run()` pode levantar antes de devolver qualquer coisa -- e o que faz
    // `createAdminClient()` com variavel de ambiente ausente. Um `try` posto so
    // em volta do `await` nao pega este caso.
    const desfecho = await drainWithinBudget(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    }, 1_000);
    expect(desfecho).toMatchObject({ status: "failed" });
    expect(desfecho).toHaveProperty("error", expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL"));
  });

  it("rejeicao que chega DEPOIS do teto nao vira rejeicao sem tratador", async () => {
    // Se o desfecho do trabalho so fosse tratado depois do `race`, o teto
    // ganharia a corrida e a rejeicao chegaria orfa: `unhandledRejection`, que
    // no servidor e log de erro para um caso ja decidido e em teste derruba a
    // suite inteira.
    const atrasado = () =>
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("tarde")), 30));
    await expect(drainWithinBudget(atrasado, 5)).resolves.toEqual({ status: "timeout" });
    // Tempo de sobra para a rejeicao chegar enquanto este teste ainda e o dono
    // do processo.
    await new Promise((r) => setTimeout(r, 60));
  });

  it("desarma o relogio quando o dreno responde primeiro", async () => {
    // Sem `clearTimeout`, um teto de quatro segundos segura o laco de eventos
    // por quatro segundos mesmo quando o dreno respondeu em 50ms -- e na
    // Vercel, laco de eventos preso e tempo de funcao faturado.
    const espiao = vi.spyOn(globalThis, "clearTimeout");
    await drainWithinBudget(async () => undefined, 60_000);
    expect(espiao).toHaveBeenCalled();
  });

  it("desarma o relogio tambem quando o dreno explode", async () => {
    const espiao = vi.spyOn(globalThis, "clearTimeout");
    await drainWithinBudget(async () => {
      throw new Error("qualquer");
    }, 60_000);
    expect(espiao).toHaveBeenCalled();
  });
});

describe("requestDrain", () => {
  it("bate no caminho da rota, pelo verbo da segunda porta", async () => {
    const chamadas: Array<[string, string | undefined]> = [];
    const falso = (async (url: string, init?: RequestInit) => {
      chamadas.push([String(url), init?.method]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await expect(requestDrain(falso, 1_000)).resolves.toEqual({ status: "done" });
    expect(chamadas).toEqual([[DRAIN_ENDPOINT, DRAIN_ENDPOINT_METHOD]]);
  });

  it("a rota fora do ar NAO vira excecao na tela", async () => {
    // Marcar pagamento tem de continuar funcionando com o dreno fora do ar. A
    // acao principal ja terminou quando esta chamada acontece; deixar o erro
    // subir daqui apagaria o toast de sucesso de uma marcacao que existe.
    const quebrado = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(requestDrain(quebrado, 1_000)).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("a rota pendurada NAO segura a tela alem do teto", async () => {
    const pendurado = (() => nuncaResponde()) as unknown as typeof fetch;
    await expect(requestDrain(pendurado, 10)).resolves.toEqual({ status: "timeout" });
  });
});

describe("os numeros, e o que cada um significa", () => {
  it("a tela espera MENOS que o servidor", () => {
    // Nao e afinacao: sao razoes diferentes. No servidor, desistir pode
    // significar trabalho congelado (a instancia morre com a resposta); no
    // navegador, desistir so devolve o controle a tela -- a requisicao segue e
    // o dreno termina do lado de la. Invertido, o organizador pagaria a
    // ampulheta mais longa justamente onde ela nao compra nada.
    expect(SCREEN_DRAIN_BUDGET_MS).toBeLessThan(SUBMIT_DRAIN_BUDGET_MS);
  });

  it("o lote pos-acao e MENOR que o do cron", () => {
    // O cron tem o dia inteiro; aqui ha teto de segundos. Lote grande so
    // aumenta o numero de linhas que ficam em 'sending' quando o teto estoura,
    // cada uma esperando os 30 minutos da recolha de
    // `claim_email_outbox_batch`.
    expect(POST_ACTION_DRAIN_BATCH_SIZE).toBeLessThan(DEFAULT_BATCH_SIZE);
  });

  it("o lote pos-acao cobre as duas linhas que uma inscricao enfileira", () => {
    // O gatilho `enqueue_registration_emails` poe DUAS: comprovante e aviso ao
    // organizador. Com a fila vazia -- o estado normal, porque cada submit
    // drena --, um lote menor que isso deixaria metade do proprio evento que
    // acionou o dreno para o cron. (Com fila acumulada saem as mais velhas: a
    // ordem e FIFO, e o porque esta no docblock da constante.)
    expect(POST_ACTION_DRAIN_BATCH_SIZE).toBeGreaterThanOrEqual(2);
  });
});
