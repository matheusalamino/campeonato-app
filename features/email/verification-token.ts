import { createHash, randomBytes } from "node:crypto";

/**
 * O TOKEN de verificacao do e-mail: o valor que viaja dentro do link e o hash
 * que fica no banco.
 *
 * ── QUEM EMITE, E POR QUE NAO E O TEMPLATE ──
 *
 * `renderEmail` (features/email/render.ts) e funcao PURA: recebe `RenderInput`
 * e devolve `EmailMessage | null`. Ela nao escreve no banco, e o hash precisa
 * ESTAR gravado antes de o link ir no corpo -- senao sai no e-mail um link que
 * nao casa com linha nenhuma.
 *
 * Entao a emissao e do STORE (`issueVerificationToken`, em
 * features/email/outbox.ts), e o valor em claro entra no `RenderInput` ja
 * montado como link.
 *
 * ── AS DUAS FUNCOES DAQUI SAO PURAS DE PROPOSITO ──
 *
 * Sem `process.env`, sem relogio, sem I/O. `createVerificationToken` le o CSPRNG
 * do node e nada mais; `hashToken` e determinismo puro. E o que torna a mutacao
 * possivel: uma funcao que lesse o ambiente daria resultado diferente conforme a
 * maquina, e ai um vermelho nao provaria nada sobre o codigo.
 */

/**
 * 32 bytes de `randomBytes`, e o NUMERO carrega peso.
 *
 * A assertiva obvia -- "dois tokens seguidos diferem" -- nao o prende: dois
 * valores de 4 bytes quase sempre diferem tambem, e a mutacao `randomBytes(4)`
 * sai VERDE nela. O que prende e o comprimento do valor em claro, medido em
 * `verification-token.test.ts`.
 *
 * 32 bytes em hex viram 64 caracteres. Nao e o mesmo numero por acaso do sha256
 * ter tambem 64 hex de saida -- sao dois 64 independentes, e trocar o tamanho
 * do sorteio nao mexeria no do hash.
 */
export const VERIFICATION_TOKEN_BYTES = 32;

/** O comprimento do valor em claro, em caracteres hex. Derivado do tamanho em
 *  bytes, e nao escrito a mao: hex gasta dois caracteres por byte. */
export const VERIFICATION_TOKEN_LENGTH = VERIFICATION_TOKEN_BYTES * 2;

export type VerificationToken = {
  /** O valor que vai DENTRO do link, e o unico lugar onde ele existe. */
  plain: string;
  /** O que o banco guarda. Ver a migration 20260823020000. */
  hash: string;
};

/**
 * Hex, e nao base64.
 *
 * O valor viaja como SEGMENTO de caminho (`/verify-email/<token>`), entao ele
 * precisa sobreviver a URL sem escape. base64 comum tem `+`, `/` e `=`, e os
 * tres mudam de significado num caminho; base64url resolveria, mas hex resolve
 * tambem e nao tem variante para errar. O preco e o dobro de caracteres, que num
 * link de e-mail nao custa nada.
 *
 * Ha assertiva prendendo isso: `encodeURIComponent(plain) === plain`.
 */
export function createVerificationToken(): VerificationToken {
  const plain = randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  return { plain, hash: hashToken(plain) };
}

/**
 * sha256 em hex.
 *
 * Sem sal e sem KDF, e isso e deliberado: o que entra aqui e um sorteio de 32
 * bytes do CSPRNG, e nao uma senha. Nao ha dicionario para atacar e nao ha
 * reuso entre pessoas -- o unico ataque possivel e adivinhar 256 bits. Um
 * bcrypt/argon2 aqui so tornaria a busca por token mais cara sem fechar nada
 * (e, pior, impediria a consulta por igualdade que o indice parcial serve).
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * O token como ele veio da URL, ou `null` quando nao tem a forma de um.
 *
 * ── POR QUE ISTO EXISTE, E NAO E ZELO ──
 *
 * `email_verification_token_hash` e NULAVEL, e a esmagadora maioria das
 * inscricoes tem ele nulo. Uma consulta montada com token vazio -- link
 * truncado, `/verify-email/` sem segmento, colagem que perdeu o fim -- viraria
 * `WHERE email_verification_token_hash = <hash de "">`, que nao casa nada
 * (nenhuma linha guarda o hash da string vazia). Mas a guarda nao depende dessa
 * sorte: aqui a forma e conferida ANTES de qualquer hash existir.
 *
 * O que ela recusa: string vazia, comprimento diferente de 64, maiuscula (o
 * `digest("hex")` do node produz minuscula, entao maiuscula nunca foi emitida
 * por este codigo) e qualquer caractere fora de `[0-9a-f]`.
 *
 * Recusar aqui devolve `unknown` na tela -- "este link nao vale mais" -- e nao
 * `error`. Ver o docblock de `verificationOutcome`.
 */
export function verificationTokenFrom(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length !== VERIFICATION_TOKEN_LENGTH) return null;
  return /^[0-9a-f]+$/.test(t) ? t : null;
}
