import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SunsetNotice from "@/app/(public)/inscrever/[slug]/steps/SunsetNotice";
import PaymentClosedNotice from "@/app/(public)/inscrever/[slug]/steps/PaymentClosedNotice";
import type { SunsetAlert } from "./sabbath";

/**
 * As duas faixas da pausa, RENDERIZADAS — e nao lidas como texto-fonte.
 *
 * Por que aqui e possivel, e no wizard nao. Os outros testes desta pasta leem
 * arquivos com `readFileSync` porque o projeto nao tem jsdom nem Testing Library
 * e o wizard arrasta server actions, upload, PIX e o heartbeat da reserva. Estes
 * dois componentes nao arrastam nada: recebem props, devolvem markup, e
 * `react-dom/server` ja vem com o Next — sem dependencia nova, sem ambiente de
 * DOM, com o mesmo `environment: "node"`.
 *
 * O que isso compra e exatamente o que faltava, e a revisao provou faltando:
 *
 *   copias trocadas de lugar   ->  a 25 min o jogador lia "o pagamento foi
 *                                  fechado... Nao pague nada agora" com o QR na
 *                                  frente dele; a 5 min lia "se for pagar, pague
 *                                  agora" com o QR ja removido. A condicao
 *                                  intacta, e a suite inteira verde.
 *   `alert === "cutoff"` -> `!==`  ->  o mesmo estrago pelo outro lado.
 *   as duas regioes live trocadas  ->  o aviso de trinta minutos interrompendo o
 *                                  leitor de tela, e o corte — o unico momento
 *                                  em que algo SOME da tela sozinho — saindo
 *                                  calado.
 *   uma frase so no aviso do pagamento  ->  no corte, a tela afirma que a vaga
 *                                  nao esta confirmada. E falso, e manda o
 *                                  jogador cacar um problema que ele nao tem.
 *
 * Nenhuma dessas edicoes muda a estrutura do arquivo, entao nenhuma delas seria
 * pega procurando pedaco de texto na fonte. Aqui todas morrem.
 */

/** Sexta 17h50 em Brasilia. A suite roda com TZ=UTC (ver vitest.config.ts). */
const POR_DO_SOL = "2026-08-21T20:50:00.000Z";

const faixa = (alert: SunsetAlert) => renderToStaticMarkup(createElement(SunsetNotice, { alert }));

/** O texto e o mesmo nos dois niveis; o que muda e a regiao que o carrega. */
const ABERTURA = "As inscrições entram em repouso";

describe("SunsetNotice", () => {
  it("a trinta minutos: diz a hora exata e manda pagar agora", () => {
    const html = faixa({ level: "notice", at: POR_DO_SOL });
    expect(html).toContain(ABERTURA);
    expect(html).toContain("Se for pagar, pague agora");
    // A frase do corte nao pode aparecer aqui: com o QR na frente do jogador,
    // ela o faz desistir de um pagamento que ainda da tempo de fazer.
    expect(html).not.toContain("Não pague nada agora");
  });

  it("no corte: manda parar, e diz o que fazer com o comprovante ja pago", () => {
    const html = faixa({ level: "cutoff", at: POR_DO_SOL });
    expect(html).toContain("Não pague nada agora");
    // Quem abriu o QR a doze minutos, foi ao banco e voltou a oito encontra o
    // envio do comprovante fora do ar. "Nao pague nada agora" e a unica coisa
    // que esta faixa nao deveria dizer a ele sozinha.
    expect(html).toContain("guarde o comprovante");
    expect(html).not.toContain("Se for pagar, pague agora");
  });

  it("a hora e a de Brasilia, que e onde o sol se poe", () => {
    const html = faixa({ level: "notice", at: POR_DO_SOL });
    expect(html).toContain("17:50");
    // Lida pelo fuso da maquina (UTC na suite, UTC no servidor) sairia 20:50, e
    // o jogador concluiria que tem tres horas de sobra.
    expect(html).not.toContain("20:50");
  });

  it("fora da janela nao ha texto nenhum — mas as regioes ja estao no DOM", () => {
    const html = faixa({ level: "none" });
    expect(html).not.toContain(ABERTURA);
    // O alerta comeca em "none" em TODO carregamento, por causa da hidratacao: o
    // texto SEMPRE chega depois da montagem. Regiao live que nasce junto com o
    // conteudo nao anuncia de forma confiavel.
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
  });

  it("o aviso chega educado; o corte, na hora", () => {
    // A polidez acompanha o nivel. O `SlotNotice` amarrou os dois eixos num so
    // (`urgent` decide a tinta E a regiao), e o corte e o unico lugar do
    // formulario onde eles se separam: tom dourado, porque a pausa nao e perda,
    // e regiao assertiva, porque algo acabou de sumir da tela sozinho.
    const educado = faixa({ level: "notice", at: POR_DO_SOL });
    const assertivo = faixa({ level: "cutoff", at: POR_DO_SOL });

    // A regiao educada vem primeiro no DOM nos dois casos: o texto estar entre
    // as duas aberturas o poe dentro dela; estar depois da segunda o poe na
    // assertiva.
    for (const html of [educado, assertivo]) {
      expect(html.indexOf('aria-live="polite"')).toBeGreaterThan(-1);
      expect(html.indexOf('aria-live="polite"')).toBeLessThan(html.indexOf('role="alert"'));
    }

    expect(educado.indexOf(ABERTURA)).toBeLessThan(educado.indexOf('role="alert"'));
    expect(assertivo.indexOf(ABERTURA)).toBeGreaterThan(assertivo.indexOf('role="alert"'));
  });

  it("instante podre nao derruba a pagina de inscricao inteira", () => {
    // `Intl.DateTimeFormat().format(new Date("banana"))` lanca RangeError, e um
    // Client Component sem error boundary leva a pagina junto: tela branca.
    expect(() => faixa({ level: "cutoff", at: "banana" })).not.toThrow();
    expect(faixa({ level: "cutoff", at: "banana" })).not.toContain(ABERTURA);
  });
});

describe("PaymentClosedNotice", () => {
  const aviso = (reason: "slot" | "sunset") =>
    renderToStaticMarkup(createElement(PaymentClosedNotice, { reason }));

  it("sem vaga, fala da vaga", () => {
    const html = aviso("slot");
    expect(html).toContain("enquanto sua vaga não estiver confirmada");
    expect(html).not.toContain("pôr do sol");
  });

  it("no corte, fala do por do sol — e nao da vaga", () => {
    const html = aviso("sunset");
    expect(html).toContain("pôr do sol");
    // A frase da vaga aqui e FALSA: a vaga dele esta reservada e continua
    // valendo. Ela o manda procurar um problema que ele nao tem.
    expect(html).not.toContain("enquanto sua vaga não estiver confirmada");
  });

  it("no corte, diz o que fazer com o comprovante de quem ja pagou", () => {
    // Este e o lugar onde ele procura: e onde o envio do comprovante estava ha
    // um minuto. `payment_receipt_link` e `optional()` no schema, entao sem esta
    // frase ele envia a inscricao sem comprovante nenhum.
    expect(aviso("sunset")).toContain("guarde o comprovante");
  });
});
