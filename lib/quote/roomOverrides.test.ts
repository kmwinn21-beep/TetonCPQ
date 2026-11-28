import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { priceBook } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';
import { buildPriceLines } from '@/lib/pricing/lines';
import { allProducts, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from './draft';
import { markResidents, markSensors, normalizeRoomTypes, pendantScope, roomScope, sharedResidents, typeResidents, typeSensors, type RoomMark, type RoomType } from './roomTypes';
import { toModelInputs } from './toModelInputs';

const mk = (id: string, o: Partial<RoomMark> = {}): RoomMark => ({ id, plan: 1, page: 1, x: 0.1, y: 0.1, ...o });
// 17 one-bedrooms tagged on the plan; room 214 is a companion room (2 residents, 2 sensors).
const marks = Array.from({ length: 17 }, (_, i) => mk(`m${i}`, i === 0 ? { label: '214', residents: 2, sensors: 2 } : {}));
const ONE_BED: RoomType = { id: 'a', name: 'One Bedroom', care: 'al', rooms: 17, sensors: 1, marks, roomsFromPlan: true };

function deal(types: RoomType[], ecall: 'none' | 'ble' = 'none'): QuoteDraft {
  const d = defaultDraft('Override SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.commercial.ecall = ecall;
  d.schedule.withPilot = false;
  d.communities = [{ ...newCommunity(0), name: 'Benton House', alBeds: 1, products: allProducts({ monitoring: true, ecall: ecall !== 'none' }), roomTypes: types, sensorAllowancePct: 0 }];
  return normalizeDraft(d);
}
const plain = { ...ONE_BED, marks: marks.map(({ residents: _r, sensors: _s, ...m }) => m) };

describe('one room set on its own (residents and sensors)', () => {
  it('keeps a room\'s own counts only where they differ from its room type', () => {
    const [t] = normalizeRoomTypes([{ ...ONE_BED, residents: 1, marks: [mk('x', { residents: 2, sensors: 2 }), mk('y', { residents: 1, sensors: 1 }), mk('z', { residents: 40, sensors: 99 })] }]);
    expect(t.marks?.map((m) => [m.residents, m.sensors])).toEqual([[2, 2], [undefined, undefined], [6, 20]]);
  });

  it('counts the room\'s residents and sensors in the room type totals', () => {
    const t = normalizeRoomTypes([ONE_BED])[0];
    expect(markResidents(t, t.marks![0])).toBe(2);
    expect(markSensors(t, t.marks![0])).toBe(2);
    expect(typeResidents(t)).toBe(18);
    expect(typeSensors(t)).toBe(18);
    // 17 rooms, 18 residents, 18 sensors: one per resident is included, so none is additional.
    expect(roomScope([t], 0)).toMatchObject({ rooms: 17, residents: 18, edges: 17, planSensors: 18, additionalSensors: 0, beds: { al: 18 } });
    // A 3rd sensor in room 214 would be additional.
    expect(roomScope([{ ...t, marks: t.marks!.map((m, i) => (i ? m : { ...m, sensors: 3 })) }], 0).additionalSensors).toBe(1);
  });

  it('bills the extra resident (their sensor is included); installation stays per room', () => {
    const [one, base] = [deal([ONE_BED]), deal([plain])];
    expect(one.communities[0]).toMatchObject({ alBeds: 18, additionalSensors: 0 });
    expect(sharedResidents(one.communities[0]).monitored).toBe(1);
    const m = toModelInputs(one);
    expect(m.communities[0]).toMatchObject({ units: 18, edgeUnits: 17, additionalSensors: 0 });
    const lines = buildPriceLines(one, m, priceBook());
    expect(lines.find((l) => l.description.startsWith('Teton subscription'))?.qty).toBe(18);
    expect(lines.find((l) => l.description.startsWith('Installation'))?.qty).toBe(17);
    const k = one.commercial;
    expect(runModel(m).cashFlow.communities[0].installCost - runModel(toModelInputs(base)).cashFlow.communities[0].installCost).toBeCloseTo(0 * k.sensorPrice, 6);
    // Equipment purchase: still one base package per room; the extra resident's sensor is included.
    const cx = computeCapex(one).communities[0];
    expect(cx.parts?.reduce((s, p) => s + p.beds, 0)).toBe(17);
    expect(cx.sensors).toBe(0);
  });

  it('gives the room\'s extra resident a pendant of their own (E-Call billed per resident)', () => {
    const ps = pendantScope(deal([ONE_BED], 'ble').communities[0], true);
    expect(ps).toMatchObject({ rooms: 17, residents: 18, roomPendants: 18 });
  });
});
