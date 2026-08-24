/**
 * O vocabulario de `email_outbox.kind`, e a unica pergunta que o dreno faz
 * sobre ele: este e-mail e envio em massa, ou e transacional?
 *
 * A pergunta parece administrativa e nao e. Ela decide o que acontece quando
 * alguem se descadastra: e-mail em massa cala, e-mail transacional sai do mesmo
 * jeito. Errar para o lado do silencio e pior que errar para o lado do
 * incomodo -- a pessoa PEDIU o comprovante ao se inscrever, e sem ele nao tem
 * prova nenhuma de que se inscreveu.
 *
 * A coluna `kind` e `text`, sem CHECK de valor: o banco aceita qualquer
 * palavra. Quem classifica e este arquivo, e por isso ele tem `isEmailKind`
 * antes de `isBulkKind`.
 *
 * ── O que existe hoje, e o que so esta declarado ─────────────────────────────
 *
 * Na data deste arquivo o UNICO produtor da fila e o gatilho
 * `enqueue_registration_emails` (migration 20260823030000), e ele escreve dois
 * `kind`: `registration_committed` e `organizer_new_registration`. Os outros
 * cinco nomes sao vocabulario declarado adiante do uso -- nenhum codigo deste
 * repo os enfileira, e nenhum e-mail desses ja saiu.
 *
 * Eles estao aqui, e nao adiante, porque a lista tem de fechar para o `switch`
 * ser exaustivo: e o `never` do fim que transforma "esqueci de classificar" em
 * erro de compilacao, e isso so funciona sobre uma lista completa.
 */
export const EMAIL_KINDS = [
  "registration_committed",
  "organizer_new_registration",
  "payment_verified",
  "waitlist_promoted",
  "reminder_payment_pending",
  "reminder_waitlist",
  "reminder_not_registered",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

/** O `kind` que veio do banco e um dos declarados? Comparacao exata: a fila de
 *  teste usa `kind` proprio (`test_outbox_alpha` e companhia, em
 *  scripts/test-email-outbox.sh) e nenhum deles pode passar por aqui. */
export function isEmailKind(kind: string): kind is EmailKind {
  return (EMAIL_KINDS as readonly string[]).includes(kind);
}

/**
 * Envio em massa e o que a pessoa pode dispensar sem perder nada que ela pediu:
 * os lembretes. Todo o resto e consequencia direta de um ato dela -- inscreveu,
 * pagou, subiu da fila de espera --, e o aviso da organizacao nem sequer vai
 * para o jogador.
 */
export function isBulkKind(kind: EmailKind): boolean {
  switch (kind) {
    case "reminder_payment_pending":
    case "reminder_waitlist":
    case "reminder_not_registered":
      return true;

    case "registration_committed":
    case "organizer_new_registration":
    case "payment_verified":
    case "waitlist_promoted":
      return false;

    default: {
      // Kind novo em EMAIL_KINDS sem `case` aqui nao compila. E, porque o
      // vitest nao typecheca, tambem nao passa no teste: em tempo de execucao
      // esta linha devolve a propria string, e ha assertiva de `typeof` sobre
      // isso em kinds.test.ts.
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * Este e-mail vai para a organizacao, e nao para quem se inscreveu?
 *
 * Precisa ser pergunta separada porque o destino de um `organizer_*` nao sai do
 * cadastro de ninguem: sai da variavel `ORGANIZER_EMAIL`. Sem esta funcao, o
 * aviso interno de inscricao nova cairia na caixa do proprio inscrito -- e o
 * texto dele nem e escrito para essa pessoa.
 */
export function isOrganizerKind(kind: EmailKind): boolean {
  switch (kind) {
    case "organizer_new_registration":
      return true;

    case "registration_committed":
    case "payment_verified":
    case "waitlist_promoted":
    case "reminder_payment_pending":
    case "reminder_waitlist":
    case "reminder_not_registered":
      return false;

    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
