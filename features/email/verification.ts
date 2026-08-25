/**
 * O VEREDITO da volta do link de verificacao, e o texto de cada um deles.
 *
 * ── POR QUE ISTO NAO MORA NA PAGINA ──
 *
 * Por dois motivos medidos, e nenhum e organizacao:
 *
 *  1. `vitest.config.ts` inclui `lib/**`, `features/**` e `scripts/**`. Um
 *     teste escrito em `app/**` NAO RODA -- e nem sequer precisa de `app/`
 *     para isso: um `.test.tsx` nao e alcancado por nenhum `include` deste
 *     repo, e nao ha job de teste no CI. Regra escrita na pagina nasce sem
 *     portao nenhum.
 *  2. O texto vai ser lido por gente de verdade, e e a unica parte desta task
 *     que ninguem consegue conferir por tipo. Aqui ele tem assertiva; na pagina
 *     nao teria.
 *
 * A pagina fica com o que sobra: chamar `verificationOutcome`, pedir o texto a
 * `verificationCopy` e desenhar.
 */

import { linkTo } from "@/lib/email/site-url";
import type { EmailKind } from "./kinds";
import { hashToken, verificationTokenFrom } from "./verification-token";

// ─────────────────────────────────────────────────────────────────────────────
// O link
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O caminho da rota, em UM lugar so.
 *
 * Ele aparece em dois: aqui, montando o link que sai no e-mail, e no nome da
 * pasta `app/(public)/verify-email/[token]/`. Nada no TypeScript liga os dois --
 * renomear a pasta deixa `tsc --noEmit` em zero e faz todo comprovante ja
 * enviado apontar para um 404. A assertiva de `verification.test.ts` que confere
 * a existencia da pasta e o que liga.
 *
 * Ingles, como toda rota deste repo.
 */
export const VERIFY_EMAIL_PATH = "verify-email";

/**
 * O link que vai no comprovante.
 *
 * O token e SEGMENTO de caminho, e nao parametro de consulta
 * (`?token=`). Motivo pratico: parametro de consulta e o que mais sobrevive
 * copiado para lugar nenhum -- encurtadores, previews e alguns clientes de
 * e-mail reescrevem ou cortam a query --, e o Next entrega o segmento pronto
 * como `params.token`.
 *
 * `encodeURIComponent` e no-op para o hex que `createVerificationToken` produz
 * hoje. Fica porque o dia em que o formato mudar (base64url, por exemplo) e o
 * dia em que a ausencia dele produziria link quebrado calado.
 */
export function verificationLinkFor(siteUrl: string, plainToken: string): string {
  return linkTo(siteUrl, `${VERIFY_EMAIL_PATH}/${encodeURIComponent(plainToken)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a funcao do banco responde
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os tres estados que `verify_registration_email` (migration 20260824010000)
 * devolve como texto. Escritos por extenso, e nao derivados de nada: uma lista
 * derivada concordaria com qualquer mudanca do lado do SQL e nao provaria nada.
 */
export const VERIFICATION_STATUSES = ["verified", "already", "unknown"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isVerificationStatus(raw: unknown): raw is VerificationStatus {
  return typeof raw === "string" && (VERIFICATION_STATUSES as readonly string[]).includes(raw);
}

/**
 * O que a consulta devolveu, cru.
 *
 * `status` e `string` e nao `VerificationStatus` de proposito: quem responde e
 * o Postgres, e o `.rpc()` do cliente entrega `any` -- nao `unknown`. MEDIDO:
 * `createAdminClient()` devolve `SupabaseClient` sem generico, e com isso
 * `const n: number = data` compila calado, tanto quanto `const s: string =
 * data`.
 *
 * A diferenca importa para quem for mexer aqui: `unknown` OBRIGA a checar antes
 * de usar, e `any` nao obriga nada. E por isso que a checagem de `typeof` da
 * rota nao e zelo -- ela e a unica conferencia que existe nesse caminho.
 * Estreitar com `as string` seria a mesma mentira do `as unknown as` do
 * `select` do servico: imposicao sem conferencia.
 */
export type VerificationQueryResult =
  | { ok: true; status: string }
  | { ok: false; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// O veredito
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os QUATRO estados da tela, e os quatro sao distintos de proposito.
 *
 * ── A CICATRIZ QUE ESTA UNIAO EXISTE PARA NAO REPETIR ──
 *
 * No A4, `reserveSlot` dobrava QUALQUER falha em `reason: "not_found"`. A tela
 * lia isso e dizia "as vagas se esgotaram" -- para um jogador que tinha vaga,
 * num campeonato que tinha vaga. Bloqueio real, causado por um veredito que
 * juntava duas coisas diferentes debaixo do mesmo nome.
 *
 * Aqui o espelho e `unknown` contra `error`, e eles NAO PODEM se dobrar um no
 * outro:
 *
 *  - `unknown` e o caso NORMAL e esperado: o token nao casa com linha nenhuma,
 *    quase sempre porque um envio mais recente reemitiu o token e matou este
 *    link (ver `issueVerificationToken`). A tela diz "este link nao vale mais"
 *    e aponta a saida.
 *  - `error` e defeito NOSSO: a consulta nao respondeu. A tela nao culpa
 *    ninguem e manda tentar de novo.
 *
 * Dizer "deu erro" para um link velho manda a pessoa procurar problema onde nao
 * ha; dizer "este link nao vale mais" para uma consulta quebrada esconde um
 * defeito que precisa aparecer.
 */
export type VerificationOutcome =
  | { state: "verified" }
  | { state: "already" }
  | { state: "unknown" }
  | { state: "error" };

/**
 * A traducao da resposta crua no veredito.
 *
 * O `switch` e sobre `VerificationStatus`, e o `never` do fim e cobrado pelo
 * COMPILADOR: acrescentar um estado a `VERIFICATION_STATUSES` sem acrescentar o
 * `case` deixa `npx tsc --noEmit` vermelho. E a rede que a uniao
 * `SlotReservation` do A4 nao tinha -- la o revisor acrescentou um membro e o
 * `tsc` continuou limpo.
 *
 * Status que este codigo NAO conhece vira `error`, e nao `unknown`: um texto
 * que a funcao do banco devolveu e ninguem aqui sabe ler e desencontro entre as
 * duas pontas, que e defeito nosso -- nao e "link velho".
 */
export function verificationOutcome(result: VerificationQueryResult): VerificationOutcome {
  if (!result.ok) return { state: "error" };
  if (!isVerificationStatus(result.status)) return { state: "error" };

  switch (result.status) {
    case "verified":
      return { state: "verified" };
    case "already":
      return { state: "already" };
    case "unknown":
      return { state: "unknown" };
    default: {
      const exhaustive: never = result.status;
      return exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a rota faz com o token que chegou na URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O nome da funcao do banco, aqui e nao na rota.
 *
 * Mesmo motivo do `VERIFY_EMAIL_PATH`: o unico lugar do repo onde este nome
 * precisa aparecer e um so, e ele fica onde ha teste.
 */
export const VERIFY_EMAIL_RPC = "verify_registration_email";

/**
 * O PLANO da consulta: ou nao ha o que consultar, ou ha -- e entao o argumento
 * ja vem pronto.
 *
 * ── POR QUE ISTO EXISTE, E POR QUE NAO PODE MORAR NA ROTA ──
 *
 * `app/**` nao e varrido por `include` nenhum deste repo, e nao ha job de teste
 * no CI. MEDIDO nesta branch, com a decisao ainda dentro de
 * `app/(public)/verify-email/[token]/actions.ts`: trocar `hashToken(token)` por
 * `token` no argumento da RPC passava os CINCO portoes -- 873 testes, 21 do
 * contrato, `tsc` em zero, os dois scripts de banco. E o dano e duplo: todo link
 * do mundo passa a responder "este link nao vale mais" (o hash gravado nunca
 * casa com o claro), e o valor em CLARO passa a viajar como argumento de funcao
 * -- que e o que aparece em `log_statement` e em `pg_stat_statements`, e e
 * exatamente o que o cabecalho da migration 20260824010000 diz estar evitando.
 *
 * Com o par `{ p_token_hash }` montado AQUI, a rota nao tem mais como escolher
 * errado: ela nao escreve o nome do argumento nem chama o hash. O que sobra la
 * e passar `plano.args` adiante, e ha assertiva de texto sobre isso em
 * `route-wiring.test.ts`.
 */
export type VerificationLookupPlan =
  | { lookup: false; outcome: VerificationOutcome }
  | { lookup: true; args: { p_token_hash: string } };

export function verificationLookupPlan(
  rawToken: string | null | undefined,
): VerificationLookupPlan {
  // A FORMA e conferida antes de qualquer hash existir. Link truncado, segmento
  // vazio, colagem que perdeu o fim: todos viram `unknown` -- "este link nao
  // vale mais" --, e nunca `error`.
  const token = verificationTokenFrom(rawToken);
  if (!token) return { lookup: false, outcome: { state: "unknown" } };
  return { lookup: true, args: { p_token_hash: hashToken(token) } };
}

// ─────────────────────────────────────────────────────────────────────────────
// O texto
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationCopy = {
  /** Decorativo. A pagina o marca `aria-hidden`, como os avisos de /inscrever. */
  emoji: string;
  titulo: string;
  paragrafos: readonly string[];
};

/**
 * O texto dos quatro estados.
 *
 * ── ELE E PROPOSTA, E PRECISA DE REVISAO DE GENTE ──
 *
 * Nenhum portao deste repo revisa texto, e as assertivas de
 * `verification.test.ts` nao consertam isso -- elas so estreitam o espaco do
 * erro. Duas das tres que "prendem propriedade" sao DENYLIST de palavra
 * (`already` sem "erro"/"falha"/"invalido"; `error` sem "voce errou"), e
 * denylist so pega o que esta na lista: um texto que soe como falha sem usar
 * nenhuma daquelas palavras passa. A terceira e mais forte por ser positiva --
 * `unknown` PRECISA oferecer saida.
 *
 * O que nenhuma delas cobre e se a frase e VERDADE. Duas ja nasceram falsas e
 * foram consertadas aqui:
 *
 *  - `verified` dizia "seu cadastro passou a usar este endereco", e o cadastro
 *    NAO e tocado quando a inscricao nao tem jogador (`player_id` e NULLABLE, e
 *    a funcao do banco devolve 'verified' assim mesmo -- ha cenario no contrato
 *    que cria esse caso). A frase agora fala do que sempre vale: para onde os
 *    avisos vao.
 *  - `unknown` dizia "e este e um dos antigos", afirmando a causa. Ela tem tres
 *    -- token reemitido, link malformado, inscricao apagada --, e so a primeira
 *    justifica a frase. Agora ela hedges ("pode ter sido substituido"), que e o
 *    que o codigo de fato sabe.
 *
 * As restricoes que as frases respeitam, e que nao sao gosto:
 *
 *  1. `already` NAO e erro. Clicar duas vezes no mesmo link e o comportamento
 *     mais comum que existe -- o cliente de e-mail abre, a pessoa volta, clica
 *     de novo. Tratar isso como falha ensina a pessoa a duvidar de uma coisa
 *     que deu certo.
 *  2. `unknown` diz o que aconteceu e para onde ir. Sem a saida, "este link nao
 *     vale mais" e um beco.
 *  3. Nada aqui bloqueia ninguem, e o texto diz isso onde cabe. A verificacao
 *     NAO e condicao para a inscricao valer -- decisao do usuario em
 *     2026-08-23 --, entao nenhum estado pode dar a entender que a inscricao
 *     esta em risco.
 *  4. Sem prazo em lugar nenhum, pela mesma razao dos templates: "em breve" e
 *     promessa que ninguem deste repo pode cumprir.
 */
export function verificationCopy(outcome: VerificationOutcome): VerificationCopy {
  switch (outcome.state) {
    case "verified":
      return {
        emoji: "✅",
        titulo: "E-mail confirmado",
        paragrafos: [
          "Pronto! Confirmamos que este endereço é seu.",
          "É para cá que a organização manda os avisos da sua inscrição.",
          "Pode fechar esta página.",
        ],
      };

    case "already":
      return {
        emoji: "👍",
        titulo: "Você já tinha confirmado",
        paragrafos: [
          "Este endereço já estava confirmado, então não há nada para fazer.",
          "Clicar duas vezes no mesmo link é normal, e não muda nada.",
          "Pode fechar esta página.",
        ],
      };

    case "unknown":
      return {
        emoji: "🔗",
        titulo: "Este link não vale mais",
        paragrafos: [
          "Ele pode ter sido substituído: sempre que a organização reenvia o comprovante, o link anterior deixa de valer.",
          "Procure na sua caixa de entrada o comprovante mais recente — o link dele está valendo.",
          "Sua inscrição continua do jeito que estava. Confirmar o e-mail não é condição para ela valer.",
        ],
      };

    case "error":
      return {
        emoji: "⚠️",
        titulo: "Não conseguimos confirmar agora",
        paragrafos: [
          "Alguma coisa falhou aqui do nosso lado ao conferir o link.",
          "Tente de novo daqui a pouco abrindo o mesmo link. Se continuar assim, fale com a organização.",
          "Sua inscrição continua do jeito que estava. Confirmar o e-mail não é condição para ela valer.",
        ],
      };

    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A emissao
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que a leitura da inscricao traz para decidir se ha token a emitir. Nomes de
 * coluna, crus -- mesma escolha de `RegistrationSummaryRow`: a traducao mora
 * aqui, onde ha teste, e nao no servico.
 */
export type VerifiableRegistrationRow = {
  contact_email: string | null;
  email_verified_at: string | null;
};

/**
 * Ha o que verificar nesta inscricao?
 *
 * Os dois `nao`, e o que cada um significa:
 *
 *  - **Sem `contact_email`**: nao ha endereco para provar. Inscricao criada
 *    pelo admin nasce assim nesta edicao -- a coluna so e preenchida pelo
 *    caminho publico (`commit_registration`, migration 20260823030000).
 *  - **Ja verificada** (`email_verified_at` nao nulo): a posse ja foi provada.
 *    Emitir de novo trocaria o hash e mataria nada, mas o comprovante sairia
 *    convidando a provar uma coisa ja provada.
 *
 * Nos dois casos o comprovante sai SEM o bloco do link -- `verificationLink:
 * null`, que `registrationCommittedEmail` ja sabe tratar desde a T5.
 */
export function canIssueVerificationToken(row: VerifiableRegistrationRow | null): boolean {
  if (!row) return false;
  if (row.email_verified_at !== null) return false;
  return (row.contact_email ?? "").trim() !== "";
}

/**
 * A coluna que a emissao grava. Uma so, e ela e o hash.
 *
 * `email_verified_at` NAO entra aqui, e a ausencia e o invariante: emitir token
 * nao verifica nada. Quem escreve aquele carimbo e a funcao do banco, na volta
 * do clique, e so ela.
 */
export function verificationTokenColumns(hash: string): Record<string, unknown> {
  return { email_verification_token_hash: hash };
}

/**
 * SO o comprovante leva link.
 *
 * O aviso de inscricao nova vai para a ORGANIZACAO (`recipientFor` /
 * `isOrganizerKind`): um link de verificacao ali provaria a posse da caixa da
 * organizacao, que nao e a caixa que se quer verificar -- e ainda gastaria um
 * token, matando o link que o jogador recebeu.
 *
 * Funcao, e nao comparacao solta no dreno, porque o dia em que um segundo
 * `kind` precisar de link (um reenvio de comprovante, por exemplo) tem de ser
 * uma edicao consciente aqui, com o teste ao lado.
 */
export function kindNeedsVerificationLink(kind: EmailKind): boolean {
  return kind === "registration_committed";
}
