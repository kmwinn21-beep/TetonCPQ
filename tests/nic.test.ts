import { describe, expect, it } from 'vitest';
import { looksLikeNicCopy, parseNicCopy } from '@/lib/quote/nic';

// Same shape as a copy from portal.nicmap.com → Industry → Buildings (List): names are made up.
const SAMPLE = `Maple Alcove at Elmwood

Example Senior Living

1108 Regency Way
Elmwood, KY 42701
Total Units\t29
AA\tIL\tAL\tMC\tNC
0\t0\t10\t19\t0
Birch Senior Living

Example Senior Living

6021 South Arlington Ave
Indianapolis, IN 46237
Total Units\t131
AA\tIL\tAL\tMC\tNC
0\t0\t115\t16\t0
Cedar Oaks of Pearland

Example Senior Living

3033 Pearland Pkwy
Pearland, TX 77581
Total Units\t80
AA\tIL\tAL\tMC\tNC
0\t22\t58\t0\t0
`;

describe('NIC MAP portal copy', () => {
  it('is recognized', () => {
    expect(looksLikeNicCopy(SAMPLE)).toBe(true);
    expect(looksLikeNicCopy('Maple Grove\tCO\t137')).toBe(false);
  });

  it('reads name, operator, address, total units and care mix for every building', () => {
    const { buildings, skipped } = parseNicCopy(SAMPLE);
    expect(skipped).toBe(0);
    expect(buildings).toHaveLength(3);
    expect(buildings[0]).toEqual({
      name: 'Maple Alcove at Elmwood',
      operator: 'Example Senior Living',
      street: '1108 Regency Way',
      city: 'Elmwood',
      state: 'KY',
      zip: '42701',
      market: 'KY',
      totalUnits: 29,
      beds: 29,
      snfBeds: 0,
      careMix: { AA: 0, IL: 0, AL: 10, MC: 19, NC: 0 },
    });
    expect(buildings.map((b) => [b.name, b.market, b.beds])).toEqual([
      ['Maple Alcove at Elmwood', 'KY', 29],
      ['Birch Senior Living', 'IN', 131],
      ['Cedar Oaks of Pearland', 'TX', 80],
    ]);
  });

  it('nursing-care (NC) units become SNF beds; beds + SNF = total units', () => {
    const t = 'Willow Care Center\nExample Health\n1 Main St\nDayton, OH 45402\nTotal Units\t120\nAA\tIL\tAL\tMC\tNC\n0\t0\t40\t20\t60';
    const [b] = parseNicCopy(t).buildings;
    expect([b.beds, b.snfBeds, b.totalUnits]).toEqual([60, 60, 120]);
  });

  it('copes with "View Details", page headings, a missing operator, ZIP+4 and the total on its own line', () => {
    const t = [
      'Results Matching Your Search',
      'Buildings',
      'Ash Court',
      '',
      '500 Elm St',
      'Austin, TX 78701-1234',
      'Total Units',
      '1,204',
      'AA IL AL MC NC',
      '0 1204 0 0 0',
      'View Details',
      'Pine Ridge',
      'Example Senior Living',
      '9 Hill Rd',
      'Boulder, CO 80301',
      'Total Units 54',
      'View Details',
    ].join('\n');
    const { buildings } = parseNicCopy(t);
    expect(buildings.map((b) => [b.name, b.operator, b.city, b.market, b.totalUnits])).toEqual([
      ['Ash Court', '', 'Austin', 'TX', 1204],
      ['Pine Ridge', 'Example Senior Living', 'Boulder', 'CO', 54],
    ]);
  });

  it('a partial copy that starts mid-building only keeps complete buildings it can name', () => {
    const t = 'AL\tMC\n10\t19\nTotal Units\t0\nOak Hall\nExample Senior Living\n2 Oak St\nMason, OH 45040\nTotal Units\t82\nAA\tIL\tAL\tMC\tNC\n0\t0\t61\t21\t0';
    const r = parseNicCopy(t);
    expect(r.buildings.map((b) => b.name)).toEqual(['Oak Hall']);
    expect(r.skipped).toBe(1);
  });
});
