import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity } from './draft';
import { applyChanges, changeDetails, effectiveChanges } from '@/lib/proposal/whatIf';

describe('community list changes from the proposal', () => {
  const d = defaultDraft('Acme', priceBook(), new Date(Date.UTC(2026, 10, 1)));
  d.communities = [{ ...newCommunity(0), id: 'a', name: 'Forest Hills', alBeds: 100 }];

  it('adds and edits communities, and describes the change', () => {
    const list = [{ ...d.communities[0], alBeds: 110 }, { ...newCommunity(1), id: 'b', name: 'Oak Park', mcBeds: 40 }];
    const out = applyChanges(d, { communities: list });
    expect(out.communities.map((c) => c.name)).toEqual(['Forest Hills', 'Oak Park']);
    expect(changeDetails(d, { communities: list })[0].lines.map((l) => ('text' in l ? l.text : ''))).toEqual(['changed Forest Hills: AL beds', 'added Oak Park (40 beds)']);
  });

  it('ignores an unchanged list and refuses an empty one', () => {
    expect(effectiveChanges(d, { communities: structuredClone(d.communities) })).toEqual({});
    expect(() => applyChanges(d, { communities: [] })).toThrow();
  });
});
