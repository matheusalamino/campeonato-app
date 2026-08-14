export function isMinor(birthDate: string | Date, asOf: Date = new Date()): boolean {
  const b = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  let age = asOf.getFullYear() - b.getFullYear();
  const m = asOf.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < b.getDate())) age--;
  return age < 18;
}
