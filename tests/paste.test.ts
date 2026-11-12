import { describe, expect, it } from 'vitest';
import { parsePastedCommunities } from '@/components/quote/CommunitiesSection';

describe('paste communities from a spreadsheet', () => {
  it('reads tab-separated rows (name, market, units, optional SNF beds) and skips headers/blank rows', () => {
    const text = 'Community Name\tMarket\tTotal Units\nMaple Grove\tCO\t137\n\nRiverside\tKS\t1,204\t20\n';
    expect(parsePastedCommunities(text)).toEqual([
      { name: 'Maple Grove', market: 'CO', beds: 137, snfBeds: 0 },
      { name: 'Riverside', market: 'KS', beds: 1204, snfBeds: 20 },
    ]);
  });
  it('accepts comma-separated rows', () => {
    expect(parsePastedCommunities('A,NE,60')).toEqual([{ name: 'A', market: 'NE', beds: 60, snfBeds: 0 }]);
  });
});
