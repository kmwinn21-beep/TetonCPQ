import { describe, expect, it } from 'vitest';
import { newCommunity } from '@/lib/quote/draft';
import { bedMix, communityChips, communityProblems, MIXED, sharedValue, sortedIndices, ymLabel } from '@/lib/quote/communityRow';

const c = (over: object = {}) => ({ ...newCommunity(0), name: 'Maple', alBeds: 10, ...over });
const deal = { withPilot: true, ecallOn: true };

describe('community list rows', () => {
  it('lists what a community still needs', () => {
    expect(communityProblems(c())).toEqual([]);
    expect(communityProblems(c({ name: '  ' }))).toEqual(['Needs a name']);
    expect(communityProblems(c({ alBeds: 0 }))).toEqual(['No beds']);
    expect(communityProblems(c({ alBeds: 0, snfBeds: 4 }))).toEqual([]);
  });

  it('summarises the bed mix, skipping empty care types', () => {
    expect(bedMix(c({ ilBeds: 22, alBeds: 58 }))).toBe('IL 22 · AL 58');
    expect(bedMix(c({ alBeds: 0, mcBeds: 19, snfBeds: 3 }))).toBe('MC 19 · SNF 3');
  });

  it('formats go-live months', () => {
    expect(ymLabel('2027-05')).toBe('May 2027');
  });

  it('flags only what differs from the deal defaults', () => {
    expect(communityChips(c(), deal)).toEqual([]);
    expect(communityChips(c({ pilot: true, coverage: 'full_facility', ecall: false, occupancy: 0.85, roiDelayMonths: 2, additionalSensors: 4 }), deal).map((x) => x.label)).toEqual([
      'Pilot',
      'Full facility',
      'No E-Call',
      'Occ 85%',
      'Delay 2 mo',
      '4 sensors',
    ]);
    expect(communityChips(c({ pilot: true, pilotUnits: 12 }), deal)[0]).toEqual({ label: 'Pilot · 12 beds', tone: 'green', pilot: true });
  });

  it('hides pilot and e-call chips when the deal has neither', () => {
    expect(communityChips(c({ pilot: true, ecall: false }), { withPilot: false, ecallOn: false })).toEqual([]);
  });

  it('puts problems first', () => {
    expect(communityChips(c({ name: '', coverage: 'full_facility' }), deal).map((x) => x.tone)).toEqual(['red', 'purple']);
  });

  it('reports a shared value or mixed', () => {
    expect(sharedValue(['rooms_only', 'rooms_only'])).toBe('rooms_only');
    expect(sharedValue([null, 0.9])).toBe(MIXED);
    expect(sharedValue([])).toBeUndefined();
  });

  it('sorts for display without moving the data', () => {
    const rows = [c({ name: 'B', goLiveMonth: '2027-08' }), c({ name: 'A', goLiveMonth: null }), c({ name: 'C', goLiveMonth: '2027-02' })];
    expect(sortedIndices(rows, 'entered')).toEqual([0, 1, 2]);
    expect(sortedIndices(rows, 'name')).toEqual([1, 0, 2]);
    expect(sortedIndices(rows, 'golive')).toEqual([2, 0, 1]);
  });
});
