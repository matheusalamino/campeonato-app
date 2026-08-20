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
    expect(registrationGate(base, em("2026-09-01T12:00:00Z"), null)).toEqual({ view: "wizard" });
  });

  it("no instante exato da abertura ja esta aberto", () => {
    expect(registrationGate(base, em(ABRE), null)).toEqual({ view: "wizard" });
  });

  it("um milissegundo antes da abertura ainda nao abriu", () => {
    expect(registrationGate(base, new Date(Date.parse(ABRE) - 1), null))
      .toEqual({ view: "not_yet", opensAt: ABRE });
  });

  it("no instante exato do encerramento ainda aceita", () => {
    expect(registrationGate(base, em(FECHA), null)).toEqual({ view: "wizard" });
  });

  it("um milissegundo depois do encerramento fecha por prazo", () => {
    expect(registrationGate(base, new Date(Date.parse(FECHA) + 1), null))
      .toEqual({ view: "ended_by_deadline", endedAt: FECHA });
  });

  it("o status rest ganha da janela aberta", () => {
    expect(registrationGate({ ...base, status: "rest" }, em(ABRE), null))
      .toEqual({ view: "rest", endsAt: null });
  });

  it("lotacao fecha antes de qualquer conta de data", () => {
    // `subscribed` so e setado pela RPC quando a lotacao enche, entao ele conta
    // a historia certa mesmo dentro da janela.
    expect(registrationGate({ ...base, status: "subscribed" }, em("2026-09-01T12:00:00Z"), null))
      .toEqual({ view: "ended_by_capacity" });
  });

  it("status fora do ciclo nao vira conversa sobre data", () => {
    expect(registrationGate({ ...base, status: "draft" }, em("2026-09-01T12:00:00Z"), null))
      .toEqual({ view: "not_open" });
  });

  it("abertura nula nao e borda: nao trava ninguem do lado de fora", () => {
    expect(registrationGate({ ...base, registration_start_date: null }, em("2020-01-01T00:00:00Z"), null))
      .toEqual({ view: "wizard" });
  });

  it("encerramento nulo nao fecha nunca", () => {
    expect(registrationGate({ ...base, registration_end_date: null }, em("2099-01-01T00:00:00Z"), null))
      .toEqual({ view: "wizard" });
  });

  it("sem data nenhuma, se comporta como antes do A5", () => {
    expect(registrationGate(
      { status: "subscribing", registration_start_date: null, registration_end_date: null },
      em("2026-09-01T12:00:00Z"),
      null,
    )).toEqual({ view: "wizard" });
  });

  it("data ilegivel e tratada como borda inexistente, nao como agora", () => {
    // Uma data corrompida virando `Invalid Date` faria toda comparacao dar
    // false e o campeonato abriria — melhor decidir isso de proposito.
    expect(registrationGate({ ...base, registration_start_date: "banana" }, em("2020-01-01T00:00:00Z"), null))
      .toEqual({ view: "wizard" });
  });
});

describe("registrationGate e o sabado", () => {
  const aberto = {
    status: "subscribing",
    registration_start_date: "2026-08-01T03:00:00.000Z",
    registration_end_date: "2026-12-31T02:59:00.000Z",
  };
  // Sabado, 22/08/2026, 02:00 em Brasilia — dentro da janela que comeca no por
  // do sol de sexta.
  const agora = new Date("2026-08-22T05:00:00.000Z");
  const FIM = "2026-08-22T20:51:00.000Z";

  it("pausa mesmo com o campeonato dentro do prazo e com status subscribing", () => {
    expect(registrationGate(aberto, agora, { endsAt: FIM }))
      .toEqual({ view: "rest", endsAt: FIM });
  });

  it("sem pausa, o campeonato aberto continua no wizard", () => {
    expect(registrationGate(aberto, agora, null)).toEqual({ view: "wizard" });
  });

  it("o status rest continua valendo como override manual, sem horario", () => {
    // Feriado ou pausa nao prevista: ninguem sabe quando volta, e prometer um
    // horario seria inventar.
    expect(registrationGate({ ...aberto, status: "rest" }, agora, null))
      .toEqual({ view: "rest", endsAt: null });
  });

  it("o sabado ganha do override quando os dois valem — ele sabe a hora", () => {
    expect(registrationGate({ ...aberto, status: "rest" }, agora, { endsAt: FIM }))
      .toEqual({ view: "rest", endsAt: FIM });
  });

  it("o sabado ganha do prazo vencido e da lotacao", () => {
    // A ordem importa: durante o sabado o site nao escreve inscricao nenhuma,
    // entao a pausa e a primeira coisa a ser dita.
    const vencido = { ...aberto, registration_end_date: "2026-08-01T03:00:00.000Z" };
    expect(registrationGate(vencido, agora, { endsAt: FIM }))
      .toEqual({ view: "rest", endsAt: FIM });
    expect(registrationGate({ ...aberto, status: "subscribed" }, agora, { endsAt: FIM }))
      .toEqual({ view: "rest", endsAt: FIM });
  });
});
