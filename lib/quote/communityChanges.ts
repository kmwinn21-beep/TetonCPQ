/**
 * The deal's community list as one change from the proposal: added, removed
 * and edited communities, cleaned up the same way a saved draft is.
 */
import { bedsOf, normalizeCommunity, type DraftCommunity } from './draft';
import { applyRoomTypes } from './roomTypes';

export function normalizeCommunities(v: unknown): DraftCommunity[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is DraftCommunity => !!c && typeof c === 'object' && typeof (c as DraftCommunity).id === 'string')
    .map((c) => applyRoomTypes(normalizeCommunity(c)));
}

const LABELS: Partial<Record<keyof DraftCommunity, string>> = {
  name: 'name',
  city: 'city',
  monitoring: 'resident monitoring',
  market: 'state',
  ilBeds: 'IL beds',
  alBeds: 'AL beds',
  mcBeds: 'MC beds',
  snfBeds: 'SNF beds',
  coverage: 'coverage',
  ecall: 'E-Call',
  pilot: 'pilot',
  pilotUnits: 'pilot units',
  occupancy: 'occupancy',
  goLiveMonth: 'go-live',
  roiDelayMonths: 'ROI start',
  additionalSensors: 'additional sensors',
  roomTypes: 'room types',
  sensorAllowancePct: 'sensor allowance',
};

const nameOf = (c: DraftCommunity, i: number) => c.name.trim() || `community ${i + 1}`;

/** "added Oak Park (40 beds)", "removed Elm", "changed Forest Hills: AL beds, go-live". */
export function communitiesChanges(before: DraftCommunity[], after: DraftCommunity[]): string[] {
  const out: string[] = [];
  const was = new Map(before.map((c) => [c.id, c]));
  const now = new Set(after.map((c) => c.id));
  after.forEach((c, i) => {
    const old = was.get(c.id);
    if (!old) {
      out.push(`added ${nameOf(c, i)} (${bedsOf(c)} beds)`);
      return;
    }
    const keys = Array.from(new Set([...Object.keys(old), ...Object.keys(c)])) as Array<keyof DraftCommunity>;
    const changed = keys.filter((k) => JSON.stringify(old[k] ?? null) !== JSON.stringify(c[k] ?? null)).map((k) => LABELS[k]).filter(Boolean);
    if (changed.length) out.push(`changed ${nameOf(old, before.indexOf(old))}: ${Array.from(new Set(changed)).join(', ')}`);
  });
  before.forEach((c, i) => !now.has(c.id) && out.push(`removed ${nameOf(c, i)}`));
  return out;
}
