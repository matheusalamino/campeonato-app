/**
 * Resolve the display/sort year for a championship.
 * Prefers a 4-digit 20xx year found in the free-text season,
 * falling back to the created_at year, then 0.
 */
export function parseSeasonYear(
  season?: string | null,
  createdAt?: string | null,
): number {
  if (season) {
    const match = season.match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
  }
  if (createdAt) {
    const year = new Date(createdAt).getFullYear();
    if (!Number.isNaN(year)) return year;
  }
  return 0;
}
