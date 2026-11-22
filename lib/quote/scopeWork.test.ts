import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity, type QuoteDraft } from './draft';
import { carryScope, describeScope, scopeChanges } from './scopeWork';

const mark = (i: number) => ({ id: `m${i}`, plan: 1, page: 1, x: 0.1, y: 0.1 });
function draftWith(tags: number, name = 'Test Community'): QuoteDraft {
  const d = defaultDraft('Acme', priceBook(), new Date(Date.UTC(2026, 10, 1)));
  const c = { ...newCommunity(0), id: 'c1', name };
  c.roomTypes = tags ? [{ id: 'rt', name: 'Studio', care: 'al' as const, rooms: tags, sensors: 2, marks: Array.from({ length: tags }, (_, i) => mark(i)), roomsFromPlan: true }] : [];
  return { ...d, communities: [c] };
}

describe('scope work', () => {
  it('measures tagged rooms and sensors changed per community and says it in words', () => {
    const ch = scopeChanges(draftWith(4), draftWith(42));
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ name: 'Test Community', tagged: 42, dTagged: 38 });
    expect(ch[0].dSensors).toBeGreaterThan(0);
    expect(describeScope(ch[0])).toMatch(/^42 rooms tagged \(\+38\) · \d+ sensors \(\+\d+\) in Test Community$/);
    expect(scopeChanges(draftWith(5), draftWith(5))).toEqual([]);
  });

  it('keeps the scope of each community and drops other changes', () => {
    const saved = draftWith(4, 'Old name');
    const now = { ...draftWith(42, 'New name') };
    const out = carryScope(saved, now);
    expect(out.communities[0].name).toBe('Old name');
    expect(out.communities[0].roomTypes?.[0].marks).toHaveLength(42);
  });
});
