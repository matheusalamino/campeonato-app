import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, verificationTokenFrom } from "@/features/email/verification-token";
import { verificationOutcome, type VerificationOutcome } from "@/features/email/verification";

/**
 * A FIACAO da verificacao: o cliente do Supabase, a funcao do banco e as regras
 * de `features/email/verification.ts` amarradas.
 *
 * ── POR QUE NAO HA `"use server"` AQUI, NUM ARQUIVO CHAMADO actions.ts ──
 *
 * Porque `"use server"` publica cada funcao exportada como ENDPOINT HTTP, e
 * este arquivo nao precisa de nenhum: quem o chama e `page.tsx`, que e
 * componente de servidor e o importa direto. Marcar o arquivo abriria uma
 * segunda porta para a mesma mutacao, alcancavel por qualquer um, sem nada do
 * outro lado usando-a.
 *
 * O `import "server-only"` continua sendo necessario e faz a outra metade: ele
 * quebra o BUILD se algum dia este modulo for importado por componente de
 * cliente -- que e por onde a chave `service_role` vazaria.
 *
 * ── A VERIFICACAO ACONTECE AO ABRIR, SEM BOTAO ──
 *
 * Decisao de desenho, com consequencia conhecida: varredor de e-mail
 * corporativo e o pre-carregamento de link do Gmail "clicam" sozinhos, entao a
 * verificacao pode acontecer sem ninguem ter lido nada.
 *
 * Aceito porque o significado se mantem. O que o clique prova e que a MENSAGEM
 * CHEGOU NAQUELA CAIXA -- e um varredor que a abriu prova exatamente isso. O
 * que ele nao prova e que uma pessoa leu, e nada depende dessa distincao: a
 * verificacao nao bloqueia inscricao nenhuma (decisao do usuario em
 * 2026-08-23). O preco e `players.email` poder ser propagado por clique de
 * varredor -- com o endereco provado alcancavel do mesmo jeito.
 *
 * A alternativa e tela com botao, com a mutacao num `POST`/server action. Ela
 * troca esse preco por outro: quem le e-mail em cliente que nao renderiza o
 * botao, ou quem so abre o link e fecha, nao verifica nunca.
 */
export async function verifyEmailByToken(rawToken: string): Promise<VerificationOutcome> {
  // A FORMA e conferida antes de qualquer hash existir. Link truncado, segmento
  // vazio, colagem que perdeu o fim: todos viram `unknown` -- "este link nao
  // vale mais" --, e nao `error`.
  const token = verificationTokenFrom(rawToken);
  if (!token) return { state: "unknown" };

  try {
    const supabase = createAdminClient();
    // O que atravessa a fronteira e o HASH, nunca o valor em claro: argumento de
    // funcao aparece em `log_statement` e em `pg_stat_statements`, e um token em
    // claro num desses e um link valido esperando ser lido.
    const { data, error } = await supabase.rpc("verify_registration_email", {
      p_token_hash: hashToken(token),
    });

    if (error) {
      console.error("[verify-email] verify_registration_email falhou:", error.message);
      return verificationOutcome({ ok: false, message: error.message });
    }

    // `data` chega como `unknown` do cliente do Supabase. Passa CRU para
    // `verificationOutcome`, que decide o que fazer com o que nao reconhece --
    // e o que ele faz e `error`, nunca `unknown`. Estreitar o tipo aqui com um
    // `as string` seria a mesma imposicao-sem-conferencia do `select` do dreno.
    return verificationOutcome({ ok: true, status: typeof data === "string" ? data : "" });
  } catch (cause) {
    // Cliente que nao monta (falta de variavel de ambiente) e rede que cai
    // chegam por aqui. Sao defeito NOSSO, e viram `error` -- nao "este link nao
    // vale mais", que mandaria a pessoa procurar um comprovante novo que nao
    // resolveria nada.
    console.error("[verify-email] a verificacao lancou:", cause);
    return { state: "error" };
  }
}
