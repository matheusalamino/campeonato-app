export function computeTicketsTotal(p: {
  basePrice: number | null;
  extraTicketPrice: number | null;
  extraTicketsCount: number;
}): number {
  const base = p.basePrice ?? 0;
  const extra = p.extraTicketPrice ?? 0;
  const count = Math.max(0, Math.floor(p.extraTicketsCount || 0));
  return base + extra * count;
}
