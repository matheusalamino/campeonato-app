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
  // Sabado, 22/08/2026, 02:00 em Brasilia.
  const agora = new Date("2026-08-22T05:00:00.000Z");
  // O fim REAL daquela janela, copiado de `sabbath_windows`: a linha e
  // 2026-08-21 20:55:36+00 -> 2026-08-22 20:55:58+00.
  const FIM = "2026-08-22T20:55:58.000Z";
  const sabado = { endsAt: FIM };

  it("dentro do prazo e com status subscribing, o sabado substitui o wizard", () => {
    expect(registrationGate(aberto, agora, sabado)).toEqual({ view: "rest", endsAt: FIM });
  });

  it("sem pausa, o campeonato aberto continua no wizard", () => {
    expect(registrationGate(aberto, agora, null)).toEqual({ view: "wizard" });
  });

  it("o status rest sozinho continua valendo como override manual, sem horario", () => {
    // Feriado ou pausa nao prevista: ninguem sabe quando volta, e prometer um
    // horario seria inventar.
    expect(registrationGate({ ...aberto, status: "rest" }, agora, null))
      .toEqual({ view: "rest", endsAt: null });
  });

  it("o override manual herda o horario do sabado quando os dois valem", () => {
    expect(registrationGate({ ...aberto, status: "rest" }, agora, sabado))
      .toEqual({ view: "rest", endsAt: FIM });
  });

  /*
   * Os quatro abaixo prendem a ORDEM: a pausa substitui o WIZARD, e so ele.
   *
   * O dano de move-la para o topo e concreto, e por isso esta escrito aqui: um
   * campeonato fechado passaria a mostrar "Inscricoes em repouso" com contagem
   * regressiva, e depois do por do sol a pessoa voltaria para descobrir que ele
   * nunca esteve aberto. O horario do fim do sabado nao diz nada sobre um
   * campeonato que nao reabre ali.
   *
   * A observancia nao perde nada com esta ordem: o wizard e o unico caminho
   * para gravar inscricao, ele vem depois da pausa, e as RPCs das inscricoes
   * recusam no banco de forma independente da tela.
   */
  it("um campeonato fora do ciclo continua not_open no sabado", () => {
    expect(registrationGate({ ...aberto, status: "draft" }, agora, sabado))
      .toEqual({ view: "not_open" });
  });

  it("o prazo vencido continua ended_by_deadline no sabado", () => {
    const vencido = { ...aberto, registration_end_date: "2026-08-01T03:00:00.000Z" };
    expect(registrationGate(vencido, agora, sabado))
      .toEqual({ view: "ended_by_deadline", endedAt: "2026-08-01T03:00:00.000Z" });
  });

  it("a lotacao continua ended_by_capacity no sabado", () => {
    expect(registrationGate({ ...aberto, status: "subscribed" }, agora, sabado))
      .toEqual({ view: "ended_by_capacity" });
  });

  it("quem ainda nao abriu continua not_yet no sabado, com a contagem honesta", () => {
    const futuro = { ...aberto, registration_start_date: "2026-09-01T03:00:00.000Z" };
    expect(registrationGate(futuro, agora, sabado))
      .toEqual({ view: "not_yet", opensAt: "2026-09-01T03:00:00.000Z" });
  });
});
