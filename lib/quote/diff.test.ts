import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity } from './draft';
import { diffDrafts } from './diff';

const base = () => {
  const d = defaultDraft('Diff SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.communities = [
    { ...newCommunity(0), id: 'a', name: 'Maple', alBeds: 100, pilot: true },
    { ...newCommunity(1), id: 'b', name: 'Oak', alBeds: 80 },
  ];
  return d;
};

describe('diffDrafts', () => {
  it('no changes → empty', () => expect(diffDrafts(base(), base())).toEqual([]));

  it('reports pricing, community and metric changes in plain words', () => {
    const a = base();
    const b = structuredClone(a);
    b.commercial.platformRate = 89;
    b.commercial.installCreditPct = 0.5;
    b.communities[1].alBeds = 90;
    b.communities[1].name = 'Oak Hill';
    b.communities.push({ ...newCommunity(2), id: 'c', name: 'Birch', alBeds: 50 });
    b.caseMetrics.target.moveInUplift = 0.12;
    const ch = diffDrafts(a, b);
    expect(ch).toContainEqual({ group: 'Pricing', label: 'Platform rate / bed / mo', from: '$99', to: '$89' });
    expect(ch).toContainEqual({ group: 'Pricing', label: 'Install credit on pilot sites', from: '0%', to: '50%' });
    expect(ch).toContainEqual({ group: 'Communities', label: 'Oak Hill: AL beds', from: '80', to: '90' });
    expect(ch).toContainEqual({ group: 'Communities', label: 'Oak Hill: Name', from: 'Oak', to: 'Oak Hill' });
    expect(ch).toContainEqual({ group: 'Communities', label: 'Added Birch', from: '—', to: '50 beds' });
    expect(ch).toContainEqual({ group: 'Improvement metrics', label: 'Target move-in uplift', from: '10%', to: '12%' });
    expect(ch[0].group).toBe('Pricing');
  });

  it('reports removed communities', () => {
    const a = base();
    const b = structuredClone(a);
    b.communities = b.communities.slice(0, 1);
    expect(diffDrafts(a, b)).toEqual([{ group: 'Communities', label: 'Removed Oak', from: '80 beds', to: '—' }]);
  });
});

describe('legacy drafts', () => {
  it('a community saved with a single bed count loads as AL beds', async () => {
    const { normalizeCommunity, bedsOf } = await import('./draft');
    const legacy = { ...newCommunity(0), ilBeds: undefined, alBeds: undefined, mcBeds: undefined, beds: 137, snfBeds: 12 } as never;
    const n = normalizeCommunity(legacy);
    expect([n.ilBeds, n.alBeds, n.mcBeds, n.snfBeds, 'beds' in n]).toEqual([0, 137, 0, 12, false]);
    expect(bedsOf(legacy)).toBe(149);
    expect(bedsOf(n)).toBe(149);
  });
});
