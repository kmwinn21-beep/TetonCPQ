import { describe, expect, it } from 'vitest';
import { applyRoomTypes, careLabel, normalizeRoomTypes, roomScope, type RoomType } from './roomTypes';
import { newCommunity, normalizeDraft, defaultDraft } from './draft';
import { priceBook } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';

const FOREST_HILLS: RoomType[] = [
  { id: 'a', name: 'Studio', care: 'al', rooms: 55, sensors: 1 },
  { id: 'b', name: 'Studio Deluxe', care: 'al', rooms: 8, sensors: 2 },
  { id: 'c', name: 'One bedroom', care: 'al', rooms: 33, sensors: 2 },
  { id: 'd', name: 'Two bedroom and three-room', care: 'al', rooms: 13, sensors: 3 },
  { id: 'e', name: 'Studio Traditional', care: 'mc', rooms: 12, sensors: 1 },
  { id: 'f', name: 'Studio Premium', care: 'mc', rooms: 8, sensors: 2 },
];

describe('room types', () => {
  it('reproduces the Forest Hills scope: 129 rooms, 204 + 7 = 211 sensors, 82 additional', () => {
    const s = roomScope(FOREST_HILLS, 0.03);
    expect(s).toMatchObject({ rooms: 129, planSensors: 204, allowance: 7, totalSensors: 211, additionalSensors: 82 });
    expect(s.beds).toEqual({ il: 0, al: 109, mc: 20, snf: 0 });
  });

  it('sets beds and additional sensors on the community, and feeds the price', () => {
    const d = defaultDraft('Triple Crown', priceBook(), new Date('2026-11-17'));
    d.commercial.ecall = 'none';
    d.communities = [{ ...newCommunity(0), name: 'Forest Hills Commons', alBeds: 1, additionalSensors: 0, roomTypes: FOREST_HILLS }];
    const n = normalizeDraft(d);
    expect(n.communities[0]).toMatchObject({ alBeds: 109, mcBeds: 20, additionalSensors: 82 });
    expect(computeCapex(n).equipment).toBe(626_430);
  });

  it('leaves communities without room types alone and cleans bad input', () => {
    const c = { ...newCommunity(0), alBeds: 40, additionalSensors: 5 };
    expect(applyRoomTypes(c)).toBe(c);
    expect(normalizeRoomTypes([{ name: '  Studio ', care: 'zz', rooms: -3, sensors: 0 }, 'junk'])).toEqual([{ id: 'rt-0', name: 'Studio', care: 'al', rooms: 0, sensors: 1 }]);
    expect(roomScope([{ id: 'x', name: '', care: 'al', rooms: 100, sensors: 2 }], 0.03).allowance).toBe(6); // exactly 6, not 7
  });

  it('takes custom care types, counted as assisted living beds', () => {
    const t = normalizeRoomTypes([{ id: 'x', name: 'Respite suite', care: 'custom', customCare: '  Respite ', rooms: 4, sensors: 2 }]);
    expect(t[0]).toMatchObject({ care: 'custom', customCare: 'Respite' });
    expect(careLabel(t[0])).toBe('Respite');
    expect(careLabel({ care: 'al' })).toBe('Assisted living');
    expect(roomScope(t, 0).beds).toEqual({ il: 0, al: 4, mc: 0, snf: 0 });
  });

  describe('pendantScope (E-Call devices)', () => {
    it('counts pendants per room on E-Call room types, common areas and the contingency', async () => {
      const { pendantScope } = await import('./roomTypes');
      const { allProducts } = await import('./draft');
      const c = {
        products: allProducts({ monitoring: true, ecall: true }),
        roomTypes: [
          { id: 'a', name: 'Studio', care: 'al' as const, rooms: 55, sensors: 1 },
          { id: 'b', name: 'One bedroom', care: 'al' as const, rooms: 33, sensors: 2, pendants: 2 },
        ],
        commonAreas: [{ id: 'x', name: 'Bath', kind: 'bathroom' as const, count: 6, pendants: 1 }, { id: 'y', name: 'Dining', kind: 'dining' as const, count: 1, pendants: 0 }],
        pendantAllowancePct: 0.05,
      };
      expect(pendantScope(c, true)).toEqual({ rooms: 88, residents: 88, roomPendants: 121, areas: 6, areaPendants: 6, plan: 127, allowance: 7, total: 134 });
      expect(pendantScope(c, false).total).toBe(0);
      // No E-Call on any care type: nothing, common areas included.
      expect(pendantScope({ ...c, products: allProducts({ monitoring: true, ecall: false }) }, true).total).toBe(0);
    });
    it('without room types: one per E-Call bed', async () => {
      const { pendantScope } = await import('./roomTypes');
      const { allProducts } = await import('./draft');
      expect(pendantScope({ products: allProducts({ monitoring: false, ecall: true }), alBeds: 40, mcBeds: 10, pendantAllowancePct: 0 }, true)).toMatchObject({ rooms: 50, roomPendants: 50, total: 50 });
    });
  });
});
