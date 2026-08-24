import { describe, it, expect } from "vitest";
import { FIELD_STEP, stepOfField, errorsForStep, firstStepWithError, stepNumber } from "./field-steps";

describe("FIELD_STEP", () => {
  it("pede a posicao NO MESMO passo do CPF", () => {
    // A reserva da vaga dispara ao sair do passo do CPF, e ela manda o BALDE
    // junto — goleiro ou linha. Se a posicao for perguntada num passo posterior,
    // toda reserva nasce no balde de linha e o goleiro alem da cota so descobre
    // a recusa no envio, com o PIX ja pago. E o dano que o A4 gastou duas PRs
    // prevenindo.
    //
    // Compara com o passo do CPF em vez de fixar `1`: o dia em que um passo
    // novo entrar na frente, o que precisa continuar valendo e que os dois
    // estao JUNTOS — nao que o numero seja um.
    expect(FIELD_STEP.preferred_position).toBe(FIELD_STEP.cpf);
  });
});

describe("stepOfField", () => {
  it("mapeia cada campo ao passo em que ele aparece", () => {
    expect(stepOfField("cpf")).toBe(1);
    expect(stepOfField("email")).toBe(2);
    expect(stepOfField("group_affiliation")).toBe(2);
    expect(stepOfField("weight")).toBe(4);
    expect(stepOfField("legal_authorization_link")).toBe(3);
    expect(stepOfField("profile_photo_link")).toBe(6);
  });

  it("mantem os dois campos de camiseta juntos, no passo do uniforme", () => {
    expect(stepOfField("shirt_name")).toBe(5);
    expect(stepOfField("shirt_size")).toBe(5);
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
    expect(errorsForStep(7, erros)).toEqual({});
  });

  it("recorta os erros do passo de ingressos, que agora e o 6", () => {
    expect(errorsForStep(6, erros)).toEqual({
      profile_photo_link: "Foto de perfil é obrigatória",
    });
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
    expect(stepNumber(7, true)).toBe(7);
  });

  it("fecha o buraco quando o passo da carta nao aparece", () => {
    expect(stepNumber(1, false)).toBe(1);
    expect(stepNumber(2, false)).toBe(2);
    expect(stepNumber(4, false)).toBe(3);
    expect(stepNumber(5, false)).toBe(4);
    expect(stepNumber(6, false)).toBe(5);
    expect(stepNumber(7, false)).toBe(6);
  });
});
