import type { Metadata } from "next";
import { verificationCopy } from "@/features/email/verification";
import { verifyEmailByToken } from "./actions";

/**
 * A volta do link de verificacao do e-mail.
 *
 * ── ESTA PAGINA NAO DECIDE NADA, E ISSO E DELIBERADO ──
 *
 * O veredito e `verificationOutcome`; o texto dos quatro estados e
 * `verificationCopy`. Os dois moram em `features/email/verification.ts`, onde a
 * suite os alcanca -- `vitest.config.ts` inclui `lib/**`, `features/**` e
 * `scripts/**`, e um teste escrito aqui NAO RODA (`.test.tsx` nao e alcancado
 * por nenhum `include` deste repo, e nao ha job de teste no CI).
 *
 * O que sobra aqui e o desenho, e ele copia os avisos de
 * `app/(public)/inscrever/[slug]/` -- `ClosedNotice`, `NotOpenNotice`,
 * `NotYetNotice` -- ate nas classes. Sistema visual novo numa tela de quatro
 * paragrafos seria divida sem contrapartida.
 *
 * ── `force-dynamic`, e nao e detalhe de desempenho ──
 *
 * Abrir esta pagina GRAVA no banco. Uma resposta cacheada faria a segunda
 * visita mostrar o estado da primeira sem consultar nada -- e, pior, faria a
 * pagina de um token aparecer para outro.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmação de e-mail",
  // Fora do indice: a URL carrega um token de uso unico. Indexada, ela vira um
  // link de verificacao publico -- e um rastreador que a visitasse consumiria a
  // verificacao de alguem.
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { emoji, titulo, paragrafos } = verificationCopy(await verifyEmailByToken(token));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl" aria-hidden="true">{emoji}</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">{titulo}</h1>
      {paragrafos.map((paragrafo) => (
        <p key={paragrafo} className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
          {paragrafo}
        </p>
      ))}
    </div>
  );
}
