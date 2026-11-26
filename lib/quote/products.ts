/**
 * The products on a deal, picked from the price book. They decide which pricing settings the deal page shows, and
 * adding or removing one writes the same draft fields the pricing engine has always read (presentation, E-Call
 * system, community products, concealed finish). Nothing is written when a deal loads: a deal saved before products
 * existed shows the products its settings imply, and prices exactly as before.
 *
 * Implementation is always included: it comes with the first platform product and can be credited, not removed.
 */
import { BED_KEYS, defaultProducts, hasEcall, monitors, productsOf, type DraftCommunity, type EcallOption, type QuoteDraft } from './draft';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';

/** A product on the deal (the bundle, devices and skilled nursing rate follow from these). */
export type DealProduct = 'subscription' | 'ecall' | 'capex' | 'snf' | 'sensor' | 'commonArea' | 'finish';
export const DEAL_PRODUCTS: DealProduct[] = ['subscription', 'snf', 'ecall', 'sensor', 'commonArea', 'capex', 'finish'];

const has = (d: QuoteDraft, f: (c: DraftCommunity) => boolean) => (d.communities ?? []).some(f);

/** The products on a deal: the ones the rep added, or (older deals) the ones its settings imply. */
export function dealProducts(d: QuoteDraft): DealProduct[] {
  if (Array.isArray(d.products)) return DEAL_PRODUCTS.filter((p) => d.products!.includes(p));
  const none = !(d.communities ?? []).length;
  const out = new Set<DealProduct>();
  const ecall = d.commercial.ecall !== 'none';
  if (d.presentation !== 'capex' && (none || has(d, monitors) || !ecall)) out.add('subscription');
  if (d.presentation !== 'opex') out.add('capex');
  if (ecall && (none || has(d, hasEcall))) out.add('ecall');
  if (has(d, (c) => (Number(c.snfBeds) || 0) > 0)) out.add('snf');
  if (has(d, (c) => (Number(c.additionalSensors) || 0) > 0)) out.add('sensor');
  if (has(d, (c) => (Number(c.commonAreaSensors) || 0) > 0 || c.coverage === 'full_facility')) out.add('commonArea');
  if (d.commercial.finish?.concealed) out.add('finish');
  return DEAL_PRODUCTS.filter((p) => out.has(p));
}

/** Whether the deal has implementation (always, once it has a platform product). */
export const hasImplementation = (ps: DealProduct[]) => ps.includes('subscription') || ps.includes('ecall') || ps.includes('capex');

/** Which settings groups the deal page shows. */
export function visibleSettings(ps: DealProduct[]) {
  const sub = ps.includes('subscription');
  const capex = ps.includes('capex');
  const ecall = ps.includes('ecall');
  return {
    pilot: sub || capex || ecall,
    introRate: sub,
    ecall,
    capex,
    finish: ps.includes('finish'),
    bundle: sub && ecall,
    snf: ps.includes('snf'),
    sensor: ps.includes('sensor'),
    commonArea: ps.includes('commonArea'),
  };
}

/** Why a product can't be removed right now (it is still in use), or null. */
export function removeBlock(d: QuoteDraft, p: DealProduct): string | null {
  const n = (f: (c: DraftCommunity) => number) => (d.communities ?? []).reduce((s, c) => s + (f(c) || 0), 0);
  if (p === 'sensor' && n((c) => Number(c.additionalSensors))) return `${n((c) => Number(c.additionalSensors))} additional sensors are set in Communities. Set them to 0 first.`;
  if (p === 'commonArea' && n((c) => Number(c.commonAreaSensors))) return `${n((c) => Number(c.commonAreaSensors))} common-area sensors are set in Communities. Set them to 0 first.`;
  if (p === 'snf' && n((c) => Number(c.snfBeds))) return `${n((c) => Number(c.snfBeds))} skilled nursing beds are set in Communities. Their rate stays on the deal while they’re there.`;
  return null;
}

const ecallList = (book: PriceBook, o: EcallOption) => (o === 'ble' ? book[SKU.ecallBle]?.list ?? 10 : o === 'inovonics' ? book[SKU.ecallInovonics]?.list ?? 15 : 0);

/** Communities with monitoring turned on for the care types that take it by default (where none has it yet). */
function withMonitoring(c: DraftCommunity, on: boolean): DraftCommunity {
  const p = productsOf(c);
  if (on && BED_KEYS.some((k) => p[k].monitoring)) return c;
  const def = defaultProducts();
  const next = Object.fromEntries(BED_KEYS.map((k) => [k, { ...p[k], monitoring: on ? def[k].monitoring : false }])) as typeof p;
  return { ...c, products: next, monitoring: on };
}
function withEcall(c: DraftCommunity, on: boolean): DraftCommunity {
  const p = productsOf(c);
  if (on && BED_KEYS.some((k) => p[k].ecall)) return c;
  const def = defaultProducts();
  const next = Object.fromEntries(BED_KEYS.map((k) => [k, { ...p[k], ecall: on ? def[k].ecall || p[k].monitoring : false }])) as typeof p;
  return { ...c, products: next, ecall: on };
}

/**
 * Add products to a deal. Writes the fields the engine reads: the pricing structure, the E-Call system (at its list
 * price, free during the pilot), monitoring / E-Call on the communities, and the concealed finish.
 */
export function addProducts(d: QuoteDraft, add: DealProduct[], book: PriceBook, opts: { ecall?: EcallOption } = {}): QuoteDraft {
  const before = dealProducts(d);
  const ps = new Set([...before, ...add]);
  let next: QuoteDraft = { ...d, commercial: { ...d.commercial }, communities: [...(d.communities ?? [])] };
  if (add.includes('subscription') && !before.includes('subscription')) next.communities = next.communities.map((c) => withMonitoring(c, true));
  if (add.includes('ecall')) {
    const sys = opts.ecall ?? (d.commercial.ecall !== 'none' ? d.commercial.ecall : 'ble');
    if (sys !== d.commercial.ecall || !before.includes('ecall')) {
      next.commercial.ecall = sys;
      next.commercial.ecallRate = ecallList(book, sys);
      next.commercial.ecallPilotRate = 0;
    }
    next.communities = next.communities.map((c) => withEcall(c, true));
  }
  if (add.includes('finish')) next.commercial.finish = { ...next.commercial.finish, concealed: true };
  next = { ...next, presentation: presentationOf(ps) ?? next.presentation, products: DEAL_PRODUCTS.filter((p) => ps.has(p)) };
  return next;
}

/** Remove a product (implementation can't be removed; products still in use are blocked, see removeBlock). */
export function removeProduct(d: QuoteDraft, p: DealProduct): QuoteDraft {
  const block = removeBlock(d, p);
  if (block) throw new Error(block);
  const ps = new Set(dealProducts(d));
  ps.delete(p);
  let next: QuoteDraft = { ...d, commercial: { ...d.commercial }, communities: [...(d.communities ?? [])] };
  // E-Call-only deals: monitoring off everywhere (the engine then bills E-Call per device, with its own install).
  if (p === 'subscription' && ps.has('ecall')) next.communities = next.communities.map((c) => withMonitoring(c, false));
  if (p === 'ecall') next.commercial.ecall = 'none';
  if (p === 'finish') next.commercial.finish = { ...next.commercial.finish, concealed: false };
  next = { ...next, presentation: presentationOf(ps) ?? next.presentation, products: DEAL_PRODUCTS.filter((x) => ps.has(x)) };
  return next;
}

/** OpEx with a subscription, CapEx with equipment purchase, Both with both (null: neither, so leave it). */
function presentationOf(ps: Set<DealProduct>): QuoteDraft['presentation'] | null {
  const sub = ps.has('subscription') || (ps.has('ecall') && !ps.has('capex'));
  const cx = ps.has('capex');
  return sub && cx ? 'both' : cx ? 'capex' : sub ? 'opex' : null;
}

/** Ready-made starting points for new deals. */
export interface Kit {
  id: string;
  label: string;
  note: string;
  mostUsed?: boolean;
}
export const KITS: Kit[] = [
  { id: 'rm-pilot', label: 'Resident monitoring pilot', note: 'Teton subscription · free 3-month pilot · implementation credited on pilot sites', mostUsed: true },
  { id: 'sub-ecall', label: 'Subscription + E-Call', note: 'Teton subscription with Bluetooth E-Call · implementation' },
  { id: 'capex', label: 'Equipment purchase', note: 'Base package + software & services · CapEx' },
];

/** Apply a kit: its products, and (the pilot kit) a free pilot of the standard length with implementation credited. */
export function applyKit(d: QuoteDraft, id: string, book: PriceBook): QuoteDraft {
  if (id === 'rm-pilot') {
    const next = addProducts(d, ['subscription'], book);
    return {
      ...next,
      schedule: { ...next.schedule, withPilot: true, pilotLengthMonths: POLICY.standardPilotMonths },
      commercial: { ...next.commercial, pilotRate: 0, installCreditPct: 1, installCreditCustom: false, installClawback: true },
    };
  }
  if (id === 'sub-ecall') return addProducts(d, ['subscription', 'ecall'], book, { ecall: 'ble' });
  if (id === 'capex') return addProducts(d, ['capex'], book);
  throw new Error('Unknown kit');
}

/** The price book item(s) behind each product (what the picker lists). */
export const PRODUCT_SKUS: Record<DealProduct, string[]> = {
  subscription: [SKU.platform],
  snf: [SKU.snf],
  ecall: [SKU.ecallBle, SKU.ecallInovonics],
  sensor: [SKU.sensor],
  commonArea: [SKU.commonAreaSetup, SKU.commonAreaMonthly],
  capex: [SKU.capexBase],
  finish: ['FINISH-CONCEALED-LOW'],
};

/** What adding a price book item puts on the deal. */
export function productsForSku(sku: string): { add: DealProduct[]; ecall?: EcallOption } | null {
  switch (sku) {
    case SKU.platform: return { add: ['subscription'] };
    case SKU.snf: return { add: ['subscription', 'snf'] };
    case SKU.bundleBle: return { add: ['subscription', 'ecall'], ecall: 'ble' };
    case SKU.bundleInovonics: return { add: ['subscription', 'ecall'], ecall: 'inovonics' };
    case SKU.ecallBle: return { add: ['ecall'], ecall: 'ble' };
    case SKU.ecallInovonics: return { add: ['ecall'], ecall: 'inovonics' };
    case SKU.sensor: return { add: ['sensor'] };
    case SKU.commonAreaSetup:
    case SKU.commonAreaMonthly: return { add: ['commonArea'] };
    case SKU.capexBase:
    case SKU.capexBaseBle:
    case SKU.capexBaseInovonics:
    case SKU.capexSensor:
    case SKU.capexSoftware:
    case SKU.capexSoftwareUpfront: return { add: ['capex'] };
    case 'FINISH-CONCEALED-LOW':
    case 'FINISH-CONCEALED-HIGH':
    case 'FINISH-STANDARD-CREDIT': return { add: ['finish'] };
    default: return null;
  }
}

/** A community set up for the deal's products: monitoring and E-Call on (by care type) only where the deal has them. */
export function fitCommunity(d: QuoteDraft, c: DraftCommunity): DraftCommunity {
  if (!Array.isArray(d.products)) return c;
  const ps = dealProducts(d);
  const mon = ps.includes('subscription') || ps.includes('capex');
  const ec = ps.includes('ecall');
  const def = defaultProducts();
  const products = Object.fromEntries(BED_KEYS.map((k) => [k, { monitoring: mon && def[k].monitoring, ecall: ec && def[k].ecall }])) as ReturnType<typeof defaultProducts>;
  return { ...c, products, monitoring: mon, ecall: ec };
}
