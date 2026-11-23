/**
 * Scope work (room types tagged on the floor plans, and the beds and sensors they set) measured per community,
 * so the app can say what a change would save or throw away ("42 rooms tagged in Test Community"), and carried
 * from one draft to another (keep the scope, discard the rest).
 */
import type { QuoteDraft } from './draft';
import { normalizeRoomTypes, roomDerived } from './roomTypes';

/** The parts of a community that Scope Mode (and the drawer's room type cards) change. */
export const SCOPE_FIELDS = ['roomTypes', 'sensorAllowancePct', 'commonAreas', 'pendantAllowancePct', 'ilBeds', 'alBeds', 'mcBeds', 'snfBeds', 'additionalSensors'] as const;

export interface CommunityScope {
  id: string;
  name: string;
  /** Rooms tagged on the floor plans. */
  tagged: number;
  /** Rooms in its room types (what's priced). */
  rooms: number;
  /** Sensors (monitored care settings, with the allowance). */
  sensors: number;
}

export function scopeOf(c: QuoteDraft['communities'][number] | undefined, i = 0): CommunityScope {
  const types = normalizeRoomTypes(c?.roomTypes);
  const d = c ? roomDerived(c) : null;
  return {
    id: c?.id ?? '',
    name: c?.name?.trim() || `Community ${i + 1}`,
    tagged: types.reduce((s, t) => s + (t.marks?.length ?? 0), 0),
    rooms: d?.all.rooms ?? 0,
    sensors: d?.monitored.totalSensors ?? 0,
  };
}

/** Communities whose scope differs between two drafts, with what changed. */
export function scopeChanges(before: QuoteDraft | null | undefined, after: QuoteDraft | null | undefined) {
  const prev = new Map((before?.communities ?? []).map((c, i) => [c.id, scopeOf(c, i)]));
  return (after?.communities ?? [])
    .map((c, i) => {
      const now = scopeOf(c, i);
      const was = prev.get(c.id) ?? { ...now, tagged: 0, rooms: 0, sensors: 0 };
      return { ...now, dTagged: now.tagged - was.tagged, dRooms: now.rooms - was.rooms, dSensors: now.sensors - was.sensors };
    })
    .filter((x) => x.dTagged || x.dRooms || x.dSensors);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
/** "42 rooms tagged (+38) · 205 sensors (+40) in Test Community" — one community's change in words. */
export function describeScope(x: ReturnType<typeof scopeChanges>[number]): string {
  const bits = [`${x.tagged} room${x.tagged === 1 ? '' : 's'} tagged${x.dTagged ? ` (${signed(x.dTagged)})` : ''}`];
  if (x.dRooms && x.rooms !== x.tagged) bits.push(`${x.rooms} rooms (${signed(x.dRooms)})`);
  if (x.dSensors) bits.push(`${x.sensors} sensors (${signed(x.dSensors)})`);
  return `${bits.join(' · ')} in ${x.name}`;
}

/** `target` with the scope of each community (by id) taken from `from`: keep the scope work, drop the rest. */
export function carryScope(target: QuoteDraft, from: QuoteDraft): QuoteDraft {
  const src = new Map(from.communities.map((c) => [c.id, c]));
  return {
    ...target,
    communities: target.communities.map((c) => {
      const s = src.get(c.id);
      if (!s) return c;
      const out: Record<string, unknown> = { ...c };
      for (const k of SCOPE_FIELDS) out[k] = (s as unknown as Record<string, unknown>)[k];
      return out as unknown as typeof c;
    }),
  };
}
