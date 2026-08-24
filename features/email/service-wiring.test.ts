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
 * As seis colunas mais os dois embeds, POR EXTENSO.
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
  it("o servico pede exatamente as seis colunas declaradas", () => {
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

  it("o dreno usa o render de verdade, e o stub nao voltou", () => {
    // `render: options.render ?? renderEmail`. Trocar o padrao de volta por um
    // que devolvesse null faria a fila crescer sem nenhum e-mail sair, e nenhum
    // teste do vitest veria: o dreno recebe o render por argumento em todos eles.
    expect(servico).toMatch(/render:\s*options\.render\s*\?\?\s*renderEmail/);
    expect(servico).not.toContain("stubRenderer");
  });
});
