import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";

/**
 * A fiacao do servico publico de inscricao, lida como texto.
 *
 * A T9 tirou de `services/public-registration.ts` as duas traducoes que decidem
 * o que o jogador le — `reservationFromRpc` e `commitRefusal` — e as pos em
 * `features/`, onde ha teste. As TABELAS ficaram cobertas; as duas linhas que as
 * CHAMAM ficaram exatamente onde estavam, e la nao ha assertiva nenhuma: o
 * `include` do `vitest.config.ts` nao alcanca `services/**` (o porque esta
 * escrito la). Sao a unica logica desta feature sem rede, e as tres edicoes que
 * cabem nelas passam nos tres portoes:
 *
 *   commitRefusal(result.reason)     ->  commitRefusal("not_open")
 *       Reintroduz o defeito LITERAL que a T9 existe para matar: quem toca em
 *       "Enviar" no sabado, possivelmente com o PIX ja pago, le "as inscricoes
 *       nao estao abertas" — a frase que nao diz a unica coisa que importa
 *       naquele segundo, que NADA foi gravado. `tsc` limpo, suite verde, lint
 *       inalterado.
 *
 *   apagar o `if (!result.success) return ...`
 *       Pior que o defeito original: quem envia durante a pausa recebe a TELA DE
 *       SUCESSO, com `registrationId: undefined`. Sai daqui achando que esta
 *       inscrito. O unico rastro e um aviso de import nao usado, dentro de 119
 *       problemas de lint pre-existentes e sem job de teste no CI — ou seja,
 *       rastro nenhum.
 *
 *   reservationFromRpc(error ? null : data)  ->  reservationFromRpc(null)
 *       Toda reserva vira `error`. A faixa passa a convidar a "tentar novamente
 *       em instantes" para sempre, e ninguem consegue reservar vaga.
 *
 * Le como texto pelo mesmo motivo de sabbath-page-wiring.test.ts e
 * sunset-notice-wiring.test.ts, e com o mesmo idioma: os nomes locais sao LIDOS
 * do arquivo em vez de escritos aqui — renomear `result` pelo atalho da IDE e
 * no-op e nao pode matar teste —, e os padroes toleram formatacao, porque
 * vermelho por causa de uma quebra de linha manda o proximo cacar um bug que
 * nao existe.
 *
 * O que estes testes NAO toleram, de proposito, e o efeito mudar de forma. E a
 * conta que se paga enquanto o servico nao tiver o Supabase dublado.
 */
const SERVICO = join(process.cwd(), "services/public-registration.ts");

const servico = semComentario(readFileSync(SERVICO, "utf8"));

/** Um unico casamento de `padrao`, com os grupos. Falha se nao houver exatamente um. */
function achado(fonte: string, padrao: RegExp): RegExpMatchArray {
  const achados = [...fonte.matchAll(new RegExp(padrao, `${padrao.flags.replace("g", "")}g`))];
  expect(achados).toHaveLength(1);
  return achados[0];
}

describe("a fiacao do servico publico de inscricao", () => {
  // Sentinelas: um regex que casa zero linhas passaria vazio, e falsa cobertura
  // e pior que lacuna conhecida. `achado` falha quando nao encontra, e o `it`
  // abaixo confere primeiro que o arquivo ainda e o que este teste pensa que e.

  it("le o servico, e ele ainda chama as duas RPCs", () => {
    expect(servico.length).toBeGreaterThan(0);
    expect(servico).toContain('supabase.rpc("reserve_registration_slot"');
    expect(servico).toContain('supabase.rpc("commit_registration"');
  });

  it("a reserva devolve a traducao da RESPOSTA, e nao um veredito escrito aqui", () => {
    // Os dois nomes saem do proprio destructuring da chamada.
    const [, dados, erro] = achado(
      servico,
      /const \{\s*(\w+),\s*(\w+),?\s*\}\s*=\s*await supabase\.rpc\(\s*"reserve_registration_slot"/,
    );

    // `error ? null : data` inteiro, e nao so o nome da funcao. Os dois lados do
    // ternario significam a mesma coisa — nao houve resposta —, e essa e a unica
    // decisao que sobrou aqui. Trocado por `null`, toda reserva vira `error` e o
    // jogador le "tente novamente em instantes" para sempre; trocado por `data`,
    // um erro do PostgREST passa a ser lido como corpo de resposta.
    expect(servico).toMatch(
      new RegExp(`return reservationFromRpc\\(\\s*${erro}\\s*\\?\\s*null\\s*:\\s*${dados},?\\s*\\)`),
    );
  });

  it("o envio recusado passa pela tabela, com a razao QUE A RPC DEU", () => {
    const [, resultado] = achado(servico, /const (\w+) = committed as \{/);

    // A guarda inteira, numa expressao so: o `if`, o `return`, e a razao vinda
    // do resultado. Assim as DUAS edicoes morrem juntas — trocar
    // `${resultado}.reason` por um literal (o sabado volta a ser "as inscricoes
    // nao estao abertas") e apagar a linha (o sabado vira tela de sucesso, com
    // `registrationId` indefinido).
    expect(servico).toMatch(
      new RegExp(
        `if\\s*\\(\\s*!${resultado}\\.success\\s*\\)\\s*return\\s*\\{\\s*ok:\\s*false,\\s*` +
          `\\.\\.\\.commitRefusal\\(\\s*${resultado}\\.reason,?\\s*\\)\\s*,?\\s*\\}`,
      ),
    );
  });
});
