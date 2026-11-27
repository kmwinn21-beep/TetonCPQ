import { describe, expect, it } from 'vitest';
import { applyRoomTypes, caSensorScope, commonAreaFromPlan, normalizeCommonAreas, devicesLabel, type CommonArea } from './roomTypes';
import { allProducts, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from './draft';
import { applyChoices, choicesOf } from './products';
import { priceBook, SKU } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';
import { DEFAULT_LINEUP, effectiveCommercial, LINEUP_SCHEMA, normalizeLineup, removedRoles, sameLineup, type Lineup } from '@/lib/pricing/lineup';

const book = priceBook();
const mark = (page = 1, x = 0.5, y = 0.5) => ({ plan: 7, page, x, y });
const tagged: CommonArea[] = [
  { id: 'd', name: 'Main dining', kind: 'dining', count: 1, pendants: 0, sensors: 4, mark: mark() },
  { id: 'l', name: 'Lobby', kind: 'lobby', count: 1, pendants: 1, sensors: 2, mark: mark(1, 0.2, 0.3) },
  { id: 'b', name: 'Spa bath', kind: 'bathroom', count: 1, pendants: 2, mark: mark(2) },
];

describe('common areas tagged on the floor plans', () => {
  it('normalizes: a tagged area counts once; sensors, place and note are kept; junk dropped', () => {
    const n = normalizeCommonAreas([
      { id: 'a', name: '  Dining ', kind: 'dining', count: 5, pendants: 0, sensors: 3, mark: { plan: 7, page: 1, x: 0.4, y: 0.6 }, note: ' ceiling ' },
      { id: 'b', name: 'Old', kind: 'bathroom', count: 6, pendants: 1 },
      { id: 'c', name: 'Bad mark', kind: 'lobby', count: 2, pendants: 0, mark: { plan: 7, page: 0, x: 2, y: 0 } },
    ]);
    expect(n[0]).toEqual({ id: 'a', name: 'Dining', kind: 'dining', count: 1, pendants: 0, sensors: 3, mark: { plan: 7, page: 1, x: 0.4, y: 0.6 }, note: 'ceiling' });
    // Typed-in E-Call areas carry over as they were (no sensors, no place).
    expect(n[1]).toEqual({ id: 'b', name: 'Old', kind: 'bathroom', count: 6, pendants: 1 });
    expect(n[2].mark).toBeUndefined();
    expect(n[2].count).toBe(2);
  });

  it('sets the community’s common area sensors: tagged sensors + the flat extra', () => {
    expect(commonAreaFromPlan({ commonAreas: tagged })).toBe(6);
    expect(commonAreaFromPlan({ commonAreas: tagged, commonAreaSensorsExtra: 3 })).toBe(9);
    // Nothing tagged: typed in, as before.
    expect(commonAreaFromPlan({ commonAreas: [{ id: 'x', name: 'Bath', kind: 'bathroom', count: 2, pendants: 1 }] })).toBeNull();
    expect(commonAreaFromPlan({})).toBeNull();
    const c = applyRoomTypes({ ...newCommunity(0), commonAreaSensors: 40, commonAreas: tagged, commonAreaSensorsExtra: 2 });
    expect(c.commonAreaSensors).toBe(8);
    // Untagged communities keep their typed-in count.
    expect(applyRoomTypes({ ...newCommunity(0), commonAreaSensors: 40 }).commonAreaSensors).toBe(40);
  });

  it('taking Common area sensors off keeps the tags (count 0); adding it back restores the count', () => {
    let d: QuoteDraft = normalizeDraft({ ...defaultDraft('CA', book, new Date('2026-11-01T00:00:00Z')), communities: [{ ...newCommunity(0), alBeds: 50, commonAreas: tagged, commonAreaSensorsExtra: 1 }] });
    expect(d.communities[0].commonAreaSensors).toBe(7);
    expect(choicesOf(d).commonArea).toBe(true);
    d = normalizeDraft(applyChoices(d, { ...choicesOf(d), commonArea: false }, book));
    expect(d.communities[0]).toMatchObject({ commonAreaSensors: 0, commonAreaOff: true });
    expect(d.communities[0].commonAreas).toHaveLength(3);
    expect(choicesOf(d).commonArea).toBe(false);
    d = normalizeDraft(applyChoices(d, { ...choicesOf(d), commonArea: true }, book));
    expect(d.communities[0].commonAreaSensors).toBe(7);
    expect(d.communities[0].commonAreaOff).toBeUndefined();
  });

  it('names E-Call devices by the system', () => {
    expect([devicesLabel('ble'), devicesLabel('inovonics'), devicesLabel('none')]).toEqual(['Pendants', 'Pull-cords', 'Pendants']);
  });
});

describe('extra E-Call devices with equipment purchase', () => {
  const deal = (ecall: 'ble' | 'inovonics' | 'none', withAreas = true) => {
    const d = defaultDraft('Dev', book, new Date('2026-11-01T00:00:00Z'));
    d.presentation = 'capex';
    d.commercial.ecall = ecall;
    d.communities = [
      {
        ...newCommunity(0),
        products: allProducts({ monitoring: true, ecall: ecall !== 'none' }),
        roomTypes: [
          { id: 'a', name: 'Studio', care: 'al', rooms: 20, sensors: 1 },
          { id: 'b', name: 'Couple suite', care: 'al', rooms: 10, sensors: 2, pendants: 2 },
        ],
        ...(withAreas ? { commonAreas: tagged } : {}),
      },
    ];
    return normalizeDraft(d);
  };

  it('charges devices beyond one per room or common area at the E-Call device price', () => {
    const c = computeCapex(deal('ble'));
    // Rooms: 10 extra (the couple suites); common areas with devices: lobby 1 (none extra), spa 2 (1 extra).
    expect(c.ecallDevices).toBe(11);
    expect(c.ecallDeviceCost).toBe(11 * 150);
    const noAreas = computeCapex(deal('ble', false));
    expect(noAreas.ecallDevices).toBe(10);
    expect(c.equipment - noAreas.equipment).toBe(150);
    expect(c.communities[0].ecallDevices).toBe(11);
  });

  it('none without E-Call, and none where every room has one device (unchanged pricing)', () => {
    const none = computeCapex(deal('none'));
    expect(none.ecallDevices).toBeUndefined();
    const d = deal('ble', false);
    d.communities[0].roomTypes = d.communities[0].roomTypes!.map((t) => ({ ...t, pendants: undefined }));
    expect(computeCapex(d).ecallDevices).toBeUndefined();
  });

  it('is a built-in item on the E-Call core product’s equipment purchase side: removing it makes them free', () => {
    const l = structuredClone(DEFAULT_LINEUP);
    const ec = l.cores.find((x) => x.id === 'ecall')!;
    expect(ec.sides.capex.items.some((x) => x.sku === SKU.capexEcallDevice)).toBe(true);
    ec.sides.capex.items = ec.sides.capex.items.filter((x) => x.sku !== SKU.capexEcallDevice);
    const d = { ...deal('ble'), lineup: { ...l, version: 3 } };
    expect(removedRoles(d.lineup).has(`capexEcallDevice:${SKU.capexEcallDevice}`)).toBe(true);
    expect(effectiveCommercial(d.commercial, d.lineup).capex.ecallDevice).toBe(0);
    expect(computeCapex(d).ecallDeviceCost ?? 0).toBe(0);
  });

  it('line-ups saved before it (no schema) price it as the default does, and normalize with it in place', () => {
    const old = structuredClone(DEFAULT_LINEUP) as Lineup;
    delete old.schema;
    const ec = old.cores.find((x) => x.id === 'ecall')!;
    ec.sides.capex.items = ec.sides.capex.items.filter((x) => x.sku !== SKU.capexEcallDevice);
    expect(removedRoles(old).size).toBe(0);
    const c = deal('ble').commercial;
    expect(effectiveCommercial(c, old)).toBe(c);
    const n = normalizeLineup(JSON.parse(JSON.stringify(old)));
    expect(n.schema).toBe(LINEUP_SCHEMA);
    expect(sameLineup(n, DEFAULT_LINEUP)).toBe(true);
  });
});

describe('caSensorScope', () => {
  it('splits plan, extra and typed-in sensors', () => {
    const c = { commonAreas: tagged, commonAreaSensorsExtra: 2, coverage: 'rooms_only' as const };
    const fromPlan = commonAreaFromPlan(c)!;
    const s = caSensorScope({ ...c, commonAreaSensors: fromPlan });
    expect(s.total).toBe(fromPlan);
    expect(s.extra).toBe(2);
    expect(s.tagged).toBe(fromPlan - 2);
    expect(s.typed).toBe(0);
    expect(s.areas.every((a) => (a.sensors ?? 0) > 0)).toBe(true);
    expect(caSensorScope({ commonAreaSensors: 6, coverage: 'rooms_only' as const })).toMatchObject({ total: 6, typed: 6, tagged: 0, extra: 0 });
    expect(caSensorScope({ commonAreaSensors: 6, coverage: 'full_facility' as const }).total).toBe(0);
    expect(caSensorScope({ ...c, commonAreaSensors: 9, commonAreaOff: true }).total).toBe(0);
  });
});
