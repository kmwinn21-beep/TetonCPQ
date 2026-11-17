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
import type { DraftCommunity } from './draft';

export type CareType = 'il' | 'al' | 'mc' | 'snf';
export const CARE_LABEL: Record<CareType, string> = { il: 'Independent living', al: 'Personal care / AL', mc: 'Memory care', snf: 'Skilled nursing' };
export const CARE_SHORT: Record<CareType, string> = { il: 'Independent living', al: 'Personal care', mc: 'Memory care', snf: 'Skilled nursing' };

export interface RoomType {
  id: string;
  name: string;
  care: CareType;
  rooms: number;
  /** Sensors in each room of this type (one per room or living area a resident uses). */
  sensors: number;
}

export const DEFAULT_ALLOWANCE = 0.03;
const CARES: CareType[] = ['il', 'al', 'mc', 'snf'];
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
  beds: Record<CareType, number>;
}

export function roomScope(types: RoomType[], allowancePct: number): RoomScope {
  const rooms = types.reduce((s, t) => s + t.rooms, 0);
  const planSensors = types.reduce((s, t) => s + t.rooms * t.sensors, 0);
  // Rounded to 4 places first, so 3% of 200 stays 6 rather than tipping to 7 on floating-point noise.
  const allowance = Math.ceil(Math.round(planSensors * allowancePct * 1e4) / 1e4);
  const totalSensors = planSensors + allowance;
  const beds = { il: 0, al: 0, mc: 0, snf: 0 } as Record<CareType, number>;
  types.forEach((t) => (beds[t.care] += t.rooms));
  return { rooms, planSensors, allowance, totalSensors, additionalSensors: Math.max(0, totalSensors - rooms), beds };
}

/** A community with its beds and additional sensors set from its room types (unchanged when it has none). */
export function applyRoomTypes(c: DraftCommunity): DraftCommunity {
  const types = normalizeRoomTypes(c.roomTypes);
  if (!types.length) return c;
  const s = roomScope(types, normalizeAllowance(c.sensorAllowancePct));
  return { ...c, roomTypes: types, ilBeds: s.beds.il, alBeds: s.beds.al, mcBeds: s.beds.mc, snfBeds: s.beds.snf, additionalSensors: s.additionalSensors };
}

export const newRoomType = (): RoomType => ({ id: `rt-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: '', care: 'al', rooms: 0, sensors: 1 });
