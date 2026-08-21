import { describe, it, expect } from "vitest";
import { DEFAULT_MAX_EXTRA_TICKETS, extraTicketsCap } from "./extra-tickets";

describe("extraTicketsCap", () => {
  it("usa o teto do campeonato quando ele existe", () => {
    expect(extraTicketsCap(6)).toBe(6);
  });

  it("cai no padrao quando o campeonato nao define", () => {
    expect(extraTicketsCap(null)).toBe(DEFAULT_MAX_EXTRA_TICKETS);
    expect(extraTicketsCap(undefined)).toBe(DEFAULT_MAX_EXTRA_TICKETS);
  });

  it("trata zero como zero, e nao como ausencia", () => {
    // Um campeonato sem ingressos extras a venda e configuracao valida.
    expect(extraTicketsCap(0)).toBe(0);
  });

  it("nunca devolve teto negativo", () => {
    expect(extraTicketsCap(-3)).toBe(0);
  });
});

describe("DEFAULT_MAX_EXTRA_TICKETS", () => {
  it("e 4", () => {
    expect(DEFAULT_MAX_EXTRA_TICKETS).toBe(4);
  });
});
