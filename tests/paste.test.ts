import { describe, expect, it } from 'vitest';
import { parsePaste, splitRows } from '@/lib/quote/paste';

const names = (t: string) => parsePaste(t).communities.map((c) => c.name);

describe('paste communities from a spreadsheet', () => {
  it('NIC tab with header: # / Community Name / Market / Total Units / Serviceable Units / City/State', () => {
    const t = [
      '#\tCommunity Name\tMarket\tTotal Units\tServiceable Units\tCity/State',
      '1\tAksarben Village\tNE\t135\t87\tOmaha, NE',
      '2\tCollege View\tKS\t136\t70\tLenexa, KS',
      '3\tDeer Park Village\tIL\t179\t82\tDeer Park, IL',
    ].join('\n');
    const r = parsePaste(t);
    expect(r.hasHeader).toBe(true);
    expect(r.communities).toEqual([
      { name: 'Aksarben Village', market: 'NE', beds: 135, snfBeds: 0 },
      { name: 'College View', market: 'KS', beds: 136, snfBeds: 0 },
      { name: 'Deer Park Village', market: 'IL', beds: 179, snfBeds: 0 },
    ]);
  });

  it('same rows without the header — the leading 1, 2, 3 counter is not mistaken for anything', () => {
    const t = '1\tAksarben Village\tNE\t135\t87\tOmaha, NE\n2\tCollege View\tKS\t136\t70\tLenexa, KS\n3\tDeer Park Village\tIL\t179\t82\tDeer Park, IL';
    const r = parsePaste(t);
    expect(r.columns).toMatchObject({ name: 1, market: 2, units: 3 });
    expect(r.communities.map((c) => [c.name, c.market, c.beds])).toEqual([
      ['Aksarben Village', 'NE', 135],
      ['College View', 'KS', 136],
      ['Deer Park Village', 'IL', 179],
    ]);
  });

  it('Assumptions tab: # / Community / Market / Unit Count / Pilot Unit Count / Pilot?', () => {
    const t = '#\tCommunity\tMarket\tUnit Count\tPilot Unit Count\tPilot?\n1\tJackson Creek Senior Living\tCO\t137\t137\tYES\n2\tCollege View\tKS\t136\t\t';
    expect(parsePaste(t).communities).toEqual([
      { name: 'Jackson Creek Senior Living', market: 'CO', beds: 137, snfBeds: 0 },
      { name: 'College View', market: 'KS', beds: 136, snfBeds: 0 },
    ]);
  });

  it('Teton ROI tab: Bldg # / Name / Market / Units / Beds / Occupied Units* — takes total units, not occupied', () => {
    const t = 'Bldg #\tName\tMarket\tUnits / Beds\tOccupied Units*\n1\tJackson Creek Senior Living\tCO\t137\t123\n2\tCollege View\tKS\t136\t122';
    expect(parsePaste(t).communities.map((c) => c.beds)).toEqual([137, 136]);
  });

  it('plain list, name first, with SNF beds via header', () => {
    expect(parsePaste('Community\tState\tBeds\tSNF beds\nMaple Grove\tCO\t137\t12').communities).toEqual([{ name: 'Maple Grove', market: 'CO', beds: 137, snfBeds: 12 }]);
    expect(names('Maple Grove\tCO\t137\nRiverside\tKS\t1,204')).toEqual(['Maple Grove', 'Riverside']);
  });

  it('market given as "City, ST"; columns in an unusual order', () => {
    const r = parsePaste('120\tOmaha, NE\tAksarben Village\n95\tLenexa, KS\tCollege View');
    expect(r.communities).toEqual([
      { name: 'Aksarben Village', market: 'Omaha, NE', beds: 120, snfBeds: 0 },
      { name: 'College View', market: 'Lenexa, KS', beds: 95, snfBeds: 0 },
    ]);
  });

  it('comma-separated with quoted names containing commas; skips blank and total rows', () => {
    const r = parsePaste('Community,Market,Units\n"Smith, Jones & Co Living",TX,88\n\nTotal,,88');
    expect(r.communities).toEqual([{ name: 'Smith, Jones & Co Living', market: 'TX', beds: 88, snfBeds: 0 }]);
    expect(r.skipped).toBe(1);
  });

  it('a single row with a leading number still finds the name', () => {
    expect(names('7\tFountains Assisted Living\tIA\t136')).toEqual(['Fountains Assisted Living']);
  });

  it('manual column choice overrides detection', () => {
    const t = '1\tAksarben Village\tNE\t135\t87\n2\tCollege View\tKS\t136\t70';
    expect(parsePaste(t, { units: 4 }).communities.map((c) => c.beds)).toEqual([87, 70]);
  });

  it('splitRows handles Windows line endings, non-breaking spaces and quoted newlines', () => {
    expect(splitRows('a\tb\r\n"x\ny"\tz \r\n')).toEqual([['a', 'b'], ['x y', 'z']]);
  });
});
