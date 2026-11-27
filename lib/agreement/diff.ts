/** Text comparison for agreement rounds (no Word parsing: safe to use in the browser). */
export const words = (s: string) => s.split(/(\s+)/).filter((x) => x !== '');

/** Longest-common-subsequence alignment of two token lists: pairs of [i, j] that match. */
export function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return []; // too big to compare: treat as all changed
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Word-level differences between two versions of a paragraph. */
export function wordDiff(a: string, b: string): Array<{ deleted: string; inserted: string; before: string; after: string }> {
  const x = words(a);
  const y = words(b);
  const pairs = lcs(x, y, (p, q) => p === q);
  const out: Array<{ deleted: string; inserted: string; before: string; after: string }> = [];
  let i = 0;
  let j = 0;
  const push = (i2: number, j2: number) => {
    const del = x.slice(i, i2).join('');
    const ins = y.slice(j, j2).join('');
    if (norm(del) || norm(ins)) out.push({ deleted: del.trim(), inserted: ins.trim(), before: y.slice(Math.max(0, j - 12), j).join('').slice(-80), after: y.slice(j2, j2 + 12).join('').slice(0, 80) });
  };
  for (const [pi, pj] of pairs) {
    if (pi > i || pj > j) push(pi, pj);
    i = pi + 1;
    j = pj + 1;
  }
  if (i < x.length || j < y.length) push(x.length, y.length);
  return out;
}

