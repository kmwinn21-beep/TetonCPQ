/**
 * Staggered go-live dates: communities go live in batches of `perBatch`,
 * `monthsBetween` months apart, starting `firstMonth` ('yyyy-mm'), in the
 * order given. When the count doesn't divide evenly, the leftover
 * communities form a final, smaller batch at the next increment, so they
 * get the furthest date.
 *
 *   13 communities, 3 per batch, every 3 months from 2027-03:
 *   2027-03 ×3, 2027-06 ×3, 2027-09 ×3, 2027-12 ×3, 2028-03 ×1
 */

export interface StaggerOptions {
  firstMonth: string;
  monthsBetween: number;
  perBatch: number;
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Go-live month for each of `count` communities, in order. */
export function staggerGoLives(count: number, o: StaggerOptions): string[] {
  const per = Math.max(1, Math.floor(o.perBatch));
  const gap = Math.max(0, Math.floor(o.monthsBetween));
  return Array.from({ length: Math.max(0, count) }, (_, i) => addMonthsYm(o.firstMonth, Math.floor(i / per) * gap));
}

export interface Batch {
  month: string;
  indices: number[];
}

/** The same schedule grouped by date, for previews. */
export function staggerBatches(order: number[], o: StaggerOptions): Batch[] {
  const months = staggerGoLives(order.length, o);
  const batches: Batch[] = [];
  months.forEach((m, k) => {
    const last = batches[batches.length - 1];
    if (last && last.month === m) last.indices.push(order[k]);
    else batches.push({ month: m, indices: [order[k]] });
  });
  return batches;
}

/** Pilot sites first (keeping their relative order), then everyone else. */
export function pilotFirstOrder(pilot: boolean[]): number[] {
  const idx = pilot.map((_, i) => i);
  return [...idx.filter((i) => pilot[i]), ...idx.filter((i) => !pilot[i])];
}
