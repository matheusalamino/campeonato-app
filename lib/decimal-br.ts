/**
 * Le um decimal aceitando o formato brasileiro.
 *
 * O formulario publico usa `inputMode="decimal"`, que no teclado brasileiro
 * oferece virgula. Sem esta normalizacao, `Number("70,5")` da NaN e a inscricao
 * e reprovada com uma mensagem generica — foi assim que o campo de peso passou
 * a barrar jogadores enquanto o de altura, que ja convertia, funcionava.
 *
 * Devolve null quando nao ha numero, para quem chama decidir a mensagem.
 */
export function parseDecimalBR(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // Com virgula decimal, o ponto so pode ser separador de milhar.
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
