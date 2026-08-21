import { describe, it, expect } from "vitest";
import { registrationGate } from "./registration-gate";

const ABRE_RAW = "2026-08-12T03:00:00+00:00"; // como o PostgREST devolve
const ABRE = "2026-08-12T03:00:00.000Z";   // como o gate normaliza (12/08 00:00 em Brasilia)
const FECHA = "2026-09-28T02:59:59.000Z";  // 27/09 23:59:59 em Brasilia

const base = {
  status: "subscribing",
  registration_start_date: ABRE_RAW,
  registration_end_date: FECHA,
};

const em = (iso: string) => new Date(iso);

describe("registrationGate", () => {
  it("mostra o wizard dentro da janela", () => {
    expect(registrationGate(base, em("2026-09-01T12:00:00Z"))).toEqual({ view: "wizard" });
  });

  it("no instante exato da abertura ja esta aberto", () => {
    expect(registrationGate(base, em(ABRE))).toEqual({ view: "wizard" });
  });

  it("um milissegundo antes da abertura ainda nao abriu", () => {
    expect(registrationGate(base, new Date(Date.parse(ABRE) - 1)))
      .toEqual({ view: "not_yet", opensAt: ABRE });
  });

  it("no instante exato do encerramento ainda aceita", () => {
    expect(registrationGate(base, em(FECHA))).toEqual({ view: "wizard" });
  });

  it("um milissegundo depois do encerramento fecha por prazo", () => {
    expect(registrationGate(base, new Date(Date.parse(FECHA) + 1)))
      .toEqual({ view: "ended_by_deadline", endedAt: FECHA });
  });

  it("o sabado ganha do resto", () => {
    expect(registrationGate({ ...base, status: "rest" }, em(ABRE)))
      .toEqual({ view: "rest" });
  });

  it("lotacao fecha antes de qualquer conta de data", () => {
    // `subscribed` so e setado pela RPC quando a lotacao enche, entao ele conta
    // a historia certa mesmo dentro da janela.
    expect(registrationGate({ ...base, status: "subscribed" }, em("2026-09-01T12:00:00Z")))
      .toEqual({ view: "ended_by_capacity" });
  });

  it("status fora do ciclo nao vira conversa sobre data", () => {
    expect(registrationGate({ ...base, status: "draft" }, em("2026-09-01T12:00:00Z")))
      .toEqual({ view: "not_open" });
  });

  it("abertura nula nao e borda: nao trava ninguem do lado de fora", () => {
    expect(registrationGate({ ...base, registration_start_date: null }, em("2020-01-01T00:00:00Z")))
      .toEqual({ view: "wizard" });
  });

  it("encerramento nulo nao fecha nunca", () => {
    expect(registrationGate({ ...base, registration_end_date: null }, em("2099-01-01T00:00:00Z")))
      .toEqual({ view: "wizard" });
  });

  it("sem data nenhuma, se comporta como antes do A5", () => {
    expect(registrationGate(
      { status: "subscribing", registration_start_date: null, registration_end_date: null },
      em("2026-09-01T12:00:00Z"),
    )).toEqual({ view: "wizard" });
  });

  it("data ilegivel e tratada como borda inexistente, nao como agora", () => {
    // Uma data corrompida virando `Invalid Date` faria toda comparacao dar
    // false e o campeonato abriria — melhor decidir isso de proposito.
    expect(registrationGate({ ...base, registration_start_date: "banana" }, em("2020-01-01T00:00:00Z")))
      .toEqual({ view: "wizard" });
  });
});
