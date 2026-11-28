import { monitors, productsOf, scopeOf, type QuoteDraft } from '@/lib/quote/draft';
import { bedKeyOf, caSensorScope, communityEdges, normalizeRoomTypes, pendantScope, typeResidents, type RoomType } from '@/lib/quote/roomTypes';

/** A care setting's column key and short name: AL, MC, IL, SNF, or a custom setting's initials. */
export function careColumn(t: Pick<RoomType, 'care' | 'customCare'>): { key: string; label: string } {
  if (t.care !== 'custom') return { key: t.care, label: t.care.toUpperCase() };
  const label = (t.customCare?.trim() || 'Custom').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return { key: `custom:${label}`, label };
}

export type CommunityScopeRow = {
  id: string;
  name: string;
  /** Rooms by care setting (column key). */
  units: Record<string, number>;
  totalUnits: number;
  /** Residents (a shared room counts each resident). */
  beds: number;
  /** One sensor included per resident, the additional sensors (allowance included), common area sensors. Null: no Resident Monitoring. */
  sensors: { included: number; additional: number; commonArea: number; total: number } | null;
  edge: number | null;
  /** E-Call devices (pendants or pull-cords), allowance included. Null: no E-Call. */
  devices: number | null;
};

/**
 * The Scope page's table by community: units by care setting, beds, sensors (with their make-up), Edge units and
 * E-Call devices. `roomsOnly` leaves common areas out (their sensors and devices).
 */
export function scopeByCommunity(draft: QuoteDraft, opts: { roomsOnly?: boolean } = {}) {
  const ecallOn = draft.commercial.ecall !== 'none';
  const cares = new Map<string, string>();
  const rows: CommunityScopeRow[] = [];
  for (const c of draft.communities) {
    const p = productsOf(c);
    const pend = pendantScope(c, ecallOn);
    const mon = monitors(c);
    const types = normalizeRoomTypes(c.roomTypes).filter((t) => p[bedKeyOf(t)].monitoring || (ecallOn && p[bedKeyOf(t)].ecall));
    if (!types.length && !mon && pend.total <= 0) continue;
    const units: Record<string, number> = {};
    let totalUnits = 0;
    let beds = 0;
    for (const t of types) {
      const col = careColumn(t);
      cares.set(col.key, col.label);
      units[col.key] = (units[col.key] ?? 0) + t.rooms;
      totalUnits += t.rooms;
      beds += typeResidents(t);
    }
    if (!types.length) {
      // No room types (beds typed in): the beds stand in for the rooms, by care setting.
      const s = scopeOf(c, ecallOn);
      for (const k of ['il', 'al', 'mc', 'snf'] as const) {
        const n = s.pricedByCare[k];
        if (n > 0) {
          cares.set(k, k.toUpperCase());
          units[k] = (units[k] ?? 0) + n;
        }
      }
      totalUnits = s.priced;
      beds = s.priced;
    }
    let sensors: CommunityScopeRow['sensors'] = null;
    if (mon) {
      const included = scopeOf(c).monitored;
      const additional = Math.max(0, Number(c.additionalSensors) || 0);
      const commonArea = opts.roomsOnly ? 0 : caSensorScope(c).total;
      sensors = { included, additional, commonArea, total: included + additional + commonArea };
    }
    const devices = pend.total > 0 ? Math.max(0, pend.total - (opts.roomsOnly ? pend.areaPendants : 0)) : null;
    rows.push({ id: c.id, name: c.name, units, totalUnits, beds, sensors, edge: mon ? communityEdges(c) : null, devices });
  }
  const order = ['il', 'al', 'mc', 'snf'];
  const careCols = [...cares.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99) || a.label.localeCompare(b.label));
  const sumOf = (f: (r: CommunityScopeRow) => number | null | undefined) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const anySensors = rows.some((r) => r.sensors);
  const anyDevices = rows.some((r) => r.devices != null);
  const total: Omit<CommunityScopeRow, 'id' | 'name'> = {
    units: Object.fromEntries(careCols.map((col) => [col.key, sumOf((r) => r.units[col.key])])),
    totalUnits: sumOf((r) => r.totalUnits),
    beds: sumOf((r) => r.beds),
    sensors: anySensors
      ? { included: sumOf((r) => r.sensors?.included), additional: sumOf((r) => r.sensors?.additional), commonArea: sumOf((r) => r.sensors?.commonArea), total: sumOf((r) => r.sensors?.total) }
      : null,
    edge: anySensors ? sumOf((r) => r.edge) : null,
    devices: anyDevices ? sumOf((r) => r.devices) : null,
  };
  return { careCols, rows, total, anySensors, anyDevices, anyCommonArea: rows.some((r) => (r.sensors?.commonArea ?? 0) > 0) };
}
