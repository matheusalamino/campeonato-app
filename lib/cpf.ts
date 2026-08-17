/** Keep only digits, capped at 11 characters. */
export function normalizeCpf(raw: string): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Validate a Brazilian CPF by its two check digits. */
export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all-same digits

  const digits = cpf.split("").map(Number);
  const checkDigit = (count: number): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += digits[i] * (count + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

/** Progressive mask: "529.982.247-25". Accepts partial input. */
export function formatCpf(raw: string): string {
  const d = normalizeCpf(raw);
  let out = d.slice(0, 3);
  if (d.length >= 4) out += "." + d.slice(3, 6);
  if (d.length >= 7) out += "." + d.slice(6, 9);
  if (d.length >= 10) out += "-" + d.slice(9, 11);
  return out;
}
