import type { EmailMessage } from "@/lib/email/port";
import type { EmailKind } from "./kinds";
import type { OutboxRow, Recipient, RegistrationSummary } from "./outbox";
import { organizerNewRegistrationEmail } from "./templates/organizer-new-registration";
import { paymentVerifiedEmail } from "./templates/payment-verified";
import { registrationCommittedEmail } from "./templates/registration-committed";
import { waitlistPromotedEmail } from "./templates/waitlist-promoted";

/**
 * O MAPA de `kind` para template, e a fronteira entre o dreno e o texto.
 *
 * ── POR QUE ARQUIVO PROPRIO, E NAO MAIS UM PEDACO DE outbox.ts ──
 *
 * Por COESAO, e nao por alivio de tamanho -- e a diferenca importa, porque a
 * primeira versao deste docblock alegava o alivio e ele nao aconteceu. MEDIDO:
 * `outbox.ts` tinha 417 linhas antes do commit que extraiu este arquivo e ficou
 * com 437 DEPOIS dele; segue com 437. A extracao levou embora `RenderInput`,
 * `EmailRenderer` e o `stubRenderer`, e trouxe de volta mais comentario do que
 * tirou de codigo.
 *
 * O que ela de fato resolveu foi a costura apontada na revisao da T4: quem
 * decide `kind -> template` agora mora junto de quem implementa os templates,
 * e nao no meio do dreno.
 *
 * Os dois arquivos se importam, e nao ha ciclo em tempo de execucao: daqui para
 * `outbox.ts` sao so TIPOS, e de la para ca so o tipo `EmailRenderer`. `import
 * type` e apagado na compilacao. Isso nao e promessa -- e `tsc --noEmit` em
 * zero, e a ausencia de qualquer import de VALOR entre os dois.
 *
 * ── O `never` NAO BASTA, E POR ISSO HA render.test.ts ──
 *
 * O `const exhaustive: never = kind` do fim do switch e rede de COMPILACAO, e
 * o vitest nao typecheca. Em tempo de execucao aquela linha devolve a propria
 * string. A assertiva de `typeof` em render.test.ts e o que prende isso onde o
 * compilador nao alcanca -- mesmo padrao de `features/email/kinds.test.ts`.
 */
export type RenderInput = {
  kind: EmailKind;
  row: OutboxRow;
  recipient: Recipient;
  siteUrl: string;
  /**
   * Nulo quando a linha nao tem inscricao resolvivel -- payload sem
   * `registration_id`, ou inscricao apagada depois de a linha entrar na fila
   * (nao ha FK entre `email_outbox` e `championship_registrations`; ver
   * scripts/test-email-outbox.sh).
   *
   * O template decide se ainda tem o que dizer sem ela. Nenhum dos QUATRO que
   * tem corpo tem, e os quatro devolvem null -- que ADIA a linha em vez de
   * mata-la. (A contagem esta declarada por extenso em render.test.ts, e e la
   * que ela acende quando um template novo entra.)
   */
  summary: RegistrationSummary | null;
  /**
   * O link de verificacao ja MONTADO, ou nulo quando nao ha o que verificar.
   *
   * Chega pronto porque o token nao pode nascer aqui: `renderEmail` e funcao
   * pura, e o hash precisa estar GRAVADO antes de o link ir no corpo. Quem
   * emite e `store.issueVerificationToken`, chamado pelo dreno depois de as
   * guardas dizerem que envia -- ver `emitirLinkDeVerificacao` em outbox.ts.
   *
   * Nulo sempre que nao ha link a oferecer, e nenhum dos casos e defeito. Os
   * conhecidos hoje, sem promessa de ser lista fechada: `kind` que nao pede link
   * (todos menos `registration_committed`), inscricao ja verificada, inscricao
   * sem `contact_email`, linha sem `registration_id` no payload, e inscricao que
   * sumiu depois de a linha entrar na fila (nao ha FK entre `email_outbox` e
   * `championship_registrations`). Em todos, o comprovante sai inteiro -- so sem
   * o bloco do convite.
   */
  verificationLink: string | null;
};

/** Monta o corpo, ou devolve null quando nao ha corpo a montar para esta linha. */
export type EmailRenderer = (input: RenderInput) => EmailMessage | null;

/** O destino e o corpo, costurados. O `to` sai do `recipient` que
 *  `recipientFor` escolheu, e nunca do template -- ver o docblock de
 *  `EmailBody` em templates/body.ts. */
function para(recipient: Recipient, corpo: Omit<EmailMessage, "to" | "toName">): EmailMessage {
  return {
    to: recipient.email,
    toName: recipient.name ?? undefined,
    ...corpo,
  };
}

export const renderEmail: EmailRenderer = ({ kind, recipient, summary, verificationLink }) => {
  switch (kind) {
    case "registration_committed": {
      // Sem resumo nao ha comprovante possivel: o corpo inteiro e nome,
      // campeonato e situacao. Devolver null ADIA, e adiar deixa a fila
      // crescer, que e visivel -- montar um comprovante generico nao seria.
      if (!summary) return null;
      return para(
        recipient,
        registrationCommittedEmail({
          playerName: summary.playerName,
          championshipName: summary.championshipName,
          isWaitlist: summary.isWaitlist,
          // O link chega PRONTO no input, e nao e montado aqui: o token e
          // gravado pelo store antes desta funcao rodar (ver `verificationLink`
          // em `RenderInput`). Repassar `null` no lugar dele nao acusa em tipo
          // nenhum -- os dois lados sao `string | null` --, e produziria todo
          // comprovante sem convite, com o token ja gasto no banco. Ha assertiva
          // sobre o repasse em render.test.ts.
          verificationLink,
        }),
      );
    }

    case "organizer_new_registration": {
      if (!summary) return null;
      return para(
        recipient,
        organizerNewRegistrationEmail({
          playerName: summary.playerName,
          championshipName: summary.championshipName,
          isWaitlist: summary.isWaitlist,
          preferredPosition: summary.preferredPosition,
        }),
      );
    }

    case "payment_verified": {
      // Mesmo motivo do comprovante: sem resumo nao ha aviso possivel, porque
      // nome e campeonato sao o corpo inteiro. Null ADIA, e adiar deixa a fila
      // crescer -- que e visivel.
      if (!summary) return null;
      return para(
        recipient,
        paymentVerifiedEmail({
          playerName: summary.playerName,
          championshipName: summary.championshipName,
        }),
      );
      // `isWaitlist` NAO e repassado, e isso e deliberado: o template nao tem
      // ramo de lista de espera, e o texto dele foi escrito para valer nos dois
      // casos. Ver o docblock de templates/payment-verified.ts antes de
      // acrescentar o campo -- o que muda nao e a assinatura, e o que as frases
      // podem prometer.
    }

    case "waitlist_promoted": {
      // Mesmo motivo dos outros tres: sem resumo nao ha aviso possivel, porque
      // nome e campeonato sao o corpo inteiro. Null ADIA, e adiar deixa a fila
      // crescer -- que e visivel.
      if (!summary) return null;
      return para(
        recipient,
        waitlistPromotedEmail({
          playerName: summary.playerName,
          championshipName: summary.championshipName,
        }),
      );
      // `verificationLink` NAO e repassado, e isso e DECISAO, nao esquecimento:
      // `kindNeedsVerificationLink` so devolve true para
      // `registration_committed`, entao este `kind` nem chega aqui com link. E
      // se um dia chegar, emitir token para ele INVALIDARIA o link que a pessoa
      // ja tem no comprovante -- a emissao sempre regrava o hash. Ver o
      // docblock de templates/waitlist-promoted.ts.
      //
      // `isWaitlist` tambem nao entra: quem recebe este aviso ACABOU de sair da
      // espera, e o campo do resumo e lido do banco em momento incerto em
      // relacao a promocao (nao ha gatilho -- ver o docblock de
      // `enqueueWaitlistPromotedEmail` em services/email-outbox.ts). Um ramo
      // que dependesse dele poderia mandar o texto errado justamente para quem
      // o e-mail e.
    }

    // Os TRES declarados adiante do uso -- os lembretes. Nenhum produtor deste
    // repo os enfileira, entao nenhum destes chega aqui. Devolver null e o que
    // faz a linha ser ADIADA se um dia chegar antes do template.
    case "reminder_payment_pending":
    case "reminder_waitlist":
    case "reminder_not_registered":
      return null;

    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
};
