import type { EmailKind } from "./kinds";

/**
 * A LINHA da fila para o aviso de promocao da lista de espera -- e so a linha.
 *
 * ⚠️ NADA AQUI PROMOVE NINGUEM. Este arquivo monta um registro de e-mail a
 * enviar; quem muda `is_waitlist` e o bloco A6b, que ainda nao existe. Ver o
 * docblock de `enqueueWaitlistPromotedEmail` em services/email-outbox.ts.
 *
 * ── POR QUE EM features/, E NAO NO SERVICO ──
 *
 * Porque `services/**` nao esta no `include` do `vitest.config.ts` -- teste
 * escrito la nao roda, e mutacao plantada la fica verde. Tres tasks deste bloco
 * ja mudaram regra de casa pelo mesmo motivo: a T5b tirou as traducoes
 * coluna->campo, a T6 tirou a criptografia do token, e a T7 tirou a regra do
 * check de pagamento. O servico so ENTREGA o que esta funcao devolve.
 *
 * ── AS DUAS CONSEQUENCIAS DA `dedupe_key`, ESCRITAS E NAO DESCOBERTAS ──
 *
 * A chave e o id da inscricao, e o indice unico e sobre o PAR (kind,
 * dedupe_key) -- `email_outbox_kind_dedupe`, migration 20260823010000.
 *
 *  1. **Nao colide com o comprovante.** `registration_committed` usa a MESMA
 *     `dedupe_key` (o id da inscricao), e `payment_verified` tambem. Os tres
 *     convivem porque o `kind` faz parte da chave. Isso NAO e suposicao: ha
 *     cenario no quinto portao que enfileira o aviso para uma inscricao e
 *     confere que a linha entrou, e a assertiva de `OUTBOX_DEDUPE_TARGET`
 *     abaixo prende o alvo do `ON CONFLICT` nas DUAS colunas.
 *
 *  2. **Promover a mesma inscricao duas vezes manda UM aviso so.** Se algum dia
 *     alguem for promovido, voltar para a espera e ser promovido de novo, o
 *     segundo aviso NAO SAI -- a linha antiga ainda esta la e o `DO NOTHING` a
 *     preserva. Hoje isso e inalcancavel: nao ha desistencia neste repo
 *     (conferido em `information_schema.columns`: das 20 colunas de
 *     `championship_registrations`, nenhuma registra saida -- nao ha
 *     `deleted_at`, `status` nem `withdrawn_at`), e nada chama esta funcao. Esta
 *     escrito JUSTAMENTE porque e inalcancavel: quem construir o A6b decide se
 *     aceita esse preco, e nao vai descobri-lo pela reclamacao de alguem que
 *     nao recebeu o segundo aviso.
 */

/** A linha como a tabela a recebe: nomes de COLUNA, cru. Mesmo contrato do
 *  gatilho irmao (migration 20260825020000) -- `payload` leva IDENTIFICADOR, e
 *  nunca texto pronto, para o corpo ser montado na hora do envio com o dado ja
 *  corrigido. */
export type OutboxInsert = {
  kind: EmailKind;
  dedupe_key: string;
  payload: Record<string, unknown>;
};

/**
 * O ALVO do `ON CONFLICT`, e as duas colunas sao load-bearing.
 *
 * Escrito aqui, e nao no servico, porque a versao errada dele e silenciosa e
 * catastrofica -- mas NAO silenciosa, e a diferenca foi medida. O alvo do `ON
 * CONFLICT` precisa casar um indice unico existente, e nao ha indice em
 * `dedupe_key` sozinho: o unico e `email_outbox_kind_dedupe (kind,
 * dedupe_key)`. MEDIDO na T8, com o alvo trocado para `dedupe_key`, o Postgres
 * recusa o INSERT com `42P10` -- "there is no unique or exclusion constraint
 * matching the ON CONFLICT specification" --, esta funcao estoura e o quinto
 * portao fica VERMELHO.
 *
 * Ou seja: a colisao com o COMPROVANTE (que usa a mesma `dedupe_key`) e
 * INALCANCAVEL hoje, e e o proprio Postgres que a barra, alto. A constante
 * existe para que o alvo continue sendo uma edicao consciente -- o dia em que
 * alguem criar um indice unico em `dedupe_key` sozinho, o `42P10` para de
 * tocar e a colisao passa a ser possivel, ai sim em silencio.
 *
 * Nao ha typecheck sobre esta string: e opcao de cliente do Supabase, `string`.
 * Quem a prende e `promotion.test.ts`, e a prova contra o banco de verdade e o
 * cenario do quinto portao.
 */
export const OUTBOX_DEDUPE_TARGET = "kind,dedupe_key";

/**
 * A linha do aviso de promocao para UMA inscricao.
 *
 * Estoura em id vazio de proposito. `dedupe_key` e NOT NULL, mas NOT NULL nao
 * recusa string vazia: duas promocoes com id em branco casariam UMA na outra --
 * um aviso so para duas pessoas diferentes --, e o `registration_id` em branco
 * faria o dreno nao achar resumo nenhum e ADIAR a linha para sempre.
 * `registrationIdFrom` (features/email/outbox.ts) ja recusa esse mesmo valor do
 * outro lado do caminho; esta guarda e a do lado da escrita.
 */
export function waitlistPromotedRow(registrationId: string): OutboxInsert {
  const id = registrationId.trim();
  if (id === "") {
    throw new Error("waitlistPromotedRow: registrationId vazio nao vira dedupe_key");
  }
  return {
    kind: "waitlist_promoted",
    dedupe_key: id,
    payload: { registration_id: id },
  };
}
