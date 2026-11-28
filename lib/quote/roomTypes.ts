/**
 * Scope from floor plans: a community's room types (name, care type, rooms,
 * sensors per room) and an allowance for site conditions. When a community
 * has room types, its beds and additional sensors come from them:
 *
 *   sensors from the plan = Σ rooms × sensors per room
 *   allowance             = ⌈plan × allowance %⌉
 *   total sensors         = plan + allowance
 *   additional sensors    = total − residents   (one sensor per resident is included)
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
  /**
   * Residents in each room of this type (1 when missing): a companion suite or semi-private room has 2. Each resident
   * is a billed bed; the room still gets one Edge unit (its other residents' sensors are additional sensors).
   */
  residents?: number;
  /**
   * Edge units in each room of this type (1 when missing). Edge units are dedicated to a resident room (never shared)
   * and one handles up to 3 sensors. Counted for the scope and Teton's hardware; the customer's price stays per room.
   */
  edges?: number;
  /** Size of each room of this type, in square feet (optional; recorded only, not used in any calculation yet). */
  sqft?: number;
  /** Sensors in each room of this type (one per room or living area a resident uses). */
  sensors: number;
  /** E-Call pendants / pull-cords in each room of this type (the residents when missing). Billing is per resident. */
  pendants?: number;
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
  /** Edge units in this room when it differs from its room type (a per-room override). */
  edges?: number;
  /** Residents (billed beds) in this room when it differs from its room type (e.g. one companion room). */
  residents?: number;
  /** Sensors in this room when it differs from its room type. */
  sensors?: number;
  /** This room's size in square feet when it differs from its room type (recorded only). */
  sqft?: number;
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
    const edges = m.edges != null && Number.isFinite(Number(m.edges)) ? Math.min(MAX_EDGES, Math.max(1, Math.round(Number(m.edges)))) : null;
    const res = m.residents != null && Number.isFinite(Number(m.residents)) ? Math.min(MAX_RESIDENTS, Math.max(1, Math.round(Number(m.residents)))) : null;
    const sen = m.sensors != null && Number.isFinite(Number(m.sensors)) ? Math.min(20, Math.max(1, Math.round(Number(m.sensors)))) : null;
    const sqft = sqftOf(m.sqft);
    return [{ id: typeof m.id === 'string' && m.id ? m.id.slice(0, 40) : `mk-${i}`, plan, page: Math.min(500, Math.max(1, Math.round(Number(m.page) || 1))), x: num01(m.x), y: num01(m.y), ...(label ? { label } : {}), ...(by ? { by } : {}), ...(at ? { at } : {}), ...(edges != null ? { edges } : {}), ...(res != null ? { residents: res } : {}), ...(sen != null ? { sensors: sen } : {}), ...(sqft != null ? { sqft } : {}) }];
  });
  return out.length ? out : undefined;
}

export const DEFAULT_ALLOWANCE = 0.03;
const CARES: CareType[] = ['il', 'al', 'mc', 'snf', 'custom'];
const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

/** A size in square feet (1 to 100,000, whole feet), or null when missing. */
export const sqftOf = (v: unknown): number | null => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 1 ? Math.min(100000, Math.round(Number(v))) : null);
/** One room's size: its own, else its room type's (null: not recorded). */
export const markSqft = (t: Pick<RoomType, 'sqft'>, m: Pick<RoomMark, 'sqft'>) => sqftOf(m.sqft) ?? sqftOf(t.sqft);

/** Residents in each room of a type (1 to 6; 1 when missing). */
export const residentsOf = (t: Pick<RoomType, 'residents'>) => Math.min(6, Math.max(1, Math.round(Number(t.residents) || 1)));
export const MAX_RESIDENTS = 6;
/** Edge units in each room of a type (1 to 3; 1 when missing). */
export const MAX_EDGES = 3;
export const edgesOf = (t: Pick<RoomType, 'edges'>) => Math.min(MAX_EDGES, Math.max(1, Math.round(Number(t.edges) || 1)));
/** One room's Edge units: its own override, else its room type's. */
export const markEdges = (t: Pick<RoomType, 'edges'>, m: Pick<RoomMark, 'edges'>) => (m.edges != null ? Math.min(MAX_EDGES, Math.max(1, m.edges)) : edgesOf(t));
/** One Edge unit handles up to this many sensors. */
export const SENSORS_PER_EDGE = 3;
/** One room's residents (billed beds): its own override, else its room type's. */
export const markResidents = (t: Pick<RoomType, 'residents'>, m: Pick<RoomMark, 'residents'>) => (m.residents != null ? Math.min(MAX_RESIDENTS, Math.max(1, m.residents)) : residentsOf(t));
/** One room's sensors: its own override, else its room type's. */
export const markSensors = (t: Pick<RoomType, 'sensors'>, m: Pick<RoomMark, 'sensors'>) => (m.sensors != null ? Math.max(1, m.sensors) : Math.max(1, Number(t.sensors) || 1));
/** Whether a tagged room has any count of its own (residents, sensors or Edge units). */
export const markOverridden = (m: Pick<RoomMark, 'residents' | 'sensors' | 'edges'> & { sqft?: number }) => m.residents != null || m.sensors != null || m.edges != null || m.sqft != null;
/** A room type's residents: rooms × residents per room, adjusted by its tagged rooms' own counts. */
export const typeResidents = (t: Pick<RoomType, 'rooms' | 'residents' | 'marks'>) =>
  Math.max(0, (Number(t.rooms) || 0) * residentsOf(t) + (t.marks ?? []).reduce((s, m) => s + (m.residents != null ? markResidents(t, m) - residentsOf(t) : 0), 0));
/** A room type's sensors: rooms × sensors per room, adjusted by its tagged rooms' own counts. */
export const typeSensors = (t: Pick<RoomType, 'rooms' | 'sensors' | 'marks'>) =>
  Math.max(0, (Number(t.rooms) || 0) * Math.max(1, Number(t.sensors) || 1) + (t.marks ?? []).reduce((s, m) => s + (m.sensors != null ? markSensors(t, m) - Math.max(1, Number(t.sensors) || 1) : 0), 0));
/** A room type's Edge units: rooms × Edge units per room, adjusted by its tagged rooms' own overrides. */
export const typeEdges = (t: Pick<RoomType, 'rooms' | 'edges' | 'marks'>) =>
  Math.max(0, (Number(t.rooms) || 0) * edgesOf(t) + (t.marks ?? []).reduce((s, m) => s + (m.edges != null ? markEdges(t, m) - edgesOf(t) : 0), 0));

export function normalizeRoomTypes(v: unknown): RoomType[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((x, i) => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Partial<RoomType>;
    // A room's own Edge count only when it differs from its type's.
    // A room's own counts only where they differ from its type's.
    const typeSen = Math.max(1, int(r.sensors ?? 1, 20));
    const marks = normalizeMarks(r.marks)?.map((m) => {
      const out: RoomMark = { ...m };
      if (out.edges != null && out.edges === edgesOf(r)) delete out.edges;
      if (out.residents != null && out.residents === residentsOf(r)) delete out.residents;
      if (out.sensors != null && out.sensors === typeSen) delete out.sensors;
      if (out.sqft != null && out.sqft === sqftOf(r.sqft)) delete out.sqft;
      return out;
    });
    const fromPlan = r.roomsFromPlan === true;
    const initials = String(r.initials ?? '').replace(/\s+/g, '').slice(0, 3).toUpperCase();
    return [{
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `rt-${i}`,
      name: String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      care: CARES.includes(r.care as CareType) ? (r.care as CareType) : 'al',
      // Locked to the floor plan: one room per tagged badge.
      rooms: fromPlan ? (marks?.length ?? 0) : int(r.rooms, 5000),
      ...(residentsOf(r) > 1 ? { residents: residentsOf(r) } : {}),
      ...(edgesOf(r) > 1 ? { edges: edgesOf(r) } : {}),
      ...(sqftOf(r.sqft) != null ? { sqft: sqftOf(r.sqft)! } : {}),
      sensors: Math.max(1, int(r.sensors ?? 1, 20)),
      ...(r.pendants != null && Math.max(1, int(r.pendants, 20)) !== residentsOf(r) ? { pendants: Math.max(1, int(r.pendants, 20)) } : {}),
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
  /** Rooms: one Edge unit each (monitored room types). */
  rooms: number;
  /** Residents (billed beds): rooms × residents per room. */
  residents: number;
  /** Edge units: rooms × Edge units per room, with per-room overrides. */
  edges: number;
  planSensors: number;
  allowance: number;
  totalSensors: number;
  additionalSensors: number;
  beds: Record<'il' | 'al' | 'mc' | 'snf', number>;
}

export function roomScope(types: RoomType[], allowancePct: number): RoomScope {
  const rooms = types.reduce((s, t) => s + t.rooms, 0);
  const residents = types.reduce((s, t) => s + typeResidents(t), 0);
  const edges = types.reduce((s, t) => s + typeEdges(t), 0);
  const planSensors = types.reduce((s, t) => s + typeSensors(t), 0);
  // Rounded to 4 places first, so 3% of 200 stays 6 rather than tipping to 7 on floating-point noise.
  const allowance = Math.ceil(Math.round(planSensors * allowancePct * 1e4) / 1e4);
  const totalSensors = planSensors + allowance;
  const beds = { il: 0, al: 0, mc: 0, snf: 0 } as Record<'il' | 'al' | 'mc' | 'snf', number>;
  // Custom care types count as assisted living beds (every bed is priced the same).
  // Each resident is a bed (and has one sensor included); further sensors are additional.
  types.forEach((t) => (beds[bedKeyOf(t)] += typeResidents(t)));
  // One sensor per resident is included (with the room's Edge unit); every other sensor, the contingency included, is an
  // additional sensor.
  return { rooms, residents, edges, planSensors, allowance, totalSensors, additionalSensors: Math.max(0, totalSensors - residents), beds };
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

/**
 * A community's common area sensors when it has common areas tagged on a floor plan: their sensors plus the extra
 * (0 while common area sensors are off the deal). Null when none is tagged: the count is typed in.
 */
export function commonAreaFromPlan(c: Pick<DraftCommunity, 'commonAreas' | 'commonAreaSensorsExtra' | 'commonAreaOff'>): number | null {
  const areas = normalizeCommonAreas(c.commonAreas);
  if (!areasTagged(areas)) return null;
  if (c.commonAreaOff) return 0;
  return areaSensors(areas) + Math.max(0, Math.round(Number(c.commonAreaSensorsExtra) || 0));
}

/**
 * A community's common area sensors, split for display: from the spaces tagged on the plan, the extra on top of them,
 * and a count typed in (no spaces tagged). Full-facility coverage and common area sensors off the deal count none.
 */
export function caSensorScope(c: Pick<DraftCommunity, 'commonAreas' | 'commonAreaSensors' | 'commonAreaSensorsExtra' | 'commonAreaOff' | 'coverage'>) {
  const none = { total: 0, tagged: 0, extra: 0, typed: 0, areas: [] as CommonArea[] };
  if (c.coverage === 'full_facility' || c.commonAreaOff) return none;
  const total = Math.max(0, Math.round(Number(c.commonAreaSensors) || 0));
  const all = normalizeCommonAreas(c.commonAreas);
  if (!areasTagged(all)) return { ...none, total, typed: total };
  const areas = all.filter((a) => a.count > 0 && (a.sensors ?? 0) > 0);
  const tagged = Math.min(total, areaSensors(areas));
  return { total, tagged, extra: total - tagged, typed: 0, areas };
}

/** A community with its beds and additional sensors set from its room types (unchanged when it has none). */
export function applyRoomTypes(c: DraftCommunity): DraftCommunity {
  if (c.commonAreas !== undefined) {
    const areas = normalizeCommonAreas(c.commonAreas);
    const { commonAreas: _a, ...rest } = c;
    c = areas.length ? { ...rest, commonAreas: areas } : (rest as DraftCommunity);
  }
  // Common area sensors from the tagged common areas (+ extra), when there are any.
  const ca = commonAreaFromPlan(c);
  if (ca != null && ca !== (Number(c.commonAreaSensors) || 0)) c = { ...c, commonAreaSensors: ca };
  const r = roomDerived(c);
  if (!r) return c;
  return { ...c, roomTypes: r.types, ilBeds: r.beds.il, alBeds: r.beds.al, mcBeds: r.beds.mc, snfBeds: r.beds.snf, additionalSensors: r.additionalSensors };
}

/** E-Call pendants / pull-cords in each room of this type: none when its care setting has no E-Call (or the deal has none). */
/** What an E-Call device is called on a deal: pendants (Bluetooth) or pull-cords (Inovonics). */
export const devicesLabel = (ecall: 'none' | 'ble' | 'inovonics') => (ecall === 'inovonics' ? 'Pull-cords' : 'Pendants');

export const pendantsPerRoom = (t: Pick<RoomType, 'care' | 'pendants' | 'residents'>, p?: CareProducts | null, ecallOn = true) =>
  ecallOn && (!p || p[bedKeyOf(t)].ecall) ? Math.max(1, Number(t.pendants) || residentsOf(t)) : 0;

/**
 * A community's Edge units: its monitored room types' rooms × Edge units per room (with per-room overrides); without
 * room types, one per monitored bed. Teton's hardware and the scope count these; the customer's price is per room.
 */
export function communityEdges(c: Partial<DraftCommunity> | null | undefined): number {
  if (!c) return 0;
  const types = normalizeRoomTypes(c.roomTypes);
  const p = productsOf(c);
  if (types.length) return roomScope(types.filter((t) => p[bedKeyOf(t)].monitoring), 0).edges;
  const beds = { il: Number(c.ilBeds) || 0, al: Number(c.alBeds) || 0, mc: Number(c.mcBeds) || 0, snf: Number(c.snfBeds) || 0 };
  return (['il', 'al', 'mc', 'snf'] as const).reduce((s, k) => s + (p[k].monitoring ? beds[k] : 0), 0);
}

/**
 * Residents beyond the first in each room of a community's monitored room types (shared rooms): they are billed beds
 * but share their room's Edge unit. `monitoredEcall`: those whose care setting also has E-Call; `priced`: in any room
 * with a product (one installation finish per room).
 */
export function sharedResidents(c: Partial<DraftCommunity> | null | undefined, ecallOn = true): { monitored: number; monitoredEcall: number; priced: number } {
  const out = { monitored: 0, monitoredEcall: 0, priced: 0 };
  if (!c) return out;
  const p = productsOf(c);
  for (const t of normalizeRoomTypes(c.roomTypes)) {
    const k = bedKeyOf(t);
    const extra = typeResidents(t) - t.rooms;
    if (p[k].monitoring || (ecallOn && p[k].ecall)) out.priced += extra;
    if (!p[k].monitoring) continue;
    out.monitored += extra;
    if (ecallOn && p[k].ecall) out.monitoredEcall += extra;
  }
  return out;
}

// ---------- Common areas (E-Call only for now): shared spaces with pull-cords, billed per area, per month ----------
export type AreaKind = 'bathroom' | 'activity' | 'dining' | 'hallway' | 'lobby' | 'other';
export const AREA_KINDS: Record<AreaKind, string> = { bathroom: 'Bathroom', activity: 'Activity', dining: 'Dining', hallway: 'Hallway', lobby: 'Lobby', other: 'Other' };
export interface CommonArea {
  id: string;
  name: string;
  kind: AreaKind;
  /** How many areas like this (a space tagged on a floor plan is one). */
  count: number;
  /** Pendants / pull-cords in each. */
  pendants: number;
  /** Common area sensors in each (the Common area sensors product). */
  sensors?: number;
  /** Where it's tagged on a floor plan (Scope Mode's common areas layer); none: typed in. */
  mark?: AreaMark;
  note?: string;
}
/** A common area's place on a floor plan page (0–1 across and down, like room badges). */
export interface AreaMark {
  plan: number;
  page: number;
  x: number;
  y: number;
}
/** Short marker text for a kind of common area. */
export const AREA_ABBR: Record<AreaKind, string> = { bathroom: 'BTH', activity: 'ACT', dining: 'DIN', hallway: 'HAL', lobby: 'LOB', other: 'OTH' };
export const newCommonArea = (): CommonArea => ({ id: `ca-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: '', kind: 'bathroom', count: 1, pendants: 1 });
const markOf = (m: unknown): AreaMark | null => {
  if (!m || typeof m !== 'object') return null;
  const x = m as Partial<AreaMark>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const out = { plan: n(x.plan), page: n(x.page), x: n(x.x), y: n(x.y) };
  if (!Number.isInteger(out.plan) || !Number.isInteger(out.page) || out.page < 1 || !(out.x >= 0 && out.x <= 1) || !(out.y >= 0 && out.y <= 1)) return null;
  return out;
};
/** Common area sensors over a community's areas (Σ sensors × how many). */
export const areaSensors = (areas: CommonArea[]) => areas.reduce((s, a) => s + (a.sensors ?? 0) * a.count, 0);
/** Whether a community has common areas tagged on a floor plan (its common area sensors then come from them). */
export const areasTagged = (areas: CommonArea[]) => areas.some((a) => a.mark);

export function normalizeCommonAreas(v: unknown): CommonArea[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((x, i) => {
    if (!x || typeof x !== 'object') return [];
    const a = x as Partial<CommonArea>;
    return [{
      id: typeof a.id === 'string' && a.id ? a.id.slice(0, 40) : `ca-${i}`,
      name: String(a.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      kind: (a.kind && a.kind in AREA_KINDS ? a.kind : 'other') as AreaKind,
      count: markOf(a.mark) ? 1 : int(a.count ?? 1, 500),
      pendants: int(a.pendants ?? 1, 20),
      ...(int(a.sensors ?? 0, 50) > 0 ? { sensors: int(a.sensors ?? 0, 50) } : {}),
      ...(markOf(a.mark) ? { mark: markOf(a.mark)! } : {}),
      ...(typeof a.note === 'string' && a.note.trim() ? { note: a.note.trim().slice(0, 400) } : {}),
    }];
  });
}

export const DEFAULT_PENDANT_ALLOWANCE = 0.05;
export const normalizePendantAllowance = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0.5 ? v : DEFAULT_PENDANT_ALLOWANCE);

/** A community's E-Call devices: in its rooms, in its common areas, and the contingency on both. */
export interface PendantScope {
  /** Rooms with E-Call. */
  rooms: number;
  /** Residents in those rooms (billed per resident; the rooms when every room has one). */
  residents: number;
  roomPendants: number;
  /** Common areas with pull-cords (each billed per month). */
  areas: number;
  areaPendants: number;
  plan: number;
  allowance: number;
  total: number;
}
/**
 * E-Call devices for a community: Σ rooms × pendants per room over its room types with E-Call (one per E-Call bed
 * when it has no room types), plus its common areas, plus the contingency (plan × %, rounded up). All zero when the
 * deal has no E-Call or the community has none.
 */
export function pendantScope(c: Partial<DraftCommunity> | null | undefined, ecallOn: boolean): PendantScope {
  const zero = { rooms: 0, residents: 0, roomPendants: 0, areas: 0, areaPendants: 0, plan: 0, allowance: 0, total: 0 };
  if (!ecallOn || !c) return zero;
  const p = productsOf(c);
  const types = normalizeRoomTypes(c.roomTypes);
  let rooms = 0;
  let residents = 0;
  let roomPendants = 0;
  if (types.length) {
    for (const t of types) {
      const n = pendantsPerRoom(t, p);
      if (!n) continue;
      rooms += t.rooms;
      residents += typeResidents(t);
      // Devices follow each room's residents unless the room type sets its own number.
      roomPendants += t.pendants != null ? t.rooms * n : typeResidents(t);
    }
  } else {
    const beds = { il: Number(c.ilBeds) || 0, al: Number(c.alBeds) || 0, mc: Number(c.mcBeds) || 0, snf: Number(c.snfBeds) || 0 };
    rooms = (['il', 'al', 'mc', 'snf'] as const).reduce((s, k) => s + (p[k].ecall ? beds[k] : 0), 0);
    roomPendants = rooms;
    residents = rooms;
  }
  if (!rooms && !(['il', 'al', 'mc', 'snf'] as const).some((k) => p[k].ecall)) return zero;
  const live = normalizeCommonAreas(c.commonAreas).filter((a) => a.count > 0 && a.pendants > 0);
  const areas = live.reduce((s, a) => s + a.count, 0);
  const areaPendants = live.reduce((s, a) => s + a.count * a.pendants, 0);
  const plan = roomPendants + areaPendants;
  const allowance = Math.ceil(Math.round(plan * normalizePendantAllowance(c.pendantAllowancePct) * 1e4) / 1e4);
  return { rooms, residents, roomPendants, areas, areaPendants, plan, allowance, total: plan + allowance };
}

/** How E-Call is billed monthly: per room (each common area with a device counts as a room) or per device. */
export type EcallBilling = 'room' | 'device';

/**
 * E-Call units billed for a community: per room, each resident in a room with E-Call (one per room unless rooms are
 * shared) plus the common areas with devices, and every device beyond that count as a one-time additional device; per
 * device, every device (before the contingency). `perRoom`: count rooms, not residents (equipment purchase, where each
 * room's base package includes one device).
 */
export function ecallBilled(ps: Pick<PendantScope, 'rooms' | 'areas' | 'plan'> & { residents?: number }, billing: EcallBilling = 'room', perRoom = false): { monthly: number; extra: number } {
  if (billing === 'device') return { monthly: ps.plan, extra: 0 };
  const monthly = ps.plan > 0 ? (perRoom ? ps.rooms : (ps.residents ?? ps.rooms)) + ps.areas : 0;
  return { monthly, extra: Math.max(0, ps.plan - monthly) };
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
