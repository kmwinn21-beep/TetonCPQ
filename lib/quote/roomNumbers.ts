/**
 * Room numbers read from a floor plan (OCR, in the browser) and matched to tagged rooms.
 *
 * Reading gives raw text at a spot; `cleanReads` turns that into room numbers: it learns the floor's pattern
 * (on a second floor almost every number is 2xx), drops stray numbers that don't fit it (an address line), and
 * repairs numbers the scan blurred ("13" three digits wide on a 2xx floor is 213), marking those as guesses.
 * `matchNumbers` gives each tag the closest number in reach, one number per tag, and says whether it's sure:
 * a clear read with no other number nearly as close. Only sure matches fill a room number by themselves.
 */

/** A number printed on a plan page. Positions are 0–1 across and down the page. */
export interface PlanLabel {
  t: string;
  x: number;
  y: number;
  /** Read clearly (not repaired). */
  sure: boolean;
}
export interface PlanPageLabels {
  /** Page height ÷ width (for distances). */
  aspect: number;
  labels: PlanLabel[];
}
/** What was read from a plan, by page (1-based). */
export interface PlanLabels {
  pages: Record<string, PlanPageLabels>;
  readAt: string;
}

/** One OCR result: the text, its confidence (0–100), where it is and how wide it is for its height. */
export interface RawRead {
  text: string;
  conf: number;
  x: number;
  y: number;
  ratio: number;
}

const CLEAR = 75;

export function cleanReads(raw: RawRead[]): PlanLabel[] {
  const reads = raw.map((r) => ({ ...r, text: r.text.replace(/\D/g, '') })).filter((r) => r.text.length);
  // The floor's pattern: first digits that clear 3-digit reads share (a page may hold more than one floor).
  const clear = reads.filter((r) => r.text.length === 3 && r.conf >= CLEAR);
  const counts = new Map<string, number>();
  for (const r of clear) counts.set(r.text[0], (counts.get(r.text[0]) ?? 0) + 1);
  const floors = [...counts.entries()].filter(([, n]) => n >= Math.max(2, clear.length * 0.15)).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  const fits = (t: string) => !floors.length || floors.includes(t[0]);

  const out: PlanLabel[] = [];
  for (const r of reads) {
    let t = r.text;
    let sure = r.conf >= CLEAR;
    if (t.length < 3) {
      // Three digits wide but read as fewer: this scan's thin serif "1"s run into their neighbours.
      if (r.ratio < 1.3 || !floors.length) continue;
      t = floors[0] + '1'.repeat(Math.max(0, 2 - t.length)) + t;
      sure = false;
    }
    if (t.length > 4 || !fits(t)) continue;
    out.push({ t, x: r.x, y: r.y, sure });
  }
  // The same number twice: keep the clear one (or the first).
  const best = new Map<string, PlanLabel>();
  for (const l of out) {
    const b = best.get(l.t);
    if (!b || (l.sure && !b.sure)) best.set(l.t, l);
  }
  return [...best.values()];
}

/** How far a tag can be from its number: a share of the page width. */
export const REACH = 0.045;
/** Another number this much further away or less makes the match a close call. */
const CLOSE_CALL = 1.35;

export interface Spot {
  id: string;
  x: number;
  y: number;
}
export interface NumberMatch {
  t: string;
  /** Fill it in by itself (clear read, no other number nearly as close). Otherwise only suggest it. */
  sure: boolean;
}

/**
 * The number each tag would take: the closest within reach, one tag per number (closest pairs first), skipping
 * numbers already given to a room (`taken`).
 */
export function matchNumbers(spots: Spot[], page: PlanPageLabels, taken: Set<string> = new Set()): Map<string, NumberMatch> {
  const free = page.labels.filter((l) => !taken.has(l.t));
  const dist = (s: Spot, l: PlanLabel) => Math.hypot(s.x - l.x, (s.y - l.y) * page.aspect);
  const pairs: Array<{ d: number; s: Spot; l: PlanLabel }> = [];
  for (const s of spots) for (const l of free) {
    const d = dist(s, l);
    if (d <= REACH) pairs.push({ d, s, l });
  }
  pairs.sort((a, b) => a.d - b.d);
  const out = new Map<string, NumberMatch>();
  const used = new Set<string>();
  for (const { d, s, l } of pairs) {
    if (out.has(s.id) || used.has(l.t)) continue;
    used.add(l.t);
    // A close call: another free number almost as near this tag.
    const rival = free.some((o) => o !== l && dist(s, o) <= Math.max(d * CLOSE_CALL, d + 0.004));
    out.set(s.id, { t: l.t, sure: l.sure && !rival });
  }
  return out;
}

/** After "Fill numbers from plan": 0 = a number read but not certain (to confirm), 1 = still blank, 2 = numbered. */
export const fillRank = (r: { label: string; suggest?: string }) => (r.label.trim() ? 2 : r.suggest ? 0 : 1);
/** Rows in the order to work through them after a fill: to confirm, then blank, then numbered (otherwise as they were). */
export function fillOrder<T extends { label: string; suggest?: string }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => fillRank(a.r) - fillRank(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

