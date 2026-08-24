import type { EmailMessage } from "@/lib/email/port";
import type { EmailKind } from "./kinds";
import type { OutboxRow, Recipient, RegistrationSummary } from "./outbox";
import { organizerNewRegistrationEmail } from "./templates/organizer-new-registration";
import { registrationCommittedEmail } from "./templates/registration-committed";

/**
 * O MAPA de `kind` para template, e a fronteira entre o dreno e o texto.
 *
 * ── POR QUE ARQUIVO PROPRIO, E NAO MAIS UM PEDACO DE outbox.ts ──
 *
 * Porque `outbox.ts` ja passava de 400 linhas com cinco responsabilidades, e a
 * costura foi a coisa apontada na revisao da T4. `RenderInput` e
 * `EmailRenderer` MORAVAM la e vieram para ca junto com quem os implementa.
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
   * O template decide se ainda tem o que dizer sem ela. Hoje nenhum tem, e os
   * dois devolvem null -- que ADIA a linha em vez de mata-la.
   */
  summary: RegistrationSummary | null;
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

export const renderEmail: EmailRenderer = ({ kind, recipient, summary }) => {
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
          // NULO ATE A T6. O token de verificacao nasce la, e e la que esta
          // linha vira o link de verdade (`linkTo(siteUrl, "verify-email?...")`,
          // com `siteUrl` que ja chega neste input). Ha assertiva em
          // render.test.ts declarando que HOJE o comprovante sai sem link --
          // ela fica vermelha quando a T6 entrar, de proposito.
          verificationLink: null,
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

    // Os cinco declarados adiante do uso. Nenhum produtor deste repo os
    // enfileira (o unico e o gatilho `enqueue_registration_emails`, que escreve
    // os dois de cima), entao nenhum destes chega aqui hoje. Devolver null e o
    // que faz a linha ser ADIADA se um dia chegar antes do template.
    case "payment_verified":
    case "waitlist_promoted":
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
