import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SunsetNotice from "@/app/(public)/inscrever/[slug]/steps/SunsetNotice";
import PaymentClosedNotice from "@/app/(public)/inscrever/[slug]/steps/PaymentClosedNotice";
import SlotNotice from "@/app/(public)/inscrever/[slug]/steps/SlotNotice";
import type { SunsetAlert } from "./sabbath";
import type { SlotReservation } from "./slot";

/**
 * As faixas da pausa, RENDERIZADAS — e nao lidas como texto-fonte.
 *
 * Por que aqui e possivel, e no wizard nao. Os outros testes desta pasta leem
 * arquivos com `readFileSync` porque o projeto nao tem jsdom nem Testing Library
 * e o wizard arrasta server actions, upload, PIX e o heartbeat da reserva. Estes
 * componentes nao arrastam nada: recebem props, devolvem markup, e
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
 *   `alert.level === "cutoff"` -> `!==`  ->  o mesmo estrago pelo outro lado.
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

  it("a pausa e DOURADA: o vermelho desta tela e para perda de vaga", () => {
    // `SlotNotice` fixou a pergunta que classifica: "isso e ma noticia para o
    // jogador?". A pausa nao e — ela congela o campeonato para todo mundo e tem
    // hora para voltar. Pintar de alarme a observancia da comunidade dele e o
    // erro especifico contra o qual o `SlotNotice` gasta um bloco inteiro de
    // comentario, e ate aqui nenhum teste o pegava: `redTone` no lugar do
    // `goldTone`, ou os
    // valores das duas constantes trocados entre si, passavam em tudo.
    //
    // As cores estao escritas AQUI de proposito. Importar `goldTone` faria o
    // teste concordar com qualquer valor que a constante viesse a ter —
    // inclusive com o vermelho, no dia em que os dois trocassem de lugar.
    for (const nivel of ["notice", "cutoff"] as const) {
      const html = faixa({ level: nivel, at: POR_DO_SOL });
      expect(html).toContain("rgba(230,180,34,.08)");
      expect(html).not.toContain("rgba(220,38,38");
    }
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

/**
 * A terceira faixa, e a que a T9 deixou sem rede.
 *
 * O `slot satisfies never` no fim de `noticeFor` garante que EXISTE um ramo para
 * cada razao — nao que o ramo diz a verdade nem que entra no tom certo. E o ramo
 * do sabado gastou o maior bloco de comentario do arquivo argumentando
 * exatamente sobre o tom, que era a unica coisa que nada segurava. Passavam
 * verdes, nos tres portoes:
 *
 *   `urgent: false` -> `true`     ->  a pausa pinta a tela de VERMELHO e
 *                                     interrompe o leitor de tela, quando o
 *                                     vermelho desta tela significa perda ou
 *                                     incerteza e a pausa nao e nenhuma das duas.
 *   o texto do sabado -> a frase  ->  "Tente novamente em instantes" convidando a
 *   do `error`                        insistir durante 24h de pausa.
 *   o texto do sabado -> a frase  ->  "as inscricoes nao estao abertas", que e
 *   do `not_open`, em vermelho        justo a frase vaga que a tela de repouso
 *                                     existe para substituir.
 *
 * O mesmo caminho dos dois vizinhos aqui em cima: `react-dom/server`, sem jsdom
 * e sem dependencia nova. O `SlotNotice` so importa `react`, `slot.ts`,
 * `slot-keepalive.ts` e `tones.ts` — nao arrasta server action, upload nem PIX.
 */
describe("SlotNotice", () => {
  const faixaDaVaga = (slot: SlotReservation | null) =>
    renderToStaticMarkup(createElement(SlotNotice, { slot }));

  it("na pausa: diz repouso, sem mandar tentar de novo e sem a frase vaga", () => {
    const html = faixaDaVaga({ ok: false, reason: "sabbath" });
    expect(html).toContain("em repouso");
    // A UNICA instrucao acionavel que esta faixa da. A pausa dura ate o por do
    // sol de sabado e a hora da volta so existe do outro lado do recarregamento
    // — sem esta palavra sobra uma explicacao bonita e nenhuma saida. A frase do
    // envio recusado ja prende a mesma palavra (commit-refusal.test.ts); a faixa
    // era a metade da assimetria que ninguem segurava.
    expect(html).toContain("Recarregue");
    // A frase do `error`. Aqui ela convidaria a insistir por 24h.
    expect(html).not.toContain("Tente novamente");
    // A frase do `not_open`. E o que a tela de repouso existe para substituir.
    expect(html).not.toContain("não estão abertas");
  });

  it("na pausa: DOURADA, e na regiao educada", () => {
    // Os dois eixos que `urgent` decide de uma vez — a tinta e a regiao live —,
    // medidos juntos porque uma unica troca de `false` para `true` move os dois.
    const html = faixaDaVaga({ ok: false, reason: "sabbath" });
    // As cores escritas aqui de proposito, como no teste do `SunsetNotice`:
    // importar `goldTone` faria o teste concordar com qualquer valor que a
    // constante viesse a ter, inclusive com o vermelho.
    expect(html).toContain("rgba(230,180,34,.08)");
    expect(html).not.toContain("rgba(220,38,38");
    // A regiao `polite` vem primeiro no DOM: o texto antes do `role="alert"`
    // esta dentro dela; depois, estaria na assertiva.
    expect(html.indexOf("em repouso")).toBeLessThan(html.indexOf('role="alert"'));
    // E sai UMA vez so. A linha acima usa `indexOf`, que acha a PRIMEIRA
    // ocorrencia, entao ela sozinha nao ve a faixa duplicada: trocar
    // `{notice?.urgent ? box : null}` por `{notice ? box : null}` na regiao
    // assertiva poe o mesmo paragrafo nas DUAS regioes, e a de baixo interrompe
    // o leitor de tela — exatamente o que o comentario do `case "sabbath"`
    // argumenta para nao fazer. Passava em tudo.
    expect(html.split("em repouso").length - 1).toBe(1);
  });

  it("a perda de vaga continua VERMELHA e na regiao assertiva", () => {
    // O contraste, sem o qual "dourada" passaria num mundo em que tudo ficou
    // dourado. `error` e o vizinho exato da pausa: chega pela mesma batida de
    // fundo, e as duas respostas precisam ser opostas.
    const html = faixaDaVaga({ ok: false, reason: "error" });
    expect(html).toContain("Tente novamente em instantes");
    expect(html).toContain("rgba(220,38,38,.10)");
    expect(html).not.toContain("rgba(230,180,34,.08)");
    expect(html.indexOf("Tente novamente")).toBeGreaterThan(html.indexOf('role="alert"'));
  });

  /**
   * Os dois ramos `ok`, que este describe cobria em zero casos.
   *
   * `noticeFor(slot, countdown?.expired === true)` -> `noticeFor(slot, true)` e
   * valor legitimo do parametro: passa no `tsc`, no eslint e na suite inteira. O
   * que ele faz e por TODA reserva viva para dizer "Sua reserva de vaga venceu
   * enquanto a pagina ficou parada" e mandar tocar na tela para reservar de novo
   * — dito a quem acabou de reservar, com o QR do PIX na frente dele. O outro
   * lado (`false` fixo) e o simetrico: a reserva ja vencida segue prometendo
   * vaga garantida ate o jogador ser recusado no envio.
   */
  it("a reserva viva promete a vaga, e nao anuncia um vencimento que nao houve", () => {
    const html = faixaDaVaga({
      ok: true,
      isWaitlist: false,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    expect(html).toContain("Sua vaga está garantida");
    expect(html).not.toContain("venceu");
  });

  it("a reserva vencida diz que venceu — e continua DOURADA", () => {
    const html = faixaDaVaga({
      ok: true,
      isWaitlist: false,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(html).toContain("venceu enquanto a página ficou parada");
    expect(html).not.toContain("Sua vaga está garantida");
    // Dourada apesar de ser noticia ruim: nao e veredito sobre lotacao — a vaga
    // pode continuar ali, so a reserva que a segurava venceu. Vermelho aqui
    // afirmaria um esgotamento que ninguem mediu.
    expect(html).toContain("rgba(230,180,34,.08)");
    expect(html).not.toContain("rgba(220,38,38");
  });

  it("a cota de goleiro nomeia o gol e aponta a saida do jogador", () => {
    const html = faixaDaVaga({ ok: false, reason: "goalkeepers_full", retryAt: null });
    // A palavra sem a qual esta faixa vira a do `full`. "As vagas se esgotaram"
    // e falso justo quando mais importa: num campeonato de 80 com 8 goleiros a
    // cota fecha com 72 vagas de linha ainda abertas.
    expect(html).toContain("goleiro");
    // A frase do `error`, que aqui e falsa por construcao: insistir nao cria
    // vaga de goleiro. Foi por ela que esta razao passava antes de existir em
    // TypeScript — `isKnownReason` a recusava e ela chegava como `error`.
    expect(html).not.toContain("Tente novamente em instantes");
    // A saida tem de estar na tela: sem ela sobra um diagnostico e nenhuma
    // acao. E a unica coisa que o jogador ainda pode fazer aqui.
    expect(html).toMatch(/posi[çc][ãa]o/i);
    // Com a cota tomada por inscricao CONFIRMADA nao ha nada vencendo. Prometer
    // que "algumas podem voltar" seria mandar esperar por uma vaga que nao vem.
    expect(html).not.toContain("podem voltar");
  });

  it("a cota de goleiro e VERMELHA, ao contrario da pausa", () => {
    // A pergunta que classifica a faixa e "isso e ma noticia para o jogador?".
    // A pausa do sabado congela o campeonato para todo mundo e tem hora para
    // voltar; aqui houve PERDA — as vagas de goleiro acabaram e, para ele, o
    // campeonato fechou. Dourado aqui suavizaria a unica noticia da tela.
    const html = faixaDaVaga({ ok: false, reason: "goalkeepers_full", retryAt: null });
    expect(html).toContain("rgba(220,38,38,.10)");
    expect(html).not.toContain("rgba(230,180,34,.08)");
    expect(html.indexOf("goleiro")).toBeGreaterThan(html.indexOf('role="alert"'));
  });

  it("com reserva de goleiro viva, a faixa diz a hora da volta", () => {
    // `retry_at` e a metade que o NOME da razao nao carrega, e a RPC a manda de
    // proposito: preenchido, ha reserva viva de outro goleiro que vence, e
    // esperar quinze minutos e barato perto de trocar de posicao. Sem ele na
    // uniao esta faixa mandaria trocar de posicao um goleiro que so precisava
    // esperar. A suite roda com TZ=UTC (ver vitest.config.ts).
    const html = faixaDaVaga({
      ok: false,
      reason: "goalkeepers_full",
      retryAt: "2026-08-19T12:00:00.000Z",
    });
    expect(html).toContain("12h00");
    expect(html).toContain("goleiro");
    expect(html).toMatch(/posi[çc][ãa]o/i);
  });

  it("as duas regioes live estao no DOM antes de haver reserva", () => {
    // Sem reserva a faixa nao tem texto, mas as regioes precisam estar la: o
    // leitor de tela tem de ja estar observando quando o texto entra, e no
    // caminho recusado esta faixa e o unico sinal — nao ha toast e o foco nao se
    // move.
    const html = faixaDaVaga(null);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
  });
});
