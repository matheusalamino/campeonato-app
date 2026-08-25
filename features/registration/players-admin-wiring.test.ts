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

/**
 * SO a string de `select()`, e nao a pagina inteira.
 *
 * ── POR QUE ESTE RECORTE EXISTE, MEDIDO ──
 *
 * A primeira versao desta suite asseverava `expect(pagina).toMatch(/payment_verified/)`
 * sobre o arquivo TODO. MUTACAO que a atravessou: tirar `payment_verified` de
 * dentro do `select()` deixava a assertiva VERDE, porque o nome continua
 * escrito em outros TRES lugares do mesmo arquivo -- os dois `type` e o
 * `payment_verified: item.payment_verified` do `map`.
 *
 * Ou seja: a assertiva media a presenca da PALAVRA no arquivo, e o defeito
 * mora na presenca da COLUNA no PEDIDO. Sao coisas diferentes, e so o recorte
 * separa as duas.
 */
const selectDaPagina = pagina.match(/\.select\(\s*`([\s\S]*?)`/)?.[1] ?? "";

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
    //
    // O controle vem primeiro: sem ele, um `select()` que deixasse de ser
    // template literal faria o recorte devolver "" e a assertiva de baixo
    // ficaria vermelha com a mensagem errada.
    expect(selectDaPagina, "nao achei a string de select() em page.tsx").not.toBe("");
    expect(selectDaPagina).toMatch(/\bpayment_verified\b/);
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
    // pelo `session_preload_libraries` do papel `authenticator`, entao vale sim
    // no caminho do PostgREST -- sem `.eq` nenhum ele recusa com
    // `21000 UPDATE requires a WHERE clause`. So que o defeito alcancavel aqui
    // nao e o WHERE AUSENTE: e o WHERE ERRADO, e contra esse ele nao faz nada.
    //
    // ── A VARIAVEL, E NAO SO A COLUNA ──
    //
    // MEDIDO: a versao anterior parava em `.eq("id",` e deixava passar
    // `.eq("id", championshipId)` -- variavel errada, coluna certa. Aquilo
    // atravessava os CINCO portoes (`tsc` 0 linhas, 919 testes verdes), e o
    // efeito e pior que carimbar demais: o PATCH casa ZERO linha, o PostgREST
    // nao devolve erro, e o admin ve `toast.success` sem que nada tenha sido
    // marcado. Falha silenciosa com aviso de sucesso.
    //
    // Por isso o padrao prende o NOME que a funcao recebe. Renomear o
    // parametro obriga a vir aqui -- que e o preco certo a pagar.
    expect(secao).toMatch(
      /\.update\(\s*markPaymentVerifiedPatch\(\)\s*\)\s*\.eq\(\s*"id"\s*,\s*registrationId\s*\)/,
    );
  });

  it("NAO remonta o resultado de paymentCheckView", () => {
    // ── O DECOY QUE DERROTAVA ESTA SUITE INTEIRA ──
    //
    // Encontrado na revisao da T7. Este trecho satisfaz TODA positiva e TODA
    // negativa desta suite, typecheca, e devolve a decisao de mao unica para
    // dentro do `.tsx`:
    //
    //     const pagamento = {
    //       ...paymentCheckView({ paymentVerified: reg.payment_verified }),
    //       canMark: true,
    //     };
    //
    // `paymentCheckView(` continua escrito, nenhum literal proibido aparece, e
    // mesmo assim o botao passa a ser oferecido para quem JA foi conferido --
    // exatamente o desfazer-que-nao-desfaz que features/registration/payment-check.ts
    // existe para nao oferecer.
    //
    // As duas negativas abaixo o matam: a primeira proibe espalhar o resultado,
    // a segunda proibe reescrever qualquer um dos tres campos como chave de
    // objeto. O codigo legitimo so LE (`pagamento.canMark`, `pagamento.label`),
    // e nenhuma das tres palavras aparece como chave hoje -- conferido.
    //
    // ⚠️ Continua sendo DENYLIST, com o teto que toda denylist tem: um decoy
    // que construa o objeto campo a campo, sem espalhar e com outros nomes,
    // ainda passa. Ver a nota "O QUE FICA FORA DE ALCANCE" no fim do arquivo.
    expect(secao).not.toMatch(/\.\.\.\s*paymentCheckView/);
    expect(secao).not.toMatch(/\bcanMark\s*:/);
    expect(secao).not.toMatch(/\bverified\s*:/);
    expect(secao).not.toMatch(/\blabel\s*:/);
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

  /**
   * ── O QUE FICA FORA DE ALCANCE, E A DECISAO DE PARAR AQUI ──
   *
   * DECIDIDO na revisao da T7, e escrito aqui porque este e o arquivo que a
   * proxima pessoa abre quando quiser mexer nesta tela.
   *
   * A revisao plantou SEIS mutacoes dentro de `PlayersSection.tsx` e todas
   * atravessaram os cinco portoes. UMA delas -- `.eq("id", championshipId)`,
   * variavel errada -- esta MORTA, pela assertiva `o UPDATE fica numa inscricao
   * SO` acima; era a mais cara e custava uma linha de regex. O decoy do spread
   * tambem esta morto, logo acima.
   *
   * As outras seguem vivas, e a decisao e NAO persegui-las com mais assertiva
   * de texto:
   *
   *   - o check parando de ler a coluna (`paymentVerified: true` fixo);
   *   - os ramos do `canMark` invertidos no JSX;
   *   - o modal perdendo o paragrafo de irreversibilidade;
   *   - o botao deixando de ser so do admin.
   *
   * ── POR QUE PARAR ──
   *
   * Porque as quatro sao sobre o JSX -- qual ramo renderiza, qual elemento
   * existe --, e assertiva de TEXTO nao alcanca isso: ela leria a marcacao como
   * string, e qualquer reescrita legitima do JSX a quebraria. Falso vermelho
   * contra codigo certo e o modo de falha que mata uma rede, porque a proxima
   * pessoa a desliga (ver o docblock de features/testing/sem-comentario.ts, que
   * ja pagou esse preco duas vezes).
   *
   * O que essas quatro pedem e RENDERIZAR o componente e asseverar sobre a
   * arvore -- e isso nao existe neste repo: `app/**` esta fora do `include` do
   * `vitest.config.ts`, nenhum glob alcanca `.test.tsx`, nao ha
   * `@testing-library/react` nas dependencias, e nao ha job de teste no CI
   * (`.github/workflows` so tem `migrate.yml`).
   *
   * Ou seja: o buraco e ESTRUTURAL e vale um bloco proprio -- ligar `.test.tsx`
   * e um renderizador --, nao mais quatro regex nesta suite. Ver a memoria
   * "Portao cego: .test.tsx e o CI", que ja registra o conserto de uma linha no
   * `include`.
   *
   * ── ONDE ESTA A LINHA, PARA QUEM CHEGAR DEPOIS ──
   *
   * Vale assertiva de texto aqui quando ela prende uma COSTURA -- um nome, um
   * argumento, uma chamada, um literal que nao pode voltar. Nao vale quando
   * prende FORMA de marcacao. Se a sua assertiva quebraria ao reindentar o JSX,
   * ela nao pertence a este arquivo.
   */
  it("continua mutando pelo cliente do navegador, como removePlayer", () => {
    // A escolha de desenho: o check segue o padrao vizinho em vez de inventar
    // uma server action so para ele. Se um dia mudar, que mude para os dois --
    // dois padroes de mutacao na mesma tela e a proxima pessoa escolhendo o
    // errado.
    expect(secao).toMatch(/createClient\(\)/);
    expect(secao).toMatch(/from\s+"@\/lib\/supabase\/client"/);
  });
});
