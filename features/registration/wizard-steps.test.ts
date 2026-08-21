import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIELD_STEP,
  AUTHORIZATION_STEP,
  UNIFORM_STEP,
  PAYMENT_STEP,
} from "./field-steps";

/**
 * O mapa FIELD_STEP e a posicao de cada campo no JSX sao mantidos a mao em dois
 * arquivos. Nada os trava juntos, e foi exatamente dessa familia o bug que
 * abriu a branch do A3: um campo mapeado para um passo e renderizado em outro
 * faz o formulario abrir o passo errado quando o servidor devolve erro — e isso
 * passa pelo typecheck e pela suite inteira, porque os dois lados sao numeros
 * validos que ninguem compara.
 *
 * Le o wizard como texto de proposito: o projeto nao tem jsdom nem Testing
 * Library (vitest roda com environment "node"), e montar essa infra so para uma
 * checagem estrutural seria desproporcional — renderizar o wizard exigiria
 * dublar server actions, upload, PIX e o heartbeat da reserva para descobrir
 * um fato que esta escrito no proprio arquivo.
 */
const WIZARD = join(
  process.cwd(),
  "app/(public)/inscrever/[slug]/RegistrationWizard.tsx",
);

/** Ids de passo que o JSX escreve por nome; os demais vem como literal. */
const CONSTANTES: Record<string, number> = {
  AUTHORIZATION_STEP,
  UNIFORM_STEP,
  // Ainda nao usado no JSX, que escreve `step === 6`. Fica aqui para o dia em
  // que passar a ser — sem isso, o passo do pagamento sairia do teste calado.
  PAYMENT_STEP,
};

type Achado = {
  /** Quantos `<StepShell` o arquivo tem. */
  blocos: number;
  /** Quantos deles tiveram o id do passo reconhecido. */
  comId: number;
  /** Passos em que cada campo aparece — Set para expor campo em dois lugares. */
  porCampo: Map<string, Set<number>>;
};

/**
 * Um campo se declara de duas formas dentro de um passo, e as duas contam.
 *
 * `fieldProps` cobre os inputs e selects nativos. Mas a carta do responsavel, a
 * foto, o comprovante e o contador de ingressos extras nao passam por ele: sao
 * UploadCard e botoes, que se ligam ao formulario so pelo `set`. Sem o segundo
 * padrao os passos 3 e 6 ficariam inteiros fora do teste — e o passo 6 e
 * justamente onde o A4 mexeu.
 */
function lerWizard(fonte: string): Achado {
  const padroes = [
    // <input {...fieldProps("email")} />, e tambem fieldProps("shirt_size", "hint")
    /fieldProps\("(\w+)"/g,
    // onChange={(u) => set("profile_photo_link", u)}. A vista atras evita casar
    // `offset(` ou um `.set(` de Map; `setSkill(` ja nao casa pelo `("`.
    /(?<![\w.])set\("(\w+)"/g,
  ];

  // Cada StepShell abre um trecho; o id vem do open={step === N}.
  const blocos = fonte.split("<StepShell").slice(1);
  const porCampo = new Map<string, Set<number>>();
  let comId = 0;

  for (const bloco of blocos) {
    const m = bloco.match(/open=\{step === ([A-Z_]+|\d+)\}/);
    if (!m) continue;
    const id = CONSTANTES[m[1]] ?? Number(m[1]);
    if (!Number.isFinite(id)) continue;
    comId += 1;

    for (const padrao of padroes) {
      for (const campo of bloco.matchAll(padrao)) {
        const passos = porCampo.get(campo[1]) ?? new Set<number>();
        passos.add(id);
        porCampo.set(campo[1], passos);
      }
    }
  }

  return { blocos: blocos.length, comId, porCampo };
}

describe("FIELD_STEP contra o JSX do wizard", () => {
  const achado = lerWizard(readFileSync(WIZARD, "utf8"));

  /** Um passo so, quando o campo aparece num lugar so — garantido logo abaixo. */
  const passoDe = (campo: string) => [...(achado.porCampo.get(campo) ?? [])][0];

  // As tres sentinelas existem porque este teste le texto: se o formato do JSX
  // mudar a ponto dos regex nao casarem, ele passaria vazio e daria uma falsa
  // sensacao de seguranca — exatamente o que ele foi escrito para nao permitir.

  it("reconhece o passo de todos os StepShell que encontra", () => {
    expect(achado.blocos).toBeGreaterThan(0);
    expect(achado.comId).toBe(achado.blocos);
  });

  it("encontra os campos do wizard, senao o teste nao esta lendo nada", () => {
    // Piso, nao igualdade: campo novo so faz subir. Se cair, alguem sumiu com um
    // campo — ou quebrou o regex — e isso precisa de olho humano.
    expect(achado.porCampo.size).toBeGreaterThanOrEqual(18);
  });

  it("encontra campo em todo passo que o mapa declara", () => {
    const passosDoMapa = [...new Set(Object.values(FIELD_STEP))].sort((a, b) => a - b);
    const passosNoJsx = new Set([...achado.porCampo.values()].flatMap((s) => [...s]));
    const vazios = passosDoMapa.filter((passo) => !passosNoJsx.has(passo));
    expect(vazios).toEqual([]);
  });

  it("nenhum campo aparece em dois passos ao mesmo tempo", () => {
    const espalhados = [...achado.porCampo]
      .filter(([, passos]) => passos.size > 1)
      .map(([campo, passos]) => `${campo}: ${[...passos].sort().join(", ")}`);
    expect(espalhados).toEqual([]);
  });

  it("cada campo renderizado esta no passo que o mapa declara", () => {
    const divergentes: string[] = [];
    for (const campo of achado.porCampo.keys()) {
      const passoNoJsx = passoDe(campo);
      if (FIELD_STEP[campo] !== passoNoJsx) {
        divergentes.push(
          `${campo}: JSX diz ${passoNoJsx}, mapa diz ${FIELD_STEP[campo]}`,
        );
      }
    }
    expect(divergentes).toEqual([]);
  });

  it("nenhum campo renderizado esta fora do mapa", () => {
    const foraDoMapa = [...achado.porCampo.keys()].filter(
      (campo) => FIELD_STEP[campo] === undefined,
    );
    expect(foraDoMapa).toEqual([]);
  });

  /**
   * PAYMENT_STEP nao esta no JSX: a guarda de navegacao o usa em `slot.ts`, mas
   * a tela ainda escreve `step === 6`. Sem esta amarra, uma renumeracao que
   * ajustasse o mapa e a tela juntos deixaria a guarda protegendo o passo
   * errado, calada — que e o formato exato do bug do A3. Vira tautologia no dia
   * em que o JSX passar a usar a constante; ate la, morde.
   */
  it("a guarda do pagamento aponta o passo em que o pagamento aparece", () => {
    expect(passoDe("payment_receipt_link")).toBe(PAYMENT_STEP);
    expect(passoDe("extra_tickets_count")).toBe(PAYMENT_STEP);
  });
});
