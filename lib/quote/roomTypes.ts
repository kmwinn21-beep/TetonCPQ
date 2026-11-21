/**
 * Scope from floor plans: a community's room types (name, care type, rooms,
 * sensors per room) and an allowance for site conditions. When a community
 * has room types, its beds and additional sensors come from them:
 *
 *   sensors from the plan = Σ rooms × sensors per room
 *   allowance             = ⌈plan × allowance %⌉
 *   total sensors         = plan + allowance
 *   additional sensors    = total − rooms   (the first sensor in each room is in the base package)
 *   beds by care type     = Σ rooms of that care type
 */
import { productsOf, type BedKey, type BedProducts, type DraftCommunity } from './draft';

export type CareType = 'il' | 'al' | 'mc' | 'snf' | 'custom';
export const CARE_LABEL: Record<CareType, string> = { il: 'Independent living', al: 'Assisted living', mc: 'Memory care', snf: 'Skilled nursing', custom: 'Custom…' };
export const CARE_SHORT: Record<CareType, string> = { il: 'Independent living', al: 'Assisted living', mc: 'Memory care', snf: 'Skilled nursing', custom: 'Custom' };
/** A room type's care label: the rep's own for a custom care type. */
export const careLabel = (t: Pick<RoomType, 'care' | 'customCare'>) => (t.care === 'custom' ? t.customCare?.trim() || 'Custom' : CARE_SHORT[t.care]);

export interface RoomType {
  id: string;
  name: string;
  care: CareType;
  rooms: number;
  /** Sensors in each room of this type (one per room or living area a resident uses). */
  sensors: number;
  /** The care type's name when care is 'custom' (its rooms count as assisted living beds). */
  customCare?: string;
  /** Badge color (one of BADGE_COLORS) and initials (up to 3 characters) for its badges on the floor plans. */
  color?: string;
  initials?: string;
  /** Rooms tagged on the floor plans (Scope Mode), one badge each. */
  marks?: RoomMark[];
  /** Rooms = the number of tagged rooms (locked). Off or missing: rooms are typed in (an override when there are marks). */
  roomsFromPlan?: boolean;
}

/** One tagged room: where its badge sits on a floor plan page (0–1 across and down the page as shown). */
export interface RoomMark {
  id: string;
  /** The floor plan file's id. */
  plan: number;
  /** 1-based page of a PDF (1 for an image). */
  page: number;
  x: number;
  y: number;
  /** Room number, e.g. "143" (optional). */
  label?: string;
  /** Who tagged it and when (ISO date), for the hover card. */
  by?: string;
  at?: string;
}

const normName = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/** What must be unique among a community's room types: the name (ignoring case and extra spaces) within a care setting. */
export const roomTypeKey = (t: Pick<RoomType, 'name' | 'care' | 'customCare'>) => `${t.care === 'custom' ? `custom:${normName(t.customCare)}` : t.care}|${normName(t.name)}`;

/** Room types that repeat an earlier one's name in the same care setting (blank names aside): id → the earlier one. */
export function duplicateRoomTypes(types: RoomType[]): Map<string, RoomType> {
  const seen = new Map<string, RoomType>();
  const out = new Map<string, RoomType>();
  for (const t of types) {
    if (!normName(t.name)) continue;
    const k = roomTypeKey(t);
    const first = seen.get(k);
    if (first) out.set(t.id, first);
    else seen.set(k, t);
  }
  return out;
}

/** Badge colors, in the order new room types take them. */
export const BADGE_COLORS = ['#3F6FD8', '#2E9E6B', '#E0782B', '#8E5BD6', '#D64B7A', '#1F9BB0', '#9A7B2F', '#5B6472'] as const;

const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', single: '1', double: '2' };
/** Badge initials from a name: "One Bedroom" → "1B", "Studio" → "ST", "Companion Suite" → "CS". */
export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => NUMBER_WORDS[w.toLowerCase()] ?? w[0])
    .join('')
    .toUpperCase();
}

/** A room type's badge initials and color (filled in when it has none: initials from the name, color by its place). */
export const badgeOf = (t: Pick<RoomType, 'name' | 'initials' | 'color'>, index: number) => ({
  initials: (t.initials?.trim() || initialsOf(t.name || 'Room type')).slice(0, 3),
  color: t.color && (BADGE_COLORS as readonly string[]).includes(t.color) ? t.color : BADGE_COLORS[index % BADGE_COLORS.length],
});

/** The first badge color no room type uses yet. */
export const nextBadgeColor = (types: Array<Pick<RoomType, 'name' | 'initials' | 'color'>>) => {
  const used = new Set(types.map((t, i) => badgeOf(t, i).color));
  return BADGE_COLORS.find((c) => !used.has(c)) ?? BADGE_COLORS[types.length % BADGE_COLORS.length];
};

/** Tagged rooms whose floor plan still exists (all of them when the list of plans isn't known). */
export const liveMarks = (t: Pick<RoomType, 'marks'>, planIds?: number[]) => (t.marks ?? []).filter((m) => !planIds || planIds.includes(m.plan));

const num01 = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));
function normalizeMarks(v: unknown): RoomMark[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.slice(0, 3000).flatMap((x, i) => {
    if (!x || typeof x !== 'object') return [];
    const m = x as Partial<RoomMark>;
    const plan = Math.round(Number(m.plan));
    if (!Number.isFinite(plan) || plan <= 0) return [];
    const label = String(m.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
    const by = String(m.by ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const at = /^\d{4}-\d{2}-\d{2}/.test(String(m.at ?? '')) ? String(m.at).slice(0, 10) : '';
    return [{ id: typeof m.id === 'string' && m.id ? m.id.slice(0, 40) : `mk-${i}`, plan, page: Math.min(500, Math.max(1, Math.round(Number(m.page) || 1))), x: num01(m.x), y: num01(m.y), ...(label ? { label } : {}), ...(by ? { by } : {}), ...(at ? { at } : {}) }];
  });
  return out.length ? out : undefined;
}

export const DEFAULT_ALLOWANCE = 0.03;
const CARES: CareType[] = ['il', 'al', 'mc', 'snf', 'custom'];
const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

export function normalizeRoomTypes(v: unknown): RoomType[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((x, i) => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Partial<RoomType>;
    const marks = normalizeMarks(r.marks);
    const fromPlan = r.roomsFromPlan === true;
    const initials = String(r.initials ?? '').replace(/\s+/g, '').slice(0, 3).toUpperCase();
    return [{
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `rt-${i}`,
      name: String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      care: CARES.includes(r.care as CareType) ? (r.care as CareType) : 'al',
      // Locked to the floor plan: one room per tagged badge.
      rooms: fromPlan ? (marks?.length ?? 0) : int(r.rooms, 5000),
      sensors: Math.max(1, int(r.sensors ?? 1, 20)),
      ...(r.care === 'custom' ? { customCare: String(r.customCare ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) } : {}),
      ...(typeof r.color === 'string' && (BADGE_COLORS as readonly string[]).includes(r.color) ? { color: r.color } : {}),
      ...(initials ? { initials } : {}),
      ...(marks ? { marks } : {}),
      ...(fromPlan ? { roomsFromPlan: true } : {}),
    }];
  });
}

export const normalizeAllowance = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0.5 ? v : DEFAULT_ALLOWANCE);

export interface RoomScope {
  rooms: number;
  planSensors: number;
  allowance: number;
  totalSensors: number;
  additionalSensors: number;
  beds: Record<'il' | 'al' | 'mc' | 'snf', number>;
}

export function roomScope(types: RoomType[], allowancePct: number): RoomScope {
  const rooms = types.reduce((s, t) => s + t.rooms, 0);
  const planSensors = types.reduce((s, t) => s + t.rooms * t.sensors, 0);
  // Rounded to 4 places first, so 3% of 200 stays 6 rather than tipping to 7 on floating-point noise.
  const allowance = Math.ceil(Math.round(planSensors * allowancePct * 1e4) / 1e4);
  const totalSensors = planSensors + allowance;
  const beds = { il: 0, al: 0, mc: 0, snf: 0 } as Record<'il' | 'al' | 'mc' | 'snf', number>;
  // Custom care types count as assisted living beds (every bed is priced the same).
  types.forEach((t) => (beds[bedKeyOf(t)] += t.rooms));
  return { rooms, planSensors, allowance, totalSensors, additionalSensors: Math.max(0, totalSensors - rooms), beds };
}

/** The care type a room type's beds count as (custom care types count as assisted living). */
export const bedKeyOf = (t: Pick<RoomType, 'care'>): BedKey => (t.care === 'custom' ? 'al' : t.care);

/** The products on each care type of a community (productsOf). */
export type CareProducts = Record<BedKey, BedProducts>;
/** Sensors in each room of this type: none when its care setting has no resident monitoring. */
export const sensorsPerRoom = (t: Pick<RoomType, 'care' | 'sensors'>, p?: CareProducts | null) => (!p || p[bedKeyOf(t)].monitoring ? Math.max(1, Number(t.sensors) || 1) : 0);
/** Whether this type's rooms are priced at all (its care setting has some product). */
export const isPriced = (t: Pick<RoomType, 'care'>, p?: CareProducts | null) => !p || p[bedKeyOf(t)].monitoring || p[bedKeyOf(t)].ecall;

/** The room types whose care type has resident monitoring: only they get Edge units and sensors. */
export const monitoredTypes = (types: RoomType[], c: Partial<DraftCommunity> | null | undefined) => {
  const p = productsOf(c);
  return types.filter((t) => p[bedKeyOf(t)].monitoring);
};

/**
 * What a community's room types set: beds by care type (every room type) and additional sensors
 * (monitored room types only). Null when it has no room types.
 */
export function roomDerived(c: Partial<DraftCommunity>, pct = normalizeAllowance(c.sensorAllowancePct)) {
  const types = normalizeRoomTypes(c.roomTypes);
  if (!types.length) return null;
  const all = roomScope(types, pct);
  const mon = roomScope(monitoredTypes(types, c), pct);
  return { types, beds: all.beds, additionalSensors: mon.additionalSensors, all, monitored: mon };
}

/** A community with its beds and additional sensors set from its room types (unchanged when it has none). */
export function applyRoomTypes(c: DraftCommunity): DraftCommunity {
  const r = roomDerived(c);
  if (!r) return c;
  return { ...c, roomTypes: r.types, ilBeds: r.beds.il, alBeds: r.beds.al, mcBeds: r.beds.mc, snfBeds: r.beds.snf, additionalSensors: r.additionalSensors };
}

export const newRoomType = (): RoomType => ({ id: `rt-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: '', care: 'al', rooms: 0, sensors: 1 });

/** A room number used by more than one tagged room. */
export interface DuplicateNumber {
  label: string;
  marks: Array<{ id: string; plan: number; page: number; typeId: string }>;
}
/**
 * Room numbers entered on two or more tagged rooms (ignoring case and spaces), in the order they first appear.
 * Only tags on these plans count when the list of plans is given.
 */
export function duplicateRoomNumbers(types: Array<Pick<RoomType, 'id' | 'marks'>>, planIds?: number[]): DuplicateNumber[] {
  const by = new Map<string, DuplicateNumber>();
  for (const t of types)
    for (const m of t.marks ?? []) {
      const label = (m.label ?? '').replace(/\s+/g, '').toUpperCase();
      if (!label || (planIds && !planIds.includes(m.plan))) continue;
      const d = by.get(label) ?? { label: m.label!.trim(), marks: [] };
      d.marks.push({ id: m.id, plan: m.plan, page: m.page, typeId: t.id });
      by.set(label, d);
    }
  return [...by.values()].filter((d) => d.marks.length > 1);
}
