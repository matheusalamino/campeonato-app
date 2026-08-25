import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verificationLookupPlan,
  verificationOutcome,
  VERIFY_EMAIL_RPC,
  type VerificationOutcome,
} from "@/features/email/verification";

/**
 * A FIACAO da verificacao, e SO a fiacao: monta o cliente, faz a chamada,
 * devolve o que `features/**` decidiu.
 *
 * ── POR QUE NAO SOBROU DECISAO NENHUMA AQUI ──
 *
 * Porque `app/**` nao e varrido por `include` nenhum deste repo, e nao ha job de
 * teste no CI (`.github/workflows` so tem `migrate.yml`). MEDIDO nesta branch,
 * com a decisao ainda escrita neste arquivo, TRES mutacoes passavam pelos CINCO
 * portoes inteiros:
 *
 *  1. mandar o token EM CLARO no lugar do hash -- quebra a feature inteira e
 *     bota o valor em claro em `log_statement`;
 *  2. a tela dizendo "E-mail confirmado" para todo mundo;
 *  3. `unknown` dobrado em `error`, que e a cicatriz do A4 de volta.
 *
 * Um no-op plantado aqui tambem ficava verde: os portoes tinham ZERO poder de
 * discriminacao neste arquivo.
 *
 * A resposta nao foi tentar alcancar a logica onde ela estava -- foi mover a
 * logica para onde o portao alcanca, que e a mesma licao da T5b. Hoje:
 * `verificationLookupPlan` (forma do token, hash e o argumento da RPC) e
 * `verificationOutcome` (o veredito) moram em `features/email/verification.ts`,
 * com teste de comportamento. O que sobra aqui e o `createAdminClient()`, o
 * `await` e o `try`.
 *
 * A rede de texto para o que sobrou e `features/email/route-wiring.test.ts`:
 * ela le este arquivo e exige que a delegacao exista e que os literais que
 * saíram -- `p_token_hash`, `hashToken(`, e QUALQUER `state:` -- nao voltem.
 * Negativa, e nao positiva: um decoy homonimo satisfaz uma positiva, e nao
 * satisfaz uma negativa.
 *
 * ── POR QUE NAO HA `"use server"` NUM ARQUIVO CHAMADO actions.ts ──
 *
 * Porque `"use server"` publica cada funcao exportada como ENDPOINT HTTP, e este
 * arquivo nao precisa de nenhum: quem o chama e `page.tsx`, que e componente de
 * servidor e o importa direto. Marcar o arquivo abriria uma segunda porta para a
 * mesma mutacao, alcancavel por qualquer um, sem nada do outro lado usando-a.
 *
 * O `import "server-only"` continua necessario e faz a outra metade: ele quebra
 * o BUILD se algum dia este modulo for importado por componente de cliente --
 * que e por onde a chave `service_role` vazaria.
 *
 * ── A VERIFICACAO ACONTECE AO ABRIR, SEM BOTAO ──
 *
 * Decisao de desenho, com consequencia conhecida: varredor de e-mail
 * corporativo e o pre-carregamento de link do Gmail "clicam" sozinhos, entao a
 * verificacao pode acontecer sem ninguem ter lido nada.
 *
 * Aceito porque o significado se mantem. O que o clique prova e que a MENSAGEM
 * CHEGOU NAQUELA CAIXA -- e um varredor que a abriu prova exatamente isso. O que
 * ele nao prova e que uma pessoa leu, e nada depende dessa distincao: a
 * verificacao nao bloqueia inscricao nenhuma (decisao do usuario em
 * 2026-08-23). O preco e `players.email` poder ser propagado por clique de
 * varredor -- com o endereco provado alcancavel do mesmo jeito.
 *
 * A alternativa e tela com botao, com a mutacao num `POST`/server action. Ela
 * troca esse preco por outro: quem le e-mail em cliente que nao renderiza o
 * botao, ou quem so abre o link e fecha, nao verifica nunca.
 */
export async function verifyEmailByToken(rawToken: string): Promise<VerificationOutcome> {
  const plano = verificationLookupPlan(rawToken);
  if (!plano.lookup) return plano.outcome;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc(VERIFY_EMAIL_RPC, plano.args);

    if (error) {
      console.error("[verify-email] verify_registration_email falhou:", error.message);
      return verificationOutcome({ ok: false, message: error.message });
    }

    // `data` chega TIPADO COMO `any`, e nao como `unknown`: `createAdminClient()`
    // devolve `SupabaseClient` sem generico, e o `.rpc()` desse cliente tipa o
    // retorno como `any`. `any` nao acusa nada -- passar `data` direto onde se
    // espera `string` compila calado, inclusive quando o Postgres devolver
    // `null`. Por isso a checagem de `typeof` abaixo existe: ela nao esta
    // consertando um `unknown` estrito, esta suprindo a ausencia de checagem.
    //
    // O que NAO se faz e estreitar com `as string`: isso seria a mesma
    // imposicao-sem-conferencia do `select` do dreno. O cru vai para
    // `verificationOutcome`, que decide o que fazer com o que nao reconhece --
    // e o que ele faz e `error`, nunca `unknown`.
    return verificationOutcome({ ok: true, status: typeof data === "string" ? data : "" });
  } catch (cause) {
    // Cliente que nao monta (falta de variavel de ambiente) e rede que cai
    // chegam por aqui. Sao defeito NOSSO, e passam pelo MESMO tradutor do erro
    // de consulta -- e nao por um objeto escrito a mao. Escrito a mao, este
    // arquivo voltaria a conter um literal de estado, que e justamente o que a
    // rede de texto proibe.
    console.error("[verify-email] a verificacao lancou:", cause);
    return verificationOutcome({ ok: false, message: String(cause) });
  }
}
