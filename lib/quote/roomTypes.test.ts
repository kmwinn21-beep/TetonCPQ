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
    expect(computeCapex(n).equipment).toBe(630_300);
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
});
