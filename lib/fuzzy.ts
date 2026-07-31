function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** True when every char of query appears in text in order (subsequence). */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return true;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return i === q.length;
}

/** Lower is better. Substring matches rank by position; subsequences are penalized. */
export function fuzzyRank(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return 0;

  const idx = t.indexOf(q);
  if (idx >= 0) return idx;

  // For subsequences, rank by span (smaller span = better rank)
  let i = 0;
  let firstPos = -1;
  let lastPos = -1;
  for (let ti = 0; ti < t.length && i < q.length; ti++) {
    if (t[ti] === q[i]) {
      if (firstPos === -1) firstPos = ti;
      lastPos = ti;
      i++;
    }
  }

  if (i === q.length && firstPos !== -1) {
    // Subsequence found, rank by span
    const span = lastPos - firstPos;
    return 1000 + span;
  }

  return 2000;
}
