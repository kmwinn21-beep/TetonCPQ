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
import { productsOf, type BedKey, type DraftCommunity } from './draft';

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
}

export const DEFAULT_ALLOWANCE = 0.03;
const CARES: CareType[] = ['il', 'al', 'mc', 'snf', 'custom'];
const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

export function normalizeRoomTypes(v: unknown): RoomType[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((x, i) => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Partial<RoomType>;
    return [{
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `rt-${i}`,
      name: String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      care: CARES.includes(r.care as CareType) ? (r.care as CareType) : 'al',
      rooms: int(r.rooms, 5000),
      sensors: Math.max(1, int(r.sensors ?? 1, 20)),
      ...(r.care === 'custom' ? { customCare: String(r.customCare ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) } : {}),
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
