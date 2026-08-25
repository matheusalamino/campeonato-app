import { createHash, timingSafeEqual } from "node:crypto";
import { DRAIN_ENDPOINT_METHOD } from "./post-action-drain";

/**
 * QUEM pode mandar o dreno rodar.
 *
 * ── POR QUE ISTO NAO MORA NA ROTA ──
 *
 * Porque `app/**` nao esta no `include` de `vitest.config.ts` -- que so alcanca
 * `lib/**`, `features/**` e `scripts/**` --, nenhum glob deste repo alcanca
 * `.test.tsx`, e nao ha job de teste no CI (`.github/workflows` so tem
 * `migrate.yml`). Este bloco ja mediu, quatro vezes, mutacao real atravessando
 * os cinco portoes inteiros com a regra escrita em `app/**` ou `services/**`:
 * a T6 mandou o token de verificacao EM CLARO para o Postgres e ficou verde.
 *
 * Uma comparacao de segredo escrita dentro de `route.ts` esta na mesma
 * situacao. Trocar `secretMatches(...)` por `true`, ou por `presented ===
 * expected` com o `expected` ausente lido como "nao ha segredo, entao passa",
 * abriria o dreno para a internet inteira sem acender nada.
 *
 * ── AS DUAS PORTAS ──
 *
 * 1. `CRON_SECRET`, que e como o cron da Vercel se identifica
 *    (`Authorization: Bearer <segredo>`). Vale em qualquer verbo.
 * 2. Uma sessao de ADMIN valida, e so no POST.
 *
 * A segunda porta e decisao consciente, e o argumento a favor esta escrito
 * porque o custo dela e real:
 *
 *  - O plano da Vercel e o Hobby, e nele o cron roda UMA VEZ POR DIA. Sem a
 *    segunda porta, o aviso de "pagamento conferido" -- que a pessoa esta
 *    esperando depois de ter pago -- demoraria ate um dia para sair.
 *  - Quem passa por ela ja e admin, e admin ja PODE enfileirar esse e-mail:
 *    marcar o pagamento dispara `trg_enqueue_payment_verified`. Drenar nao
 *    acrescenta capacidade nenhuma -- so antecipa o envio do que a fila ja
 *    tinha, para os destinatarios que a fila ja tinha determinado.
 *  - O gasto e limitado pela cota diaria, que o proprio dreno confere
 *    (`countSentSince`, guarda 3 de `decideSend`).
 *
 * O que ela amplia e a superficie: passa a haver um segundo jeito de acionar um
 * endpoint que gasta cota e manda e-mail que nao volta atras. O estreitamento
 * escolhido foi o VERBO -- ver o docblock de `DRAIN_ENDPOINT_METHOD`, que
 * explica o que isso fecha e o que continua aberto.
 */

export type DrainDoor = "cron" | "admin";

export type DrainAccess =
  | { allowed: true; door: DrainDoor }
  | { allowed: false; status: number; error: string };

/** O que a rota responde a quem nao passou por nenhuma das duas portas. */
export const DRAIN_REFUSAL = { status: 401, error: "Não autorizado" } as const;

/**
 * O segredo apresentado no cabecalho, ou `null`.
 *
 * `Bearer` sem distinguir maiuscula porque o esquema de autorizacao e
 * case-insensitive por RFC 7235, e nao ha ganho nenhum em recusar `bearer`.
 */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const achado = /^bearer[ \t]+(\S.*)$/i.exec(authorization.trim());
  return achado ? achado[1].trim() : null;
}

/**
 * Compara em TEMPO CONSTANTE, e a forma tem uma armadilha que custou desenho.
 *
 * `crypto.timingSafeEqual` LEVANTA quando os buffers tem tamanhos diferentes:
 * `RangeError: Input buffers must have the same byte length`. Numa rota, isso e
 * um 500 -- ou seja, um segredo do tamanho errado se distingue de um segredo do
 * tamanho certo pela RESPOSTA, que e o vazamento que a comparacao em tempo
 * constante existe para nao ter.
 *
 * A correcao obvia -- conferir o tamanho antes e devolver `false` -- conserta o
 * 500 e VAZA O TAMANHO DO SEGREDO pelo tempo. O jeito certo e comparar os
 * DIGESTOS: `sha256` devolve 32 bytes para qualquer entrada, entao
 * `timingSafeEqual` nunca levanta e o tamanho da entrada nao muda o caminho
 * percorrido.
 *
 * ── AUSENTE RECUSA, E ESTA E A LINHA QUE MAIS IMPORTA ──
 *
 * `CRON_SECRET` nao configurado RECUSA. Nunca "autoriza porque nao ha segredo
 * para conferir": e exatamente assim que um endpoint de cron nasce aberto num
 * ambiente novo, onde a variavel ainda nao foi preenchida -- e um ambiente novo
 * e justamente onde ninguem esta olhando. O bloco C ja pagou essa conta uma vez,
 * com a cota de capacidade que nascia desligada em todo ambiente novo (A6).
 *
 * Branco conta como ausente: `CRON_SECRET=" "` sobrevive a um `!expected` e nao
 * e segredo nenhum.
 */
export function secretMatches(
  presented: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!presented) return false;
  if (!expected || expected.trim() === "") return false;
  const a = createHash("sha256").update(presented, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export type DrainAccessInput = {
  /** O verbo da requisicao. So `DRAIN_ENDPOINT_METHOD` abre a porta de admin. */
  method: string;
  /** O cabecalho `Authorization` cru, como veio. */
  authorization: string | null | undefined;
  /** `process.env.CRON_SECRET`, sem tratamento. */
  cronSecret: string | null | undefined;
  /**
   * A sessao de admin, PREGUICOSA de proposito.
   *
   * Confirmar admin custa duas idas ao Postgres (`auth.getUser` e o `role` do
   * perfil). O disparo do cron -- que e a maioria esmagadora das chamadas --
   * nao deve pagar por elas, e um `boolean` ja resolvido obrigaria a rota a
   * pagar sempre. Que esta funcao NAO chame quando o segredo confere tem
   * assertiva propria.
   */
  isAdmin: () => Promise<boolean>;
};

/**
 * O veredito: passou por qual porta, ou o que responder a quem nao passou.
 *
 * A ordem e a barata primeiro. Ela tambem e a ordem de PRIVILEGIO: quem traz o
 * segredo do cron nunca depende de sessao nenhuma, entao o cron continua
 * rodando mesmo com o Postgres de autenticacao fora do ar.
 */
export async function drainAccess(input: DrainAccessInput): Promise<DrainAccess> {
  if (secretMatches(bearerToken(input.authorization), input.cronSecret)) {
    return { allowed: true, door: "cron" };
  }
  if (input.method === DRAIN_ENDPOINT_METHOD && (await input.isAdmin())) {
    return { allowed: true, door: "admin" };
  }
  // 401 e nao 403 nos dois casos: quem chega sem segredo e sem sessao nao esta
  // proibido, esta nao identificado -- e responder 403 a um segredo errado
  // confirmaria que a rota existe e que o formato do cabecalho estava certo.
  return { allowed: false, ...DRAIN_REFUSAL };
}
