/**
 * A base dos links que saem por e-mail.
 *
 * E a armadilha deste bloco: montada com a base errada, o link vai mandar o
 * jogador para o staging -- e ele nao tera como saber. Por isso a funcao
 * devolve `null` em vez de um palpite, e o dreno vai recusar enviar quando
 * receber `null`.
 */
export function siteUrlFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.origin;
}

export function linkTo(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
