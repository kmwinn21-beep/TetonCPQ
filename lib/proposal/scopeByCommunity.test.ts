import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { allProducts, defaultDraft, newCommunity, normalizeDraft } from '@/lib/quote/draft';
import type { RoomType } from '@/lib/quote/roomTypes';
import { scopeByCommunity } from './scopeByCommunity';

const AL: RoomType[] = [
  { id: 'a', name: 'Studio', care: 'al', rooms: 40, sensors: 1 },
  { id: 'b', name: 'One Bedroom', care: 'al', rooms: 5, sensors: 2 },
];
const MC: RoomType[] = [
  { id: 'c', name: 'MC Studio', care: 'mc', rooms: 26, sensors: 1 },
  { id: 'd', name: 'MC Companion', care: 'mc', rooms: 2, residents: 2, sensors: 2 },
];

function deal(ecall: 'none' | 'ble') {
  const d = defaultDraft('Heritage', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.commercial.ecall = ecall;
  const p = allProducts({ monitoring: true, ecall: ecall !== 'none' });
  d.communities = [
    { ...newCommunity(0), name: 'Blue Springs', alBeds: 1, products: p, roomTypes: [...AL, ...MC], sensorAllowancePct: 0 },
    { ...newCommunity(1), name: 'Lenexa', alBeds: 1, products: p, roomTypes: AL, sensorAllowancePct: 0 },
  ];
  return normalizeDraft(d);
}

describe('scope by community', () => {
  it('units by care setting, beds, sensors with their make-up, Edge units', () => {
    const s = scopeByCommunity(deal('none'));
    expect(s.careCols).toEqual([{ key: 'al', label: 'AL' }, { key: 'mc', label: 'MC' }]);
    const [bs, lx] = s.rows;
    expect(bs).toMatchObject({ name: 'Blue Springs', units: { al: 45, mc: 28 }, totalUnits: 73, beds: 75, edge: 73, devices: null });
    // 45 + 5 + 26 + 4 = 80 sensors on the plan; 75 included (one per bed), 5 additional.
    expect(bs.sensors).toEqual({ included: 75, additional: 5, commonArea: 0, total: 80 });
    expect(lx).toMatchObject({ units: { al: 45 }, totalUnits: 45, beds: 45 });
    expect(s.total).toMatchObject({ units: { al: 90, mc: 28 }, totalUnits: 118, beds: 120, edge: 118, devices: null });
    expect(s.total.sensors?.total).toBe(130);
  });

  it('a community with beds typed in (no room types) shows its beds by care setting', () => {
    const d = deal('none');
    d.communities[1] = { ...d.communities[1], roomTypes: [], alBeds: 30, mcBeds: 10 };
    const s = scopeByCommunity(normalizeDraft(d));
    expect(s.rows[1]).toMatchObject({ units: { al: 30, mc: 10 }, totalUnits: 40, beds: 40 });
  });

  it('adds E-Call devices when the deal has E-Call', () => {
    const s = scopeByCommunity(deal('ble'));
    expect(s.anyDevices).toBe(true);
    expect(s.rows[0].devices).toBeGreaterThanOrEqual(75);
  });

  it('counts common area sensors unless rooms only', () => {
    const d = deal('none');
    d.communities[0] = { ...d.communities[0], commonAreaSensors: 6 };
    const s = scopeByCommunity(normalizeDraft(d));
    expect(s.rows[0].sensors).toMatchObject({ commonArea: 6, total: 86 });
    expect(s.anyCommonArea).toBe(true);
    expect(scopeByCommunity(normalizeDraft(d), { roomsOnly: true }).rows[0].sensors).toMatchObject({ commonArea: 0, total: 80 });
  });
});
