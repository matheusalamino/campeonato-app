"use client";

import type { PaymentClosedReason } from "@/features/registration/slot";

/**
 * Por que o QR do PIX e o envio do comprovante nao estao na tela.
 *
 * Sumir sem dizer nada leria como tela quebrada: a 375px a faixa do topo esta
 * fora do campo de visao — e e por isso mesmo que o QR precisou sair daqui.
 *
 * Duas historias, como o `ClosedNotice` do A5: a vaga e o por do sol escondem o
 * mesmo bloco por motivos diferentes, e uma frase so mentiria em um dos dois
 * casos. No corte, afirmar que a vaga nao esta confirmada e falso, e manda o
 * jogador cacar um problema que ele nao tem.
 *
 * Recebe a RAZAO ja decidida, e nao os dois dados para decidir de novo: quem
 * decide e `paymentGate`, no mesmo lugar que decidiu esconder o bloco. Assim as
 * duas decisoes nao podem discordar, e cada texto fica amarrado ao seu ramo —
 * trocar os dois de lugar deixa de ser uma edicao que passa em tudo.
 */
export default function PaymentClosedNotice({ reason }: { reason: PaymentClosedReason }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 text-xs leading-relaxed text-[var(--gala-ink-dim)]">
      {reason === "slot" ? (
        <>
          O pagamento fica indisponível enquanto sua vaga não estiver confirmada.
          O aviso no topo da página explica o motivo. Não pague nada até lá.
        </>
      ) : (
        <>
          O pagamento fecha alguns minutos antes do pôr do sol, para ninguém pagar e ser
          recusado. As inscrições voltam após o pôr do sol de sábado — e o pagamento volta
          com elas. Se você já fez o PIX, guarde o comprovante: é só voltar aqui e enviá-lo
          quando elas voltarem.
        </>
      )}
    </div>
  );
}
