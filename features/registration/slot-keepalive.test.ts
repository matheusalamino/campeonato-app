import { describe, it, expect } from "vitest";
import {
  shouldRenewSlot,
  slotCountdown,
  HEARTBEAT_INTERVAL_MS,
  IDLE_BUDGET_MS,
  MIN_RENEW_GAP_MS,
} from "./slot-keepalive";

const T0 = Date.parse("2026-08-19T12:00:00.000Z");
const MIN = 60_000;

/** Renovacao antiga o bastante para nunca ser o motivo de um `false`. */
const RENOVOU_HA_MUITO = T0 - 60 * MIN;

describe("shouldRenewSlot", () => {
  it("renova enquanto o jogador da sinal de vida", () => {
    expect(
      shouldRenewSlot({ nowMs: T0, lastActivityMs: T0 - MIN, lastRenewMs: RENOVOU_HA_MUITO }),
    ).toBe(true);
  });

  it("para de renovar quando o orcamento de inatividade acaba", () => {
    expect(
      shouldRenewSlot({
        nowMs: T0,
        lastActivityMs: T0 - IDLE_BUDGET_MS - 1,
        lastRenewMs: RENOVOU_HA_MUITO,
      }),
    ).toBe(false);
  });

  it("ainda renova no ultimo instante do orcamento", () => {
    expect(
      shouldRenewSlot({
        nowMs: T0,
        lastActivityMs: T0 - IDLE_BUDGET_MS,
        lastRenewMs: RENOVOU_HA_MUITO,
      }),
    ).toBe(true);
  });

  it("nao renova duas vezes dentro do piso: tecla digitada nao vira RPC", () => {
    expect(
      shouldRenewSlot({ nowMs: T0, lastActivityMs: T0, lastRenewMs: T0 - MIN_RENEW_GAP_MS + 1 }),
    ).toBe(false);
  });

  it("renova de novo assim que o piso passa", () => {
    expect(
      shouldRenewSlot({ nowMs: T0, lastActivityMs: T0, lastRenewMs: T0 - MIN_RENEW_GAP_MS }),
    ).toBe(true);
  });

  it("quem volta do app do banco renova na hora, sem esperar a proxima batida", () => {
    // Ultima batida ha um intervalo inteiro; a volta para a aba e sinal de vida.
    expect(
      shouldRenewSlot({
        nowMs: T0,
        lastActivityMs: T0,
        lastRenewMs: T0 - HEARTBEAT_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("relogio que anda para tras nunca prende a vaga", () => {
    expect(
      shouldRenewSlot({ nowMs: T0, lastActivityMs: T0 + 10 * MIN, lastRenewMs: RENOVOU_HA_MUITO }),
    ).toBe(true);
  });

  it("aba abandonada: as batidas continuam, as renovacoes acabam", () => {
    // Uma hora de batidas sem toque nenhum depois do ultimo sinal de vida.
    let lastRenew = T0;
    const renovacoes: number[] = [];
    for (let t = T0; t <= T0 + 60 * MIN; t += HEARTBEAT_INTERVAL_MS) {
      if (shouldRenewSlot({ nowMs: t, lastActivityMs: T0, lastRenewMs: lastRenew })) {
        renovacoes.push(t - T0);
        lastRenew = t;
      }
    }
    // Sem esta primeira linha o teste e unilateral: com a politica recusando
    // tudo, `renovacoes` fica vazio, `Math.max()` de vazio e -Infinity e as duas
    // assercoes de teto passam — "nunca renovou" seria lido como sucesso.
    expect(renovacoes.length).toBeGreaterThan(0);
    // E nenhuma renovacao depois do orcamento, por mais que o timer bata.
    expect(Math.max(...renovacoes)).toBeLessThanOrEqual(IDLE_BUDGET_MS);
    expect(renovacoes.length).toBeLessThanOrEqual(IDLE_BUDGET_MS / HEARTBEAT_INTERVAL_MS + 1);
  });

  it("jogador presente: as batidas renovam sem teto de total", () => {
    let lastRenew = T0;
    let ultima = -1;
    for (let t = T0; t <= T0 + 60 * MIN; t += HEARTBEAT_INTERVAL_MS) {
      // Toca a tela de vez em quando, como quem esta preenchendo.
      if (shouldRenewSlot({ nowMs: t, lastActivityMs: t - MIN, lastRenewMs: lastRenew })) {
        ultima = t - T0;
        lastRenew = t;
      }
    }
    // Uma hora depois ainda renova: quem esta ali nao perde a vaga por demorar.
    expect(ultima).toBe(60 * MIN);
  });
});

describe("slotCountdown", () => {
  const em = (ms: number) => slotCountdown(new Date(T0 + ms).toISOString(), T0);
  /** Estreita a uniao nos casos em que a assercao e sobre o rotulo. */
  const contando = (ms: number) => {
    const c = em(ms);
    if (!c || c.expired) throw new Error(`esperava contagem, veio ${JSON.stringify(c)}`);
    return c;
  };

  it("mostra os minutos que faltam, sem nunca prometer mais do que tem", () => {
    expect(contando(15 * MIN)).toEqual({
      expired: false,
      label: "Vaga reservada por mais 15 min",
      low: false,
    });
    expect(contando(15 * MIN + 20_000).label).toBe("Vaga reservada por mais 15 min");
    expect(contando(14 * MIN + 59_000).label).toBe("Vaga reservada por mais 14 min");
  });

  it("troca de tom quando o tempo esta acabando", () => {
    expect(contando(10 * MIN).low).toBe(false);
    expect(contando(2 * MIN).low).toBe(true);
    expect(contando(90_000).label).toBe("Vaga reservada por mais 1 min");
  });

  it("no ultimo minuto para de contar minutos", () => {
    expect(contando(59_000)).toEqual({
      expired: false,
      label: "Vaga reservada por menos de 1 min",
      low: true,
    });
  });

  it("vencida vira caso proprio, sem rotulo: quem fala e a faixa", () => {
    expect(em(0)).toEqual({ expired: true });
    expect(em(-5 * MIN)).toEqual({ expired: true });
  });

  it("data que nao da para ler nao vira contador nenhum", () => {
    expect(slotCountdown("nao e uma data", T0)).toBeNull();
  });
});
