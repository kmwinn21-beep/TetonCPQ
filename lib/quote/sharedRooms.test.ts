import { describe, expect, it } from 'vitest';
import { runModel, runVendorView } from '@/lib/model';
import { priceBook } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';
import { buildPriceLines } from '@/lib/pricing/lines';
import { computeFinish } from '@/lib/pricing/finish';
import { allProducts, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from './draft';
import { ecallBilled, normalizeRoomTypes, pendantScope, roomScope, sharedResidents, type RoomType } from './roomTypes';
import { toModelInputs } from './toModelInputs';

// 90 single studios + 8 companion suites (2 residents, 2 sensors each).
const TYPES: RoomType[] = [
  { id: 'a', name: 'Studio', care: 'al', rooms: 90, sensors: 1 },
  { id: 'b', name: 'AL Companion suite', care: 'al', rooms: 8, residents: 2, sensors: 2 },
];

function deal(types: RoomType[], ecall: 'none' | 'ble' = 'none'): QuoteDraft {
  const d = defaultDraft('Shared SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.commercial.ecall = ecall;
  d.schedule.withPilot = false;
  d.communities = [{ ...newCommunity(0), name: 'Maple Grove', alBeds: 1, products: allProducts({ monitoring: true, ecall: ecall !== 'none' }), roomTypes: types, sensorAllowancePct: 0 }];
  return normalizeDraft(d);
}

describe('rooms with more than one resident', () => {
  it('keeps residents (and pendants that differ from them) when normalizing', () => {
    const t = normalizeRoomTypes([
      { id: 'a', name: 'Suite', care: 'al', rooms: 4, residents: 2, sensors: 2, pendants: 2 },
      { id: 'b', name: 'Suite, one pendant', care: 'al', rooms: 4, residents: 2, sensors: 2, pendants: 1 },
      { id: 'c', name: 'Single', care: 'al', rooms: 4, residents: 1, sensors: 1 },
      { id: 'd', name: 'Too many', care: 'al', rooms: 1, residents: 40, sensors: 1 },
    ]);
    expect(t[0]).toMatchObject({ residents: 2 });
    expect(t[0].pendants).toBeUndefined(); // the default: one per resident
    expect(t[1]).toMatchObject({ residents: 2, pendants: 1 });
    expect(t[2].residents).toBeUndefined();
    expect(t[3].residents).toBe(6);
  });

  it('bills every resident, gives each room one Edge unit, and includes one sensor per resident', () => {
    const s = roomScope(TYPES, 0);
    expect(s).toMatchObject({ rooms: 98, residents: 106, planSensors: 106, additionalSensors: 0 });
    expect(roomScope([{ ...TYPES[1], sensors: 3 }], 0).additionalSensors).toBe(8); // a 3rd sensor per suite is additional
    expect(s.beds.al).toBe(106);
    const d = deal(TYPES);
    expect(d.communities[0]).toMatchObject({ alBeds: 106, additionalSensors: 0 });
    expect(sharedResidents(d.communities[0])).toMatchObject({ monitored: 8, priced: 8 });
  });

  it('charges the monthly fee per resident and installation per Edge unit', () => {
    const d = deal(TYPES);
    const m = toModelInputs(d);
    expect(m.communities[0]).toMatchObject({ units: 106, edgeUnits: 98, additionalSensors: 0, sensorHardware: 8 });
    const lines = buildPriceLines(d, m, priceBook());
    expect(lines.find((l) => l.description.startsWith('Teton subscription'))?.qty).toBe(106);
    expect(lines.find((l) => l.description.startsWith('Installation'))?.qty).toBe(98);
    // Same one-time charges as 98 single rooms: the 2nd resident's sensor is included.
    const r = runModel(m);
    const single = runModel(toModelInputs(deal([{ ...TYPES[0], rooms: 98 }])));
    const k = d.commercial;
    expect(r.cashFlow.communities[0].installCost - single.cashFlow.communities[0].installCost).toBeCloseTo(0 * k.sensorPrice, 6);
  });

  it('puts hardware and install labor on Edge units in Teton\'s cost view', () => {
    const shared = runVendorView(toModelInputs(deal(TYPES)));
    const rooms = runVendorView(toModelInputs(deal([{ ...TYPES[0], rooms: 98 }])));
    expect(Math.max(...shared.hardware)).toBe(Math.max(...rooms.hardware));
  });

  it('equipment purchase: one base package per room, the 2nd resident\'s sensor included', () => {
    const c = computeCapex(deal(TYPES)).communities[0];
    expect(c.parts?.reduce((s, p) => s + p.beds, 0)).toBe(98);
    expect(c.sensors).toBe(0);
  });

  it('E-Call: billed per resident; equipment purchase buys the 2nd device as an extra', () => {
    const d = deal(TYPES, 'ble');
    const ps = pendantScope(d.communities[0], true);
    expect(ps).toMatchObject({ rooms: 98, residents: 106, roomPendants: 106 });
    expect(ecallBilled(ps, 'room')).toEqual({ monthly: 106, extra: 0 });
    expect(ecallBilled(ps, 'room', true)).toEqual({ monthly: 98, extra: 8 });
  });

  it('one installation finish per room', () => {
    const d = deal(TYPES);
    d.commercial.finish = { ...d.commercial.finish, on: true, low: 300, high: 600, credit: 0 } as never;
    expect(computeFinish(d).rooms).toBe(98);
  });

  it('changes nothing for single rooms', () => {
    const m = toModelInputs(deal([{ ...TYPES[0], rooms: 98 }]));
    expect(m.communities[0].edgeUnits).toBeUndefined();
  });
});
