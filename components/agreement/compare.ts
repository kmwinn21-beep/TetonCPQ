/** Compare two rounds as they read with their changes accepted: paragraph by paragraph, words marked. */
import type { Paragraph } from '@/lib/agreement/docx';
import { lcs, norm, words } from '@/lib/agreement/diff';

export const acceptedTextOf = (ps: Paragraph[]) =>
  ps.map((p) => p.segments.filter((s) => s.kind !== 'del').map((s) => s.text).join('')).filter((t) => norm(t));

export interface CompareRow {
  changed: boolean;
  left: Array<{ text: string; del?: boolean }>;
  right: Array<{ text: string; ins?: boolean }>;
}

function wordsRow(a: string, b: string): CompareRow {
  const x = words(a);
  const y = words(b);
  const pairs = lcs(x, y, (p, q) => p === q);
  const left: CompareRow['left'] = [];
  const right: CompareRow['right'] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [x.length, y.length] as [number, number]]) {
    if (pi > i) left.push({ text: x.slice(i, pi).join(''), del: true });
    if (pj > j) right.push({ text: y.slice(j, pj).join(''), ins: true });
    if (pi < x.length) left.push({ text: x[pi] });
    if (pj < y.length) right.push({ text: y[pj] });
    i = pi + 1;
    j = pj + 1;
  }
  return { changed: norm(a) !== norm(b), left, right };
}

export function compareRounds(a: string[], b: string[]): CompareRow[] {
  const pairs = lcs(a, b, (x, y) => norm(x) === norm(y));
  const rows: CompareRow[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    const ga = a.slice(i, pi);
    const gb = b.slice(j, pj);
    for (let k = 0; k < Math.max(ga.length, gb.length); k++) {
      if (k >= gb.length) rows.push({ changed: true, left: [{ text: ga[k], del: true }], right: [] });
      else if (k >= ga.length) rows.push({ changed: true, left: [], right: [{ text: gb[k], ins: true }] });
      else rows.push(wordsRow(ga[k], gb[k]));
    }
    if (pi < a.length) rows.push({ changed: false, left: [{ text: a[pi] }], right: [{ text: b[pj] }] });
    i = pi + 1;
    j = pj + 1;
  }
  return rows;
}
