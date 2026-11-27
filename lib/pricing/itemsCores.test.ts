/** Core products and combinations added in the price book (generic items only). */
import { describe, expect, it } from 'vitest';
import { defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { priceBook } from './catalog';
import { buildPriceLines } from './lines';
import { DEFAULT_LINEUP, normalizeLineup, type ItemSpec, type Lineup } from './lineup';
import { activeItems } from './items';

const book = priceBook();
const FALLS: ItemSpec = { name: 'Fall review service', code: 'TT-X-010', list: 3, billing: 'monthly', counted: 'monitoredBeds', pilot: 'free' };
const PREMIUM: ItemSpec = { name: 'Premium review service', code: 'TT-X-011', list: 4, billing: 'monthly', counted: 'monitoredBeds', pilot: 'free' };

function lineup(): Lineup {
  const l = normalizeLineup({
    ...structuredClone(DEFAULT_LINEUP),
    cores: [
      ...structuredClone(DEFAULT_LINEUP.cores),
      { id: 'core-falls', name: 'Fall review', note: 'Monthly review of every fall', kind: 'core', sides: { subscription: { offered: true, items: [{ sku: 'X-FALLS', item: FALLS }] }, capex: { offered: false, items: [] } } },
    ],
    combos: [...structuredClone(DEFAULT_LINEUP.combos), { id: 'combo-premium', when: ['monitoring', 'core-falls'], side: 'subscription', replace: ['X-FALLS'], with: [{ sku: 'X-PREMIUM', item: PREMIUM }], enabled: true }],
  });
  return { ...l, version: 3 };
}

function deal(extra: string[], products: QuoteDraft['products'] = ['subscription']): QuoteDraft {
  const d = defaultDraft('Cores SL', book, new Date('2026-11-01T00:00:00Z'));
  d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 50 }];
  d.products = products;
  d.extraCores = extra;
  d.lineup = lineup();
  return normalizeDraft(d);
}

describe('core products added in the price book', () => {
  it('their items are on the deal only when the rep picks them', () => {
    expect(activeItems(deal([], [])).map((x) => x.sku)).toEqual([]);
    // Picked alone: its own item.
    expect(activeItems(deal(['core-falls'], [])).map((x) => x.sku)).toEqual(['X-FALLS']);
  });
  it('a combination swaps items when all its core products are on the deal', () => {
    const d = deal(['core-falls']);
    expect(activeItems(d).map((x) => x.sku)).toEqual(['X-PREMIUM']);
    const lines = buildPriceLines(d, toModelInputs(d), book).filter((l) => l.sku.startsWith('X-'));
    expect(lines.map((l) => [l.description, l.qty, l.unitNet])).toEqual([['Premium review service', 50, 4]]);
    const off = deal(['core-falls']);
    off.lineup!.combos.find((x) => x.id === 'combo-premium')!.enabled = false;
    expect(activeItems(off).map((x) => x.sku)).toEqual(['X-FALLS']);
  });
  it('not offered that way: nothing on an equipment-purchase deal', () => {
    expect(activeItems({ ...deal(['core-falls'], ['capex']), presentation: 'capex' })).toEqual([]);
  });
});
