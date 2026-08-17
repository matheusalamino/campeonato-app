/**
 * Extrai o IP de origem a partir dos headers de proxy, para uso como chave de
 * rate limit.
 *
 * `x-forwarded-for` e uma lista `cliente, proxy1, proxy2`: cada proxy anexa o
 * endereco que observou. O elemento mais a esquerda e o que o proprio cliente
 * mandou, entao usa-lo como chave nao limita nada — basta trocar o header a
 * cada requisicao para zerar o contador. O ultimo elemento e o que o proxy
 * imediatamente a frente observou, e e o unico que o cliente nao forja.
 *
 * Na Vercel o header e sobrescrito pela plataforma e traz um IP so, entao o
 * ultimo elemento coincide com o primeiro. Atras de qualquer outro proxy, ou
 * em self-hosted, a diferenca e o que separa um limite real de um decorativo.
 */
export function clientIpFrom(getHeader: (name: string) => string | null): string | null {
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }

  const real = getHeader("x-real-ip")?.trim();
  return real || null;
}
