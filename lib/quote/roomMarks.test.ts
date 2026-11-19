import { describe, expect, it } from 'vitest';
import { applyRoomTypes, badgeOf, BADGE_COLORS, initialsOf, nextBadgeColor, normalizeRoomTypes } from './roomTypes';
import { newCommunity } from './draft';

const mark = (i: number, plan = 7) => ({ id: `m${i}`, plan, page: 1, x: i / 10, y: 0.5 });

describe('room types tagged on floor plans', () => {
  it('makes badge initials from the name', () => {
    expect(initialsOf('Studio')).toBe('ST');
    expect(initialsOf('One Bedroom')).toBe('1B');
    expect(initialsOf('Companion Suite')).toBe('CS');
    expect(initialsOf('Two bedroom and three-room')).toBe('2BA');
    expect(badgeOf({ name: 'Studio', initials: 'xl' }, 0).initials).toBe('xl');
  });

  it('keeps badges, color and initials; drops bad ones', () => {
    const [t] = normalizeRoomTypes([{ id: 'a', name: 'Studio', care: 'al', rooms: 3, sensors: 1, color: '#3F6FD8', initials: 'st ', marks: [mark(1), { plan: 'x' }, { ...mark(2), x: 4, y: -1, label: ' 143 ' }] }]);
    expect(t.color).toBe('#3F6FD8');
    expect(t.initials).toBe('ST');
    expect(t.marks).toEqual([mark(1), { ...mark(2), x: 1, y: 0, label: '143' }]);
    expect(normalizeRoomTypes([{ name: 'x', color: 'red' }])[0].color).toBeUndefined();
  });

  it('counts rooms from the badges when locked to the plan, and keeps a typed-in count otherwise', () => {
    const marks = [mark(1), mark(2), mark(3)];
    expect(normalizeRoomTypes([{ name: 'Studio', rooms: 10, marks, roomsFromPlan: true }])[0].rooms).toBe(3);
    expect(normalizeRoomTypes([{ name: 'Studio', rooms: 10, marks }])[0].rooms).toBe(10);
    const c = applyRoomTypes({ ...newCommunity(0), roomTypes: [{ id: 'a', name: 'Studio', care: 'al', rooms: 99, sensors: 2, marks, roomsFromPlan: true }], sensorAllowancePct: 0 });
    expect([c.alBeds, c.additionalSensors]).toEqual([3, 3]);
  });

  it('gives new room types the next unused color', () => {
    expect(nextBadgeColor([])).toBe(BADGE_COLORS[0]);
    expect(nextBadgeColor([{ name: 'a' }, { name: 'b', color: BADGE_COLORS[2] }])).toBe(BADGE_COLORS[1]);
  });
});
