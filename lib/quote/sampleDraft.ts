/** A made-up deal for previewing business case templates: three communities, a pilot, list pricing. */
import type { PriceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity, type QuoteDraft } from './draft';

export function sampleDraft(book: PriceBook, today = new Date()): QuoteDraft {
  const d = defaultDraft('Sample Senior Living', book, today);
  const site = (i: number, name: string, city: string, al: number, mc: number, il: number, pilot = false) => ({ ...newCommunity(i), id: `sample${i}`, name, city, market: city, alBeds: al, mcBeds: mc, ilBeds: il, pilot });
  d.communities = [site(0, 'Maple Grove', 'Denver, CO', 84, 24, 0, true), site(1, 'Cedar Ridge', 'Boulder, CO', 96, 0, 40), site(2, 'Willow Creek', 'Fort Collins, CO', 61, 0, 0)];
  return d;
}
