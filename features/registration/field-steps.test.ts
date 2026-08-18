import { describe, it, expect } from "vitest";
import { stepOfField, errorsForStep, firstStepWithError, stepNumber } from "./field-steps";

describe("stepOfField", () => {
  it("mapeia cada campo ao passo em que ele aparece", () => {
    expect(stepOfField("cpf")).toBe(1);
    expect(stepOfField("email")).toBe(2);
    expect(stepOfField("group_affiliation")).toBe(2);
    expect(stepOfField("weight")).toBe(4);
    expect(stepOfField("legal_authorization_link")).toBe(3);
    expect(stepOfField("profile_photo_link")).toBe(5);
  });

  it("mantem os dois campos de camiseta juntos, no passo do perfil de jogo", () => {
    expect(stepOfField("shirt_name")).toBe(4);
    expect(stepOfField("shirt_size")).toBe(4);
  });

  it("resolve o caminho aninhado das skills pela raiz", () => {
    expect(stepOfField("skills.visao")).toBe(4);
    expect(stepOfField("skills.reflexo")).toBe(4);
  });

  it("devolve null para campo desconhecido", () => {
    expect(stepOfField("campo_que_nao_existe")).toBeNull();
    expect(stepOfField("")).toBeNull();
  });
});

describe("errorsForStep", () => {
  const erros = {
    cpf: "CPF inválido",
    weight: "Peso inválido",
    "skills.visao": "Avaliação obrigatória",
    profile_photo_link: "Foto de perfil é obrigatória",
  };

  it("filtra so os erros do passo pedido", () => {
    expect(errorsForStep(4, erros)).toEqual({
      weight: "Peso inválido",
      "skills.visao": "Avaliação obrigatória",
    });
  });

  it("devolve vazio quando o passo esta limpo", () => {
    expect(errorsForStep(6, erros)).toEqual({});
  });

  it("ignora campo que nao pertence a passo nenhum", () => {
    expect(errorsForStep(1, { ...erros, form: "erro solto" })).toEqual({ cpf: "CPF inválido" });
  });
});

describe("firstStepWithError", () => {
  it("aponta o primeiro passo com erro, para abrir o accordion certo", () => {
    expect(firstStepWithError({ profile_photo_link: "x", weight: "y" })).toBe(4);
  });

  it("devolve null quando nao ha erro mapeavel", () => {
    expect(firstStepWithError({})).toBeNull();
    expect(firstStepWithError({ form: "erro geral" })).toBeNull();
  });
});

describe("stepNumber", () => {
  it("mantem a numeracao quando o menor precisa da carta", () => {
    expect(stepNumber(2, true)).toBe(2);
    expect(stepNumber(3, true)).toBe(3);
    expect(stepNumber(6, true)).toBe(6);
  });

  it("fecha o buraco quando o passo da carta nao aparece", () => {
    expect(stepNumber(1, false)).toBe(1);
    expect(stepNumber(2, false)).toBe(2);
    expect(stepNumber(4, false)).toBe(3);
    expect(stepNumber(5, false)).toBe(4);
    expect(stepNumber(6, false)).toBe(5);
  });
});
