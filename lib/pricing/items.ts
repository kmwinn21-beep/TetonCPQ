/**
 * Items priced generically: added in the price book (or converted there from a built-in item), they price as
 * quantity × deal price × how often they bill, with no special rules. Which ones are on a deal: the generic items in
 * the deal's line-up, in the core products the rep picked, for each way the deal is sold (and offered that way).
 *
 *   quantity    per community, from Communities and Scope (ItemSpec.counted)
 *   deal price  the deal's own price for the item (commercial.items[sku]), or its list price in the line-up
 *   billing     monthly (after the pilot; during it too if the item says so), once (at the one-time charge, credited
 *               on pilot sites if the item says so), or every N years (once, then again every N years)
 */
import { sharedResidents } from '@/lib/quote/roomTypes';
import type { DraftCommunity, QuoteDraft } from '@/lib/quote/draft';
import { scopeOf } from '@/lib/quote/draft';
import { choicesOf } from '@/lib/quote/products';
import type { CountBasis } from './catalog';
import { OFFER_LOCKED, SIDES, type ItemSpec, type Side } from './lineup';

export interface ActiveItem {
  sku: string;
  spec: ItemSpec;
  side: Side;
  /** The core product that brought it in (the first, if several). */
  core: string;
}

/** The core products a deal has (built-in ones from its choices, plus custom ones it picked). */
export function selectedCores(d: QuoteDraft): Set<string> {
  const c = choicesOf(d);
  const out = new Set<string>(d.extraCores ?? []);
  if (c.monitoring) out.add('monitoring');
  if (c.ecall !== 'none') out.add('ecall');
  if (c.commonArea) out.add('commonArea');
  if (c.finish) out.add('finish');
  return out;
}

const sidesShown = (d: Pick<QuoteDraft, 'presentation'>): Side[] => (d.presentation === 'capex' ? ['capex'] : d.presentation === 'both' ? SIDES : ['subscription']);

/** The generic items on a deal, each once per way it's sold. */
export function activeItems(d: QuoteDraft): ActiveItem[] {
  const l = d.lineup;
  if (!l || !(l.cores.some((c) => SIDES.some((s) => c.sides[s].items.some((e) => e.item))) || l.combos.some((x) => x.with.some((e) => e.item)))) return [];
  const picked = selectedCores(d);
  const out: ActiveItem[] = [];
  const seen = new Set<string>();
  for (const s of sidesShown(d)) {
    for (const c of l.cores) {
      if (!picked.has(c.id)) continue;
      if (!c.sides[s].offered && !OFFER_LOCKED.has(c.id)) continue;
      for (const e of c.sides[s].items) {
        if (!e.item || seen.has(`${s}:${e.sku}`)) continue;
        seen.add(`${s}:${e.sku}`);
        out.push({ sku: e.sku, spec: e.item, side: s, core: c.id });
      }
    }
    // Combinations added in the price book (generic items only): with all their core products on the deal, the
    // items they replace come off and their own items go on.
    for (const x of l.combos) {
      if (x.builtin || !x.enabled || x.side !== s || !x.when.every((w) => picked.has(w))) continue;
      for (let i = out.length - 1; i >= 0; i--) if (out[i].side === s && x.replace.includes(out[i].sku)) out.splice(i, 1);
      for (const e of x.with) {
        if (!e.item || out.some((y) => y.side === s && y.sku === e.sku)) continue;
        out.push({ sku: e.sku, spec: e.item, side: s, core: x.when[0] });
      }
    }
  }
  return out;
}

/** The generic items on one side of a deal. */
export const itemsOn = (d: QuoteDraft, side: Side) => activeItems(d).filter((x) => x.side === side);

/** A generic item's quantity at a community. */
export function itemQty(c: DraftCommunity, ecallOn: boolean, basis: CountBasis): number {
  const s = scopeOf(c, ecallOn);
  switch (basis) {
    case 'monitoredBeds':
      return s.monitored;
    case 'ecallBeds':
      return s.ecall;
    case 'ecallOnlyBeds':
      return s.ecallOnly;
    case 'monitoredEcallBeds':
      return s.monitoredEcall;
    case 'rooms':
      // Rooms, not residents: residents sharing a room count once.
      return s.priced - sharedResidents(c, ecallOn).priced;
    case 'snfBeds':
      return s.monitoredByCare.snf;
    case 'commonAreaSensors':
      return c.coverage === 'full_facility' ? 0 : Math.max(0, Math.round(Number(c.commonAreaSensors) || 0));
    case 'additionalSensors':
      return s.monitored > 0 ? Math.max(0, Number(c.additionalSensors) || 0) : 0;
    case 'perCommunity':
      return s.priced > 0 ? 1 : 0;
  }
}

/** The deal's price for a generic item (its own, or the list price in its line-up). */
export const itemPrice = (d: Pick<QuoteDraft, 'commercial'>, sku: string, spec: ItemSpec) => {
  const v = d.commercial.items?.[sku];
  return v == null || !Number.isFinite(Number(v)) ? spec.list : Math.max(0, Number(v));
};
