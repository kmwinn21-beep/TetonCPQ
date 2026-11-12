/**
 * Read-only presentation of a community for the Communities list: the one-line
 * summary, the chips that flag anything not at the deal's defaults, what's
 * missing, and the shared value of a field across a bulk selection.
 */
import { bedsOf, type DraftCommunity } from './draft';

/** What a community still needs before a version can be saved. */
export function communityProblems(c: Partial<DraftCommunity> | undefined): string[] {
  const out: string[] = [];
  if (!c?.name?.trim()) out.push('Needs a name');
  if (bedsOf(c as DraftCommunity) <= 0) out.push('No beds');
  return out;
}

export const communityIsValid = (c: Partial<DraftCommunity> | undefined) => communityProblems(c).length === 0;

/** "AL 10 · MC 19" — the care types that have beds. */
export function bedMix(c: Partial<DraftCommunity> | undefined): string {
  if (!c) return '';
  return (
    [
      ['IL', c.ilBeds],
      ['AL', c.alBeds],
      ['MC', c.mcBeds],
      ['SNF', c.snfBeds],
    ] as const
  )
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join(' · ');
}

/** "2027-05" → "May 2027". */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export type ChipTone = 'green' | 'purple' | 'yellow' | 'gray' | 'red';
export interface Chip {
  label: string;
  tone: ChipTone;
  /** Pilot chips carry a flag icon. */
  pilot?: boolean;
}

export interface DealContext {
  /** The deal has a pilot phase. */
  withPilot: boolean;
  /** The deal sells an e-call add-on. */
  ecallOn: boolean;
}

/** Badges for a list row, in the order they're shown. Problems come first. */
export function communityChips(c: Partial<DraftCommunity> | undefined, deal: DealContext): Chip[] {
  if (!c) return [];
  const chips: Chip[] = communityProblems(c).map((label) => ({ label, tone: 'red' as const }));
  if (deal.withPilot && c.pilot) chips.push({ label: c.pilotUnits ? `Pilot · ${c.pilotUnits} beds` : 'Pilot', tone: 'green', pilot: true });
  if (c.coverage === 'full_facility') chips.push({ label: 'Full facility', tone: 'purple' });
  if (deal.ecallOn && c.ecall === false) chips.push({ label: 'No E-Call', tone: 'yellow' });
  if (c.occupancy != null) chips.push({ label: `Occ ${Number((c.occupancy * 100).toFixed(1))}%`, tone: 'yellow' });
  if (c.roiDelayMonths != null) chips.push({ label: `Delay ${c.roiDelayMonths} mo`, tone: 'yellow' });
  if (Number(c.additionalSensors) > 0) chips.push({ label: `${c.additionalSensors} sensors`, tone: 'gray' });
  return chips;
}

/** The value every selected community shares, or MIXED when they differ. */
export const MIXED = Symbol('mixed');
export function sharedValue<T>(values: T[]): T | typeof MIXED | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((v) => v === first) ? first : MIXED;
}

/** Display order of list rows (indices into the communities array; the data itself is never reordered). */
export type SortKey = 'entered' | 'golive' | 'name';
export function sortedIndices(rows: Array<Partial<DraftCommunity> | undefined>, sort: SortKey): number[] {
  const idx = rows.map((_, i) => i);
  if (sort === 'name') return idx.sort((a, b) => (rows[a]?.name ?? '').localeCompare(rows[b]?.name ?? '') || a - b);
  if (sort === 'golive') {
    // Communities without a date keep their entered order, after the dated ones.
    const key = (i: number) => rows[i]?.goLiveMonth || '9999-99';
    return idx.sort((a, b) => key(a).localeCompare(key(b)) || a - b);
  }
  return idx;
}
