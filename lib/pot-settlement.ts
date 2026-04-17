/**
 * Regra 50% do saldo restante do pote (múltiplos de CC$ 1.000).
 * Paridade avaliada em milhares: CC$ 4.000 → multa CC$ 2.000; CC$ 3.000 → multa CC$ 1.000.
 */
export function computePotRemainderSettlement(remaining: number): {
  fine: number;
  returned: number;
} {
  if (remaining <= 0) {
    return { fine: 0, returned: 0 };
  }
  if (remaining % 1000 !== 0) {
    throw new Error("Saldo restante do pote deve ser múltiplo de CC$ 1.000");
  }
  const thousands = remaining / 1000;
  const fine =
    thousands % 2 === 0 ? remaining / 2 : (remaining - 1000) / 2;
  return { fine, returned: remaining - fine };
}
