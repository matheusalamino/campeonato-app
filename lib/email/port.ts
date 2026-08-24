/**
 * A fronteira entre o app e o provedor de e-mail.
 *
 * Ela existe por dois motivos concretos, nao por elegancia:
 *
 * 1. Trocar Brevo por outro provedor vira UM arquivo. A decisao de 2026-08-23
 *    foi remetente unico sem dominio, e essa escolha se troca por variavel de
 *    ambiente quando existir um dominio -- desde que nada mais conheca o Brevo.
 * 2. Nenhum teste precisa de rede. O dreno, quando existir, vai receber um
 *    `EmailSender` e nao vai saber quem esta do outro lado.
 */
export type EmailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /** Sempre presente. HTML sem alternativa em texto piora o filtro de spam, e
   *  com remetente unico verificado ja se parte atras. */
  text: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  /**
   * `retriable` vai decidir se a linha volta para a fila ou morre, quando a
   * caixa de saida existir. Nao e detalhe: retentar endereco invalido para
   * sempre queima a cota de 300/dia.
   */
  | { ok: false; retriable: boolean; error: string };

export type EmailSender = (msg: EmailMessage) => Promise<SendResult>;
