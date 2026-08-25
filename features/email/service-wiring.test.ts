import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";

/**
 * O `select` do dreno, lido como TEXTO nos dois lugares onde ele existe.
 *
 * ── O DEFEITO QUE ESTE ARQUIVO PEGA, E QUE NADA MAIS PEGA ──
 *
 * `services/email-outbox.ts` monta o resumo da inscricao com uma string de
 * `select` do cliente do Supabase. Essa string NAO passa por typecheck: tirar
 * `is_waitlist` dela deixa `npx tsc --noEmit` em zero (o `as unknown as
 * LinhaResumo` a impoe sem conferir), deixa a suite do dreno verde (ela usa
 * store falso), e faz TODO comprovante de lista de espera sair dizendo "sua
 * inscricao esta confirmada". E `services/**` nem sequer e coletado pelo
 * `vitest.config.ts` -- um `services/*.test.ts` afirmando `expect(1).toBe(2)`
 * deixa a suite verde. E a mesma armadilha da allowlist do `toRow` no admin.
 *
 * A prova contra o BANCO vive em `scripts/test-email-outbox.sh` ("as seis
 * colunas do resumo voltam preenchidas pelo PostgREST"): ela faz a leitura pelo
 * caminho de verdade -- PostgREST, chave do service_role, o mesmo embed
 * aninhado -- e confere que as seis voltam. MEDIDO: tirando `is_waitlist` de la,
 * aquele cenario fica VERMELHO (`sim|nao|sim|sim|sim|sim`).
 *
 * ── MAS AQUELA PROVA TINHA UM BURACO, E E ELE QUE ESTE ARQUIVO FECHA ──
 *
 * O `select` do script e uma COPIA do `select` do servico, e nada ligava as
 * duas. Quem acrescentasse uma coluna ao servico sem acrescenta-la ao script
 * teria a coluna nova SEM prova nenhuma -- e o script continuaria verde,
 * provando as seis velhas com ar de que provava tudo. Copia que ninguem
 * confere e a forma mais barata de uma rede encolher em silencio.
 *
 * Entao a assertiva de baixo compara as duas strings. Espaco nao conta: o
 * servico escreve `id, is_waitlist, ...` (formatado pelo prettier) e o script
 * escreve `id,is_waitlist,...` (e query string de URL, onde espaco seria
 * escapado). O que conta e a LISTA.
 */
const SERVICO = join(process.cwd(), "services/email-outbox.ts");
const SCRIPT = join(process.cwd(), "scripts/test-email-outbox.sh");

const servico = semComentario(readFileSync(SERVICO, "utf8"));
const script = readFileSync(SCRIPT, "utf8");

/**
 * As SETE colunas que o `select` pede, POR EXTENSO: `id` -- a chave por onde
 * `summariesById` indexa, e que nao e campo do resumo -- mais as seis que viram
 * `RegistrationSummary`, duas delas dentro de embeds.
 *
 * Declarado aqui, e nao derivado de nenhum dos dois arquivos, de proposito: uma
 * lista derivada concordaria com qualquer mudanca e nao provaria nada. Assim,
 * coluna nova exige tres edicoes conscientes -- servico, script e esta linha --
 * e a do meio e justamente a que da prova contra o banco.
 */
const SELECT_ESPERADO =
  "id,is_waitlist,contact_email,championships(name),players(email,name,preferred_position)";

/** Sem espaco: o servico e formatado pelo prettier, o script e query string. */
function semEspaco(s: string): string {
  return s.replace(/\s+/g, "");
}

/** O corpo de `loadSummaries`, e so ele: o arquivo tem outros `.select(` (o da
 *  contagem da cota), e casar o primeiro que aparecesse seria assertiva olhando
 *  para a consulta errada. */
function blocoLoadSummaries(): string {
  const inicio = servico.indexOf("async loadSummaries(");
  const fim = servico.indexOf("async markSent(");
  expect(
    inicio,
    "Nao achei `async loadSummaries(` em services/email-outbox.ts. O metodo foi " +
      "renomeado ou removido, e esta assertiva ficou olhando para o vazio -- que " +
      "e como uma rede morre em silencio. Conserte o marcador.",
  ).toBeGreaterThan(-1);
  expect(
    fim,
    "Nao achei `async markSent(` em services/email-outbox.ts, que e o marcador " +
      "de FIM do bloco. Sem ele a fatia iria ate o fim do arquivo e passaria a " +
      "enxergar outros `.select(`.",
  ).toBeGreaterThan(inicio);
  return servico.slice(inicio, fim);
}

describe("o select do resumo, nos dois lugares onde ele existe", () => {
  it("o servico pede exatamente as sete colunas declaradas", () => {
    const bloco = blocoLoadSummaries();
    const achado = /\.select\(\s*"([^"]+)"/.exec(bloco);

    expect(
      achado,
      "Nao achei uma string literal de `.select(` dentro de `loadSummaries`. Se a " +
        "consulta passou a montar o select por variavel ou por template, esta " +
        "assertiva parou de ver o que prometia ver.",
    ).not.toBeNull();

    expect(semEspaco(achado?.[1] ?? "")).toBe(SELECT_ESPERADO);
  });

  it("o script de banco le a MESMA lista, e nao uma copia que ficou para tras", () => {
    // A assertiva que fecha o buraco: sem ela, uma coluna acrescentada so no
    // servico ficaria sem prova contra o banco, e o script seguiria verde
    // provando as seis velhas.
    const achado = /SELECT_DRENO="([^"]+)"/.exec(script);

    expect(
      achado,
      "Nao achei `SELECT_DRENO=\"...\"` em scripts/test-email-outbox.sh. E de la " +
        "que sai a unica leitura destas colunas contra o banco DE VERDADE " +
        "(PostgREST, service_role). Sem ela, nenhum portao deste repo percebe " +
        "uma coluna faltando no select do servico.",
    ).not.toBeNull();

    expect(semEspaco(achado?.[1] ?? "")).toBe(SELECT_ESPERADO);
  });

  /**
   * ── SOBRE O TETO DE UMA ASSERTIVA TEXTUAL, E COMO ELE FOI CONTORNADO ──
   *
   * Assertiva POSITIVA de texto ("o token `summariesById` aparece") tem um teto
   * conhecido: ela prova que o nome esta escrito, nao que a funcao certa roda.
   * Uma funcao local homonima que nao traduz nada a deixa verde -- medido na
   * revisao desta task.
   *
   * As assertivas abaixo sao por isso NEGATIVAS onde importa: elas exigem que
   * os literais de coluna NAO estejam neste arquivo. Um decoy nao satisfaz uma
   * negativa -- so satisfaz quem de fato nao escreveu as colunas aqui. E como
   * as traducoes agora tem teste de COMPORTAMENTO em features/ (summary-row e
   * outbox-columns), a positiva vira o que ela consegue ser de util: um aviso
   * de que a delegacao existe, e nao a prova de que ela esta certa.
   */
  it("as traducoes do store sao delegadas, e nao refeitas aqui", () => {
    // Seis das oito juntas NUAS da varredura estavam em seis dos OITO metodos
    // que `OutboxStore` declarava ENTAO -- os seis que carregam traducao. Hoje
    // sao nove, e o nono (`issueVerificationToken`) tambem delega: a lista
    // abaixo cobre as TRES delegacoes dele -- o sorteio, a regra e as colunas. `services/**` nao e coletado pelo
    // vitest, entao traducao escrita la nasce sem portao.
    //
    // O que NAO se conclui dai: que o `include` seja a causa. A T5b mediu
    // `lib/email/brevo.ts` -- dentro do include, com teste proprio -- e achou
    // duas juntas nuas la. O que separa preso de nu e haver assertiva sobre a
    // junta.
    for (const chamada of [
      /outboxRowsFrom\(/,
      /summariesById\(/,
      /sentColumns\(/,
      /requeueColumns\(/,
      /deferColumns\(/,
      /failedPermanentColumns\(/,
      // As tres do nono metodo. `createVerificationToken` e a que mais custa se
      // voltar para o servico: reinlinada com `randomBytes(4)`, ela nao tem
      // portao nenhum la, e o token cai de 256 para 32 bits sem nada acender.
      /createVerificationToken\(/,
      /canIssueVerificationToken\(/,
      /verificationTokenColumns\(/,
      // As duas da T8. `enqueueWaitlistPromotedEmail` nao e metodo do store --
      // e a SEGUNDA funcao exportada do servico que recebe o cliente por
      // argumento --, mas corre o mesmo risco: a linha da fila montada a mao
      // aqui nasceria sem portao nenhum.
      /waitlistPromotedRow\(/,
      /OUTBOX_DEDUPE_TARGET/,
    ]) {
      expect(servico, `a delegacao ${chamada} sumiu de services/email-outbox.ts`).toMatch(chamada);
    }
  });

  it("nenhum literal de coluna sobrou no servico", () => {
    // ── O QUE ESTA LISTA E, E O QUE ELA NAO E (decisao da T5b) ──
    //
    // Ela e guarda de ARQUITETURA: prova que a traducao coluna->campo continua
    // morando em `features/**`, onde ha teste de comportamento, e nao voltou
    // para o servico. Reinlinar `sentColumns` acende aqui mesmo que o objeto
    // reinlinado esteja CERTO -- e e esse o defeito que ela existe para pegar,
    // porque uma traducao correta hoje num arquivo sem rede e uma traducao
    // errada amanha sem ninguem ver.
    //
    // Ela NAO e guarda de CORRETUDE, e por uma rodada inteira foi lida como se
    // fosse. MEDIDO: uma SEGUNDA gravacao a mao dentro de `defer` --
    // `atualizar(supabase, id, { attempts: 0, sent_at: null })` -- passava os
    // portoes de entao e violava justamente o invariante que `deferColumns`
    // existe para proteger (adiar nao gasta degrau da escada). Passava porque
    // `attempts:` e `sent_at:` nao estao na lista. Denylist so pega o que esta
    // na lista, e o que nao esta e infinito.
    //
    // ── E POR ISSO OS DOIS NAO ENTRARAM NA LISTA ──
    //
    // Acrescentar `attempts:` e `sent_at:` aqui consertaria o caso e deixaria a
    // FAMILIA aberta, com esta assertiva parecendo mais forte do que e -- o
    // convite para a proxima rodada patchear a lista de novo. Quem fecha a
    // familia e `services/email-outbox.contract.ts`, que afirma o estado da
    // LINHA depois de cada chamada: um invariante sobre a linha nao tem lista
    // de onde escapar. Aquele contrato fica vermelho com o decoy; esta lista
    // nao ficaria, e nao e trabalho dela ficar.
    //
    // As duas convivem porque cobrem coisas diferentes e custam coisas
    // diferentes: esta roda na suite principal, em qualquer maquina, de graca;
    // o contrato precisa do stack local de pe e roda a mao.
    //
    // A string do `select` fica de fora da lista de proposito -- ela e leitura,
    // e tem as duas redes das assertivas de cima.
    const proibidos = [
      'status: "sent"',
      'status: "pending"',
      'status: "failed_permanent"',
      "provider_message_id:",
      "next_attempt_at:",
      "claimed_at:",
      "last_error:",
      "contactEmail:",
      "playerEmail:",
      "playerName:",
      "championshipName:",
      "isWaitlist:",
      "preferredPosition:",
      "dedupeKey:",
      // As duas colunas da verificacao. `email_verified_at:` e a mais cara: um
      // objeto de gravacao que a carregasse marcaria como PROVADO todo endereco
      // que recebesse um comprovante -- sem clique nenhum, e sem nada acender.
      // Quem grava aquele carimbo e a funcao do banco, na volta do clique.
      // (Ela aparece SEM dois-pontos na string do `select` desta leitura, que e
      // leitura e nao gravacao -- por isso o literal proibido tem o `:`.)
      "email_verification_token_hash:",
      "email_verified_at:",
      // ── AS TRES COLUNAS DA ESCRITA NA FILA (T8) ──
      //
      // Elas entram na lista, ao contrario de `attempts:` e `sent_at:` da nota
      // acima, porque aqui a pergunta e mesmo de ARQUITETURA e nao de
      // corretude: a T8 acrescentou a PRIMEIRA escrita em `email_outbox` feita
      // por este arquivo, e a linha dela e montada por `waitlistPromotedRow`
      // (features/email/promotion.ts). Reinlinar o objeto aqui acende, mesmo
      // que o objeto esteja certo.
      //
      // `dedupe_key:` e a mais cara das tres: escrita a mao com o valor errado
      // -- o id do campeonato, por exemplo -- ela colidiria com a linha de
      // outra pessoa e o `DO NOTHING` engoliria o INSERT sem erro nenhum.
      "kind:",
      "dedupe_key:",
      "payload:",
    ];

    for (const literal of proibidos) {
      expect(
        servico,
        `services/email-outbox.ts voltou a escrever \`${literal}\` a mao. As ` +
          "traducoes moram em features/email/summary-row.ts e " +
          "features/email/outbox-columns.ts, onde ha teste de comportamento: " +
          "`services/**` nao e coletado pelo vitest, e seis das oito juntas " +
          "nuas da varredura estavam em seis dos OITO metodos que este store " +
          "declarava entao.",
      ).not.toContain(literal);
    }
  });

  it("o dreno usa o render de verdade, e o stub nao voltou", () => {
    // `render: options.render ?? renderEmail`. Trocar o padrao de volta por um
    // que devolvesse null faria a fila crescer sem nenhum e-mail sair, e nenhum
    // teste do vitest veria: o dreno recebe o render por argumento em todos eles.
    expect(servico).toMatch(/render:\s*options\.render\s*\?\?\s*renderEmail/);
    expect(servico).not.toContain("stubRenderer");
  });
});
