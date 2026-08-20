import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A fiacao do aviso do por do sol no wizard, lida como texto.
 *
 * `sunsetAlert` decide os tres estados e e testado de verdade em sabbath.test.ts.
 * O que este arquivo tranca e o outro lado: as ligacoes entre aquele calculo e a
 * tela, que existem em UM lugar cada e cujo desfazimento passa no `tsc`, no
 * eslint e na suite inteira.
 *
 * O criterio para um `it` pertencer aqui e o mesmo de rest-overlay-source.ts —
 * dano invisivel —, e aqui ele tem cifra:
 *
 *   `&& sunset !== "cutoff"` some       ->  o QR volta nos dez minutos finais. O
 *                                           jogador faz o PIX as 17h50, sobe o
 *                                           comprovante, e e recusado as 18h05.
 *                                           Dinheiro gasto e vaga travada ate
 *                                           sabado a noite — e a tela nunca
 *                                           pareceu quebrada.
 *   `startsAt={sunsetAt}` -> `{null}`   ->  a faixa nunca aparece. O pagamento
 *                                           continua fechando na hora certa,
 *                                           entao o bloco some sem ninguem ter
 *                                           sido avisado.
 *   `alert={sunset}` -> `alert="none"`  ->  idem, pelo outro fio.
 *   `router.refresh()` some             ->  quem estava com o formulario aberto
 *                                           na virada fica num wizard que aceita
 *                                           digitacao e sera recusado no envio.
 *   uma historia so no bloco escondido  ->  no corte, a tela afirma que a vaga
 *                                           nao esta confirmada. E falso, e manda
 *                                           o jogador cacar um problema que ele
 *                                           nao tem.
 *   `return null` no SunsetNotice       ->  a regiao `role="alert"` passa a nascer
 *                                           junto com o texto, e o unico aviso de
 *                                           que o pagamento vai fechar sai calado
 *                                           para quem depende do leitor de tela.
 *
 * Le como texto pelo mesmo motivo de wizard-steps.test.ts e
 * sabbath-page-wiring.test.ts: o projeto nao tem jsdom nem Testing Library
 * (vitest roda com environment "node"), e renderizar o wizard exigiria dublar
 * server actions, upload, PIX e o heartbeat da reserva para descobrir fatos que
 * estao escritos no proprio arquivo.
 */
const WIZARD = join(process.cwd(), "app/(public)/inscrever/[slug]/RegistrationWizard.tsx");
const FAIXA = join(process.cwd(), "app/(public)/inscrever/[slug]/steps/SunsetNotice.tsx");

/**
 * O arquivo sem comentarios, como em rest-overlay-source.test.ts.
 *
 * Nao e capricho: os comentarios destes dois arquivos CITAM as expressoes que os
 * testes procuram — o docblock do `slotAllowsPayment` escreve "cutoff" em prosa,
 * e o do SunsetNotice fala de `return null` para explicar por que nao ha um.
 * Sem isto, o preco de comentar bem seria um teste que passa medindo o
 * comentario em vez do codigo.
 *
 * O `(?<!:)` guarda o `https://` de virar comentario de linha.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

const wizard = semComentarios(readFileSync(WIZARD, "utf8"));
const faixa = semComentarios(readFileSync(FAIXA, "utf8"));

/** O valor de `prop={...}` na abertura de tag, como em sabbath-page-wiring. */
function prop(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`${nome}=\\{([^}]*)\\}`));
  return m ? m[1].trim() : null;
}

describe("a fiacao do aviso do por do sol", () => {
  // Sentinelas: um `indexOf` que devolve -1 ou um regex que casa zero linhas
  // passariam vazio, e falsa cobertura e pior que lacuna conhecida. Cada `it`
  // confere primeiro que ACHOU o que procura.

  it("o wizard le o por do sol que a pagina mandou, em vez de calcular o seu", () => {
    // Ate a T9 a prop existia e nao era desestruturada — `sunsetAt` chegava e
    // morria na assinatura. Sem esta linha o resto do arquivo nao compila, mas
    // ela e a origem dos dois fios abaixo e merece a sentinela.
    expect(wizard).toMatch(/championship, liveCount, sunsetAt,/);
    expect(wizard).toContain('from "@/features/registration/sabbath"');
  });

  it("o bloco de pagamento tem os DOIS gatilhos, e o do sol e o corte", () => {
    const achados = [...wizard.matchAll(/const slotAllowsPayment = ([^;]*);/g)];
    expect(achados).toHaveLength(1);

    const expressao = achados[0][1];
    // O gatilho do A4: sem vaga nao ha o que pagar.
    expect(expressao).toContain("slot.ok");
    // O gatilho desta feature. `===` no lugar do `!==` inverteria o mecanismo:
    // o QR ficaria disponivel SO nos dez minutos finais.
    expect(expressao).toContain('sunset !== "cutoff"');
    // E fecha no corte, nao no aviso: fechar em "notice" custaria trinta minutos
    // de pagamento por semana a quem ainda tem tempo de sobra para pagar.
    expect(expressao).not.toContain("notice");
  });

  it("a faixa recebe o alerta vivo e o horario real", () => {
    const tags = [...wizard.matchAll(/<SunsetNotice\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(1);

    // `alert="none"` (string literal) nao casa com `prop`, que so le `{...}`, e
    // por isso a comparacao com o valor exato pega as duas formas de matar a
    // faixa: o literal e o `{null}`.
    expect(prop(tags[0], "alert")).toBe("sunset");
    expect(prop(tags[0], "startsAt")).toBe("sunsetAt");
  });

  it("na virada quem decide e o servidor: recarrega antes de recalcular", () => {
    const comparacao = wizard.indexOf("Date.parse(sunsetAt)");
    const refresh = wizard.indexOf("router.refresh()");
    const recalculo = wizard.indexOf("setSunset(sunsetAlert(");

    expect(comparacao).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(-1);
    expect(recalculo).toBeGreaterThan(-1);

    // Unico no arquivo — se nascer um segundo, a ordem abaixo deixa de medir
    // este efeito e o teste passa a mentir.
    expect(wizard.split("router.refresh()")).toHaveLength(2);

    // A ordem E a regra: comparar, recarregar, e so entao recalcular. Com o
    // refresh depois do `setSunset` o wizard se trancaria sozinho no relogio do
    // aparelho, que e justamente o relogio em que nao se confia.
    expect(refresh).toBeGreaterThan(comparacao);
    expect(recalculo).toBeGreaterThan(refresh);
  });

  it("o bloco escondido conta as duas historias, e nao so a da vaga", () => {
    const ramo = wizard.indexOf("slotAllowsPayment ? (");
    expect(ramo).toBeGreaterThan(0);

    const escondido = wizard.slice(ramo);
    // A bifurcacao dentro do ramo `else`. Sem ela sobra uma frase so, e no corte
    // do por do sol ela afirma algo falso sobre a vaga do jogador.
    expect(escondido).toContain("slot && !slot.ok ?");
    // E a outra metade fala do sol, e nao repete a copia da vaga.
    expect(escondido).toContain("antes do pôr do sol");
  });

  it("a regiao que anuncia a faixa ja esta no DOM antes de haver texto", () => {
    // `alert` comeca em "none" em TODO carregamento, por causa da hidratacao: o
    // texto SEMPRE chega depois da montagem. Um `return null` aqui em cima faria
    // a regiao live nascer junto com o conteudo, todas as vezes.
    expect(faixa).toMatch(/return \(\s*<div role="alert">/);
    expect(faixa).not.toContain("return null");
  });
});
