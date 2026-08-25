import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";
import {
  PAYMENT_CHECK_CONFIRM,
  PAYMENT_CHECK_LABEL_PENDING,
  PAYMENT_CHECK_LABEL_VERIFIED,
} from "./payment-check";

/**
 * A tela do admin de jogadores, lida como TEXTO -- porque nao ha outro jeito.
 *
 * ── O BURACO QUE ESTE ARQUIVO FECHA, MEDIDO ──
 *
 * `app/**` nao esta no `include` de `vitest.config.ts` (que so alcanca `lib/**`,
 * `features/**` e `scripts/**`), nenhum glob deste repo alcanca `.test.tsx`, e
 * nao ha job de teste no CI -- `.github/workflows` so tem `migrate.yml`. A
 * pasta `app/(protected)/championship/players/` e territorio de ZERO
 * discriminacao: mutacao plantada la fica verde nos cinco portoes.
 *
 * A T6 pagou por isso com tres mutacoes reais atravessando os portoes inteiros.
 * A resposta foi a mesma daquela vez: a REGRA mudou de casa para
 * `features/registration/payment-check.ts`, onde ha teste de COMPORTAMENTO, e
 * este arquivo cuida do que sobrou -- que a delegacao continue existindo, e que
 * o que saiu de la nao volte por copia.
 *
 * ── AS NEGATIVAS CARREGAM O PESO ──
 *
 * Uma positiva ("`paymentCheckView` aparece") e satisfeita por um decoy
 * homonimo local. Uma negativa ("o rotulo `Pagamento conferido` NAO esta
 * escrito neste arquivo") so e satisfeita por quem de fato nao escreveu a regra
 * aqui -- e e ela que impede o proximo conserto de ser feito no `.tsx`, fora do
 * alcance de todo portao.
 *
 * ── O QUE ESTE ARQUIVO NAO CONSEGUE PROVAR ──
 *
 * Que o UPDATE de fato grava, que a RLS de fato recusa quem nao e admin, e que
 * o gatilho de fato enfileira. Assertiva de texto tem teto: ela prende que um
 * nome esta escrito, nunca que a funcao certa roda. Essa metade e de
 * `scripts/test-email-outbox.sh`, que fala com o Postgres e com o PostgREST.
 */

const RAIZ = join(process.cwd(), "app", "(protected)", "championship", "players");

const secao = semComentario(readFileSync(join(RAIZ, "PlayersSection.tsx"), "utf8"));
const pagina = semComentario(readFileSync(join(RAIZ, "page.tsx"), "utf8"));

describe("app/(protected)/championship/players/page.tsx", () => {
  it("pede payment_verified no select", () => {
    // ── A ARMADILHA DA ALLOWLIST, DO LADO DA LEITURA ──
    //
    // A string de `select()` do PostgREST nao passa por typecheck nenhum. Tirar
    // `payment_verified` dali nao quebra `tsc`, nao quebra a suite, e nao
    // levanta erro em tempo de execucao: o campo chega `undefined`, e
    // `paymentCheckView` -- corretamente, para o lado seguro -- le isso como
    // NAO conferido. Resultado: toda inscricao aparece por conferir, para
    // sempre, e o admin nunca ve quem ja foi.
    //
    // E a mesma armadilha do `toRow` do admin de campeonatos, e do `select` do
    // dreno em services/email-outbox.ts. Esta e a rede dela aqui.
    expect(pagina).toMatch(/payment_verified/);
  });

  it("leva o campo adiante ate o componente", () => {
    // Pedir a coluna e uma coisa; repassa-la ao filho e outra. O `map` que
    // monta `ChampionshipPlayer` tem lista explicita de campos -- esquecer o
    // repasse ali tem exatamente o mesmo sintoma de esquecer o `select`.
    expect(pagina).toMatch(/payment_verified:\s*item\.payment_verified/);
  });
});

describe("app/(protected)/championship/players/PlayersSection.tsx", () => {
  it("delega o estado e o rotulo do controle a features/", () => {
    expect(secao).toMatch(/paymentCheckView\(/);
    expect(secao).toMatch(/PAYMENT_CHECK_CONFIRM/);
    expect(secao).toMatch(/markPaymentVerifiedPatch\(\)/);
    expect(secao).toMatch(
      /from\s+"@\/features\/registration\/payment-check"/,
    );
  });

  it("NAO escreve os rotulos nem o aviso a mao", () => {
    // ── A NEGATIVA QUE MANTEM A REGRA FORA DE app/** ──
    //
    // Enquanto estes literais nao estiverem aqui, mudar o que a tela diz exige
    // mexer em `payment-check.ts` -- onde ha teste. Assim que um deles for
    // colado aqui, a decisao volta a morar num arquivo que portao nenhum le, e
    // esta assertiva acende.
    for (const literal of [
      PAYMENT_CHECK_LABEL_VERIFIED,
      PAYMENT_CHECK_LABEL_PENDING,
      PAYMENT_CHECK_CONFIRM.title,
      PAYMENT_CHECK_CONFIRM.body,
      PAYMENT_CHECK_CONFIRM.confirmLabel,
    ]) {
      expect(secao, `o literal "${literal}" voltou para o .tsx`).not.toContain(literal);
    }
  });

  it("NAO monta o objeto do update a mao", () => {
    // O nome da coluna sai de `markPaymentVerifiedPatch()`. Escrito aqui, um
    // typo (`payment_verifed`) grava em lugar nenhum e nao levanta erro: o
    // cliente do Supabase aceita a string, e `tsc` nao conhece o schema.
    expect(secao).not.toMatch(/payment_verified\s*:\s*true/);
  });

  it("o UPDATE fica numa inscricao SO", () => {
    // ── A ASSERTIVA MAIS CARA DESTE ARQUIVO ──
    //
    // A RLS (`creg admin write`, is_admin() em USING e WITH CHECK) autoriza o
    // admin sobre TODAS as inscricoes -- e essa e a resposta certa dela. Quem
    // limita o UPDATE a UMA linha e o `.eq("id", ...)`, e so ele.
    //
    // Sem o `.eq`, o clique carimba `payment_verified = true` no campeonato
    // inteiro, o gatilho enfileira uma linha por inscricao, e o dreno manda o
    // aviso para todo mundo -- de uma vez, sem desfazer, porque a `dedupe_key`
    // ja estara gasta em todas. Nenhum outro portao deste repo ve isso.
    //
    // E `pg_safeupdate` NAO e rede aqui: medido em 2026-08-25, ele e carregado
    // pelo `session_preload_libraries` do papel `authenticator`. Ele valeria
    // neste caminho, mas o UPDATE nao esta sem WHERE -- esta com o WHERE
    // errado, que e outra coisa.
    expect(secao).toMatch(
      /\.update\(\s*markPaymentVerifiedPatch\(\)\s*\)\s*\.eq\(\s*"id"\s*,/,
    );
  });

  it("muta a tabela das inscricoes, e nao outra", () => {
    expect(secao).toMatch(
      /from\(\s*"championship_registrations"\s*\)[\s\S]{0,200}?markPaymentVerifiedPatch/,
    );
  });

  it("NAO oferece caminho de desmarcar", () => {
    // ── POR QUE A AUSENCIA DO DESMARCAR E REGRA, E NAO ESQUECIMENTO ──
    //
    // A `dedupe_key` do gatilho e o id da inscricao, e o par (kind, dedupe_key)
    // e UNIQUE na fila. Desmarcar e marcar de novo NAO manda um segundo e-mail:
    // a linha antiga continua la e o `ON CONFLICT DO NOTHING` a preserva. Um
    // botao de desmarcar seria um desfazer que nao desfaz.
    //
    // Quem acrescentar um: leia o docblock de payment-check.ts antes, e conte
    // aqui o que decidiu.
    expect(secao).not.toMatch(/payment_verified\s*:\s*false/);
    expect(secao).not.toMatch(/markPaymentUnverified|unmarkPayment|desmarcar/i);
  });

  it("continua mutando pelo cliente do navegador, como removePlayer", () => {
    // A escolha de desenho: o check segue o padrao vizinho em vez de inventar
    // uma server action so para ele. Se um dia mudar, que mude para os dois --
    // dois padroes de mutacao na mesma tela e a proxima pessoa escolhendo o
    // errado.
    expect(secao).toMatch(/createClient\(\)/);
    expect(secao).toMatch(/from\s+"@\/lib\/supabase\/client"/);
  });
});
