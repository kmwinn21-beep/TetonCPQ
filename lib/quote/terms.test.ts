import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity, type QuoteDraft } from './draft';
import { addTerm, editTerm, isStandardTerms, moveTerm, normalizeTerms, removedTerms, removeTerm, resolveTerms, restoreTerm, termsChanges, termTexts } from './terms';

const book = priceBook([{ sku: 'TETON-PLATFORM', name: 'Platform', pricingModel: 'per_bed_month', list: 99, description: '' }] as never);
const draft = (): QuoteDraft => {
  const d = defaultDraft('Acme', book, new Date(Date.UTC(2026, 10, 1)));
  d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 50, pilot: true }];
  d.commercial.installCreditPct = 1;
  return d;
};
const withTerms = (d: QuoteDraft, terms: QuoteDraft['terms']) => ({ ...d, terms });

describe('terms / notes', () => {
  it('starts with the standard terms written from the deal', () => {
    const d = draft();
    expect(resolveTerms(d).map((t) => t.id)).toEqual(['pilot', 'service', 'credit', 'billing']);
    expect(termTexts(d)[0]).toMatch(/^Pilot: 3 months at \$75 per bed per month/);
    expect(isStandardTerms(d)).toBe(true);
  });

  it('rewords a term and keeps its figures live', () => {
    let d = draft();
    d = withTerms(d, editTerm(d, 'pilot', 'Pilot of {pilotMonths} at just {pilotRate}/bed.'));
    expect(termTexts(d)[0]).toBe('Pilot of 3 months at just $75/bed.');
    d.commercial.pilotRate = 50;
    expect(termTexts(d)[0]).toBe('Pilot of 3 months at just $50/bed.');
    expect(isStandardTerms(d)).toBe(false);
    expect(termsChanges(draft(), d)).toEqual(['reworded Pilot term']);
    // Standard wording again clears the edit.
    d = withTerms(d, editTerm(d, 'pilot', resolveTerms(draft())[0].standard!));
    expect(resolveTerms(d)[0].edited).toBe(false);
  });

  it('removes, restores, adds and moves terms', () => {
    let d = draft();
    d = withTerms(d, removeTerm(d, 'billing'));
    expect(resolveTerms(d).map((t) => t.id)).toEqual(['pilot', 'service', 'credit']);
    expect(removedTerms(d)).toEqual(['billing']);
    const added = addTerm(d, 'Pricing valid for 60 days.');
    d = withTerms(d, added.terms);
    d = withTerms(d, moveTerm(d, added.id, -1));
    expect(resolveTerms(d).map((t) => t.id)).toEqual(['pilot', 'service', added.id, 'credit']);
    d = withTerms(d, restoreTerm(d, 'billing'));
    expect(resolveTerms(d).map((t) => t.id)).toEqual(['pilot', 'service', added.id, 'credit', 'billing']);
    expect(termsChanges(draft(), d)).toEqual(['added “Pricing valid for 60 days.”']);
  });

  it('adds a standard term in its place when it starts to apply', () => {
    let d = draft();
    d = withTerms(d, addTerm(d, 'Note').terms);
    d.commercial.specialRate = 79;
    d.commercial.specialTermMonths = 6;
    expect(resolveTerms(d).map((t) => t.id).slice(0, 5)).toEqual(['pilot', 'service', 'credit', 'intro', 'billing']);
  });

  it('treats bad input as standard terms', () => {
    expect(normalizeTerms(null)).toBeNull();
    expect(normalizeTerms([])).toBeNull();
    expect(normalizeTerms({ order: ['Bad Id', 'custom-x'], text: { 'custom-x': 5 }, removed: ['nope', 'billing'] })).toEqual({ order: [], text: {}, removed: ['billing'] });
  });
});
