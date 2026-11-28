import { describe, expect, it } from 'vitest';
import { runModel, runVendorView } from '@/lib/model';
import { priceBook } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';
import { buildPriceLines } from '@/lib/pricing/lines';
import { onePagerCounts } from '@/lib/proposal/onePager';
import { allProducts, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from './draft';
import { communityEdges, markEdges, normalizeRoomTypes, roomScope, typeEdges, type RoomMark, type RoomType } from './roomTypes';
import { toModelInputs } from './toModelInputs';

const mark = (id: string, edges?: number): RoomMark => ({ id, plan: 1, page: 1, x: 0.1, y: 0.1, ...(edges != null ? { edges } : {}) });

// 5 one-bedrooms and 2 two-bedroom suites that need 2 Edge units each (3 sensors per suite).
const TYPES: RoomType[] = [
  { id: 'a', name: 'One Bedroom', care: 'al', rooms: 5, sensors: 1 },
  { id: 'b', name: 'Two Bedroom Suite', care: 'al', rooms: 2, sensors: 3, edges: 2 },
];

function deal(types: RoomType[]): QuoteDraft {
  const d = defaultDraft('Edge SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.commercial.ecall = 'none';
  d.schedule.withPilot = false;
  d.communities = [{ ...newCommunity(0), name: 'Benton House', alBeds: 1, products: allProducts({ monitoring: true, ecall: false }), roomTypes: types, sensorAllowancePct: 0 }];
  return normalizeDraft(d);
}

describe('Edge units per room', () => {
  it('keeps Edge units per room (1 to 3) and per-room overrides that differ from the type', () => {
    const [t] = normalizeRoomTypes([{ id: 'x', name: 'Suite', care: 'al', rooms: 3, sensors: 3, edges: 2, marks: [mark('m1'), mark('m2', 1), mark('m3', 2), mark('m4', 9)] }]);
    expect(t.edges).toBe(2);
    expect(t.marks?.map((m) => m.edges)).toEqual([undefined, 1, undefined, 3]); // 2 = the type's, dropped; 9 capped at 3
    expect(normalizeRoomTypes([{ id: 'y', name: 'Studio', care: 'al', rooms: 1, sensors: 1, edges: 1 }])[0].edges).toBeUndefined();
    expect(normalizeRoomTypes([{ id: 'z', name: 'Big', care: 'al', rooms: 1, sensors: 1, edges: 12 }])[0].edges).toBe(3);
  });

  it('counts rooms × Edge units per room, adjusted by each room\'s own count', () => {
    const t: RoomType = { id: 'x', name: 'Suite', care: 'al', rooms: 3, sensors: 3, edges: 2, marks: [mark('m1'), mark('m2', 1), mark('m3', 3)] };
    expect(markEdges(t, t.marks![1])).toBe(1);
    expect(typeEdges(t)).toBe(3 * 2 - 1 + 1);
    expect(roomScope(TYPES, 0)).toMatchObject({ rooms: 7, edges: 9, planSensors: 11 });
  });

  it('a community counts Edge units on monitored room types only; without room types, one per monitored bed', () => {
    const d = deal([...TYPES, { id: 'c', name: 'IL apartment', care: 'il', rooms: 10, sensors: 1, edges: 2 }]);
    d.communities[0].products = { ...allProducts({ monitoring: true, ecall: false }), il: { monitoring: false, ecall: false } };
    expect(communityEdges(d.communities[0])).toBe(9);
    expect(communityEdges({ ...newCommunity(0), alBeds: 40, products: allProducts({ monitoring: true, ecall: false }) })).toBe(40);
  });

  it('leaves the customer\'s price alone: installation, base packages and sensors stay per room', () => {
    const two = deal(TYPES);
    const one = deal(TYPES.map((t) => ({ ...t, edges: undefined })));
    const [m2, m1] = [toModelInputs(two), toModelInputs(one)];
    expect(m2.communities[0]).toMatchObject({ units: 7, additionalSensors: 4, edgeHardware: 9 });
    expect(m1.communities[0].edgeHardware).toBeUndefined();
    const install = (d: QuoteDraft, m: ReturnType<typeof toModelInputs>) => buildPriceLines(d, m, priceBook()).find((l) => l.description.startsWith('Installation'))?.qty;
    expect(install(two, m2)).toBe(7);
    expect(runModel(m2).kpis).toEqual(runModel(m1).kpis);
    expect(computeCapex(two).equipment).toBe(computeCapex(one).equipment);
  });

  it('counts the extra Edge units in Teton\'s hardware cost and the scope numbers', () => {
    const [v2, v1] = [runVendorView(toModelInputs(deal(TYPES))), runVendorView(toModelInputs(deal(TYPES.map((t) => ({ ...t, edges: undefined })))))];
    expect(Math.max(...v2.hardware) / Math.max(...v1.hardware)).toBeCloseTo(9 / 7, 6);
    expect(onePagerCounts(deal(TYPES))).toMatchObject({ edges: 9, sensors: 11 });
  });
});
