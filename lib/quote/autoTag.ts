/**
 * Auto-tag (Scope Mode): tag every room whose number is printed inside a box drawn on a floor plan.
 *
 * The numbers come from the plan's reader (`readRoomNumbers`: exact for PDFs with text, OCR for scans). Here:
 * which of them to tag (inside the box, not already tagged), the fill color around each one (plans with a
 * color legend), grouping them by that color, and the legend's name for each color when the plan has text.
 */
import type { PlanLabel, PlanPageLabels } from './roomNumbers';
import { BADGE_COLORS, type CareType, type RoomMark } from './roomTypes';

export type RGB = [number, number, number];
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface AutoFound extends PlanLabel {
  id: string;
  color: RGB | null;
  group: string;
}
export interface AutoGroup {
  key: string;
  color: RGB | null;
  /** The legend's name for this color, when the plan has one. */
  name: string | null;
  count: number;
}

/** A tagged room counts as already there when it's this close to a number (fraction of the page width). */
const NEAR = 0.018;

/** The numbers inside the box that aren't tagged yet (by number on this plan, or by a tag right at the spot). */
export function labelsToTag(lp: PlanPageLabels, box: Box, existing: Array<Pick<RoomMark, 'x' | 'y' | 'label'>>, takenLabels: Set<string>): PlanLabel[] {
  const inBox = lp.labels.filter((l) => l.x >= box.x0 && l.x <= box.x1 && l.y >= box.y0 && l.y <= box.y1);
  const seen = new Set<string>();
  return inBox.filter((l) => {
    if (takenLabels.has(l.t) || seen.has(l.t)) return false;
    if (existing.some((m) => Math.hypot(m.x - l.x, (m.y - l.y) * lp.aspect) < NEAR)) return false;
    seen.add(l.t);
    return true;
  });
}

/** A colored fill (not paper white, not ink or wall lines). */
export const isFill = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 120 && lum < 247 && (max - min > 14 || lum < 232);
};

/** The fill around a number: the median of the colored samples, or null when the room isn't colored. */
export function fillOf(samples: Array<RGB | null>): RGB | null {
  const fills = samples.filter((s): s is RGB => !!s && isFill(s));
  if (fills.length < Math.max(2, Math.ceil(samples.length / 3))) return null;
  const med = (k: 0 | 1 | 2) => fills.map((f) => f[k]).sort((a, b) => a - b)[Math.floor(fills.length / 2)];
  return [med(0), med(1), med(2)];
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Groups the numbers by fill color (colors within `tol` of a group's average join it). Numbers without a color
 * form the group 'none'. Groups come largest first.
 */
export function groupByColor<T extends { color: RGB | null }>(items: T[], tol = 34): { items: Array<T & { group: string }>; groups: Array<{ key: string; color: RGB | null; count: number }> } {
  const gs: Array<{ key: string; sum: RGB; n: number }> = [];
  const out = items.map((it) => {
    if (!it.color) return { ...it, group: 'none' };
    let best: (typeof gs)[number] | null = null;
    let bd = Infinity;
    for (const g of gs) {
      const avg: RGB = [g.sum[0] / g.n, g.sum[1] / g.n, g.sum[2] / g.n];
      const d = dist(avg, it.color);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    if (!best || bd > tol) {
      best = { key: `g${gs.length}`, sum: [0, 0, 0], n: 0 };
      gs.push(best);
    }
    best.sum = [best.sum[0] + it.color[0], best.sum[1] + it.color[1], best.sum[2] + it.color[2]];
    best.n += 1;
    return { ...it, group: best.key };
  });
  const groups = [
    ...gs.map((g) => ({ key: g.key, color: [Math.round(g.sum[0] / g.n), Math.round(g.sum[1] / g.n), Math.round(g.sum[2] / g.n)] as RGB, count: g.n })),
    ...(out.some((o) => o.group === 'none') ? [{ key: 'none', color: null, count: out.filter((o) => o.group === 'none').length }] : []),
  ].sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : b.count - a.count));
  return { items: out, groups };
}

/** A word on the plan (PDFs with text): its text, where it starts (0–1) and its height (0–1 of the page height). */
export interface PlanWord {
  str: string;
  x: number;
  y: number;
  h: number;
}

/**
 * The legend's name for each color group: a word whose swatch (sampled just left of it) matches the group's
 * color, printed on the paper (not inside a colored room). Words that are room numbers don't count.
 */
export function legendNames(words: Array<PlanWord & { swatch: RGB | null; bg?: RGB | null; beyond?: RGB | null }>, groups: Array<{ key: string; color: RGB | null }>, tol = 30): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) {
    if (!g.color) continue;
    let best: { name: string; d: number; h: number } | null = null;
    for (const w of words) {
      if (!w.swatch || !/[a-z]/i.test(w.str) || /^\d+$/.test(w.str.trim())) continue;
      // A legend sits on the paper: a word printed inside a colored room isn't one.
      if (w.bg && isFill(w.bg)) continue;
      // Its swatch is a small square with paper beyond it (not the edge of a long colored room).
      if (w.beyond && isFill(w.beyond) && dist(w.beyond, g.color) <= tol) continue;
      const d = dist(w.swatch, g.color);
      if (d > tol) continue;
      // Legends usually print larger than the labels in the rooms.
      if (!best || w.h > best.h * 1.05 || (w.h >= best.h * 0.95 && d < best.d)) best = { name: w.str.replace(/\s+/g, ' ').trim(), d, h: w.h };
    }
    if (best) out[g.key] = best.name.slice(0, 40);
  }
  return out;
}

/** Words in the box that aren't room numbers (shown as skipped): "Courtyard ×2". */
export function skippedWords(words: PlanWord[], box: Box, legend: Set<string>): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const w of words) {
    const s = w.str.replace(/\s+/g, ' ').trim();
    if (w.x < box.x0 || w.x > box.x1 || w.y < box.y0 || w.y > box.y1) continue;
    if (s.length < 3 || !/[a-z]{3}/i.test(s) || legend.has(s.toLowerCase()) || s.split(' ').length > 3) continue;
    const k = s.toLowerCase();
    const c = counts.get(k) ?? { label: s, n: 0 };
    c.n += 1;
    counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 14).map((c) => (c.n > 1 ? `${c.label} ×${c.n}` : c.label));
}

/** The badge color nearest a legend color (badges use a fixed palette). */
export function nearestBadge(c: RGB | null, used: string[] = []): string {
  const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pool = (BADGE_COLORS as readonly string[]).filter((h) => !used.includes(h));
  const list = pool.length ? pool : [...BADGE_COLORS];
  if (!c) return list[0];
  // Pale legend fills vs strong badges: compare hues; grays (no hue) go to the gray badge.
  const hue = ([r, g, b]: RGB) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx - mn < 24) return null;
    const d = mx - mn;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const th = hue(c);
  if (th == null) return list.find((h) => h === '#5B6472') ?? list[list.length - 1];
  const gap = (h: string) => {
    const x = hue(hex(h));
    if (x == null) return 999;
    const d = Math.abs(x - th);
    return Math.min(d, 360 - d);
  };
  return list.reduce((a, b) => (gap(a) <= gap(b) ? a : b));
}

/** A care setting guessed from a legend name ("Memory Care Neighborhood" → memory care). */
export function careFromName(name: string): CareType {
  if (/memory|\bmc\b/i.test(name)) return 'mc';
  if (/independent|\bil\b/i.test(name)) return 'il';
  if (/skilled|nursing|\bsnf\b/i.test(name)) return 'snf';
  return 'al';
}
