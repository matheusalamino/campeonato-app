import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/draft-auth";
import { drainAccess } from "@/features/email/drain-auth";
import { runOutboxDrain } from "@/services/email-outbox";

/**
 * O gatilho do dreno da caixa de saida de e-mail.
 *
 * ── O QUE ESTE ARQUIVO PODE FAZER, E O QUE ELE NAO PODE ──
 *
 * Nao pode DECIDIR nada. `app/**` nao esta no `include` de `vitest.config.ts`,
 * nenhum glob deste repo alcanca `.test.tsx`, e nao ha job de teste no CI --
 * `.github/workflows` so tem `migrate.yml`. Regra escrita aqui nasce sem rede, e
 * este bloco ja mediu quatro vezes mutacao real atravessando os cinco portoes
 * inteiros por causa disso.
 *
 * Entao: quem autoriza e `drainAccess` (features/email/drain-auth.ts), quem
 * envia e `runOutboxDrain` (services/email-outbox.ts), e o que sobra aqui e
 * traduzir HTTP para chamada e chamada para HTTP.
 *
 * A rede contra a regra voltar para ca por copia e
 * `features/email/drain-wiring.test.ts`, que le este arquivo como texto e
 * recusa os literais da comparacao de segredo.
 *
 * ── AS DUAS PORTAS ──
 *
 * O cron da Vercel dispara GET com `Authorization: Bearer <CRON_SECRET>`; o
 * admin marcando pagamento bate por POST com a sessao. O porque de haver a
 * segunda -- e o porque de ela ser so no POST -- esta em `drain-auth.ts` e no
 * docblock de `DRAIN_ENDPOINT_METHOD`.
 *
 * ── O CRON E DIARIO, E ISSO E LIMITE DE PLANO ──
 *
 * `vercel.json` agenda `0 23 * * *`. A Vercel RECUSA no deploy um cron mais
 * frequente que diario no plano Hobby, que e o plano deste projeto. Nao e
 * escolha de desenho, e o horario tem razao propria -- ver ENVIRONMENTS.md,
 * secao "E-mail transacional (bloco C)". (`vercel.json` nao aceita comentario:
 * e JSON, e a Vercel recusa propriedade desconhecida.)
 */

// Esta rota GRAVA no banco e manda e-mail. Uma resposta cacheada faria o
// segundo disparo devolver o relatorio do primeiro sem drenar nada.
export const dynamic = "force-dynamic";

// Node, e nao Edge: `drainAccess` usa `node:crypto` e `runOutboxDrain` monta o
// cliente com a chave de service role.
export const runtime = "nodejs";

async function drenar(req: Request): Promise<Response> {
  const acesso = await drainAccess({
    method: req.method,
    authorization: req.headers.get("authorization"),
    cronSecret: process.env.CRON_SECRET,
    // Preguicoso de proposito: com o segredo do cron certo, `drainAccess` NAO
    // chama isto, e o disparo diario nao paga duas idas ao Postgres.
    isAdmin: async () => !(await requireAdmin()).error,
  });

  if (!acesso.allowed) {
    return NextResponse.json({ error: acesso.error }, { status: acesso.status });
  }

  try {
    // O instante e ARGUMENTO ate a fronteira do processo. `new Date()` so
    // aparece aqui, e e o unico lugar deste caminho onde ele pode aparecer:
    // dentro do dreno ele apagaria o relogio injetavel de que
    // `scripts/test-registration-slots.sh` depende para nao ficar cego 24 horas
    // por semana durante a pausa de sabado.
    const relatorio = await runOutboxDrain({ now: new Date() });
    // O RELATORIO, e nao um `ok` mudo: este e o unico lugar de onde se enxerga
    // o que a fila fez. `{ claimed: 12, sent: 0, deferred: 12, reasons: {
    // no_site_url: 12 } }` diz que falta `NEXT_PUBLIC_SITE_URL`; um `ok: true`
    // diria que esta tudo bem.
    return NextResponse.json({ door: acesso.door, ...relatorio });
  } catch (err) {
    // `runOutboxDrain` levanta com variavel de ambiente faltando. Isso e 500 --
    // configuracao errada da implantacao, nao pedido invalido -- e o cron da
    // Vercel registra a falha, que e como alguem fica sabendo.
    console.error("dreno da fila de e-mail falhou:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 },
    );
  }
}

/** A porta do cron. */
export async function GET(req: Request): Promise<Response> {
  return drenar(req);
}

/** A porta do admin -- e tambem a do cron, se ele um dia mudar de verbo. */
export async function POST(req: Request): Promise<Response> {
  return drenar(req);
}
