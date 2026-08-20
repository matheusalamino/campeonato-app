import { describe, it, expect } from "vitest";
import { commitRefusal } from "./commit-refusal";

/**
 * As frases com que o envio e recusado.
 *
 * Elas eram uma escada de `if` dentro de `submitRegistration`, e la nenhuma
 * delas tinha teste possivel: `vitest.config.ts` inclui `lib/**`,
 * `features/**` e `scripts/**`, e o servico importa `server-only`, que nem esta
 * no `node_modules`. Duas edicoes de uma linha passavam nos tres portoes —
 * apagar o ramo do sabado, ou escrever `"sabath"` no literal — e nas duas quem
 * acabou de tocar em "Enviar", possivelmente com o PIX ja pago, recebia o
 * generico "as inscricoes nao estao abertas": a frase que NAO diz que nada foi
 * gravado, a unica informacao de que ele precisa naquele segundo.
 */
describe("commitRefusal", () => {
  it("no sabado, diz que nada foi gravado — e nao manda tentar de novo", () => {
    const { error, alreadyRegistered } = commitRefusal("sabbath");
    // As tres coisas que esta frase precisa fazer, e a que ela nao pode fazer.
    expect(error).toContain("repouso");
    expect(error).toContain("não foi gravada");
    expect(error).toContain("Recarregue");
    // A pausa vai ate o por do sol de sabado: convidar a insistir por 24h e pior
    // do que nao dizer nada.
    expect(error).not.toContain("Tente novamente");
    // E nao e a frase vaga que a tela de repouso existe para substituir.
    expect(error).not.toContain("não estão abertas");
    // Nao e desfecho de "voce ja esta inscrito": a inscricao dele nao existe.
    expect(alreadyRegistered).toBeUndefined();
  });

  it("quem ja esta inscrito vai para o desfecho, e nao para um toast", () => {
    // `alreadyRegistered` e o que troca a tela; sem ele o jogador leria um aviso
    // sobre um formulario que nao tem mais o que fazer.
    expect(commitRefusal("already_registered")).toEqual({
      error: "Você já está inscrito neste campeonato.",
      alreadyRegistered: true,
    });
  });

  it("reserva vencida com a lotacao cheia manda falar com a organizacao", () => {
    const { error } = commitRefusal("reservation_expired");
    expect(error).toContain("Sua vaga expirou");
    expect(error).toContain("organização");
  });

  it("as duas recusas de campeonato fechado dizem a mesma coisa", () => {
    expect(commitRefusal("not_open")).toEqual({
      error: "As inscrições não estão abertas para este campeonato.",
    });
    expect(commitRefusal("not_found")).toEqual(commitRefusal("not_open"));
  });

  it("razao que nao conhecemos cai no generico, e nao sai sem frase", () => {
    // Inclui os nomes que vem do prototipo, que e o que segura o `Object.hasOwn`
    // da tabela: com `in` no lugar dele a busca acha a chave, devolve
    // `undefined`, e a recusa chega a tela sem mensagem nenhuma.
    for (const reason of [
      "banana",
      undefined,
      null,
      42,
      "toString",
      "constructor",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "isPrototypeOf",
    ]) {
      expect(commitRefusal(reason)).toEqual({
        error: "As inscrições não estão abertas para este campeonato.",
      });
    }
  });
});
