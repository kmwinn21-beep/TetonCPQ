/**
 * QuoteDraft — everything a rep edits for one quote. This is what the form
 * holds, what a quote version stores (inputs_json), and what toModelInputs()
 * turns into engine inputs. Rates are fractions; money is dollars.
 */
import { applyRoomTypes, type CommonArea, type EcallBilling, type RoomType } from './roomTypes';
import { capexPricingFrom, type CapexPricing } from '@/lib/pricing/capex';
import { finishFrom, normalizeFinish, type FinishSetting } from '@/lib/pricing/finish';
import { normalizeLineup } from '@/lib/pricing/lineup';
import { STANDARD_CASE_METRICS, DEFAULT_CLIENT, type CaseMetrics, type ClientAssumptions, type ComponentToggles, type RoiCase } from '@/lib/model';
import { POLICY, SEED_PRODUCTS, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { defaultPlan, normalizePlan, type ImplementationPlan } from './implementationPlan';
import { normalizeTerms, type TermsSetting } from './terms';
import { normalizeResources, type Resources } from './resources';

export type EcallOption = 'none' | 'ble' | 'inovonics';
/** The four care types a community's beds are split into. */
export type BedKey = 'il' | 'al' | 'mc' | 'snf';
export const BED_KEYS: BedKey[] = ['il', 'al', 'mc', 'snf'];
/** Which products are priced for one care type's beds. */
export interface BedProducts {
  monitoring: boolean;
  ecall: boolean;
}
export type Coverage = 'rooms_only' | 'full_facility';

export interface DraftCommunity {
  id: string;
  name: string;
  /** City; with the state (market) it reads "Louisville, KY". */
  city?: string;
  /** Products priced for each care type's beds (IL starts with neither). Missing on communities saved before
   *  per-care-type products: every care type then takes `monitoring` and `ecall`. */
  products?: Partial<Record<BedKey, BedProducts>>;
  /** @deprecated community-wide resident monitoring, from before `products`. Kept in step with them (any care type). */
  monitoring?: boolean;
  market: string;
  /** Beds by care type. Every bed is priced the same; the split is for scope and reporting. */
  ilBeds: number;
  alBeds: number;
  mcBeds: number;
  /** Skilled nursing beds. */
  snfBeds: number;
  /** @deprecated single bed count from before the IL/AL/MC split; normalizeDraft moves it to alBeds. */
  beds?: number;
  coverage: Coverage;
  /** Takes the deal's e-call add-on: kept in step with `products` (any care type). */
  ecall: boolean;
  pilot: boolean;
  /** null = whole community is in the pilot. */
  pilotUnits: number | null;
  /** null = deal occupancy. */
  occupancy: number | null;
  /** 'yyyy-mm'; null = default (month 1, or right after the pilot for non-pilot sites). */
  goLiveMonth: string | null;
  /** null = deal ROI start delay. */
  roiDelayMonths: number | null;
  additionalSensors: number;
  /** Common-area sensors (outside resident rooms): a setup fee each, then a monthly fee each. Replaces the
   *  full-facility multiplier on new deals (a community still on `coverage: 'full_facility'` keeps the multiplier). */
  commonAreaSensors?: number;
  /** Extra common area sensors on top of those on common areas tagged on the floor plans (a flat number). */
  commonAreaSensorsExtra?: number;
  /** Common area sensors taken off the deal while common areas are tagged: the count is 0, the tags stay. */
  commonAreaOff?: boolean;
  /** Room types from the floor plans (optional). When present they set the beds and additional sensors. */
  roomTypes?: RoomType[];
  /** Allowance for site conditions on top of the plan's sensors (0.03 = 3%). */
  sensorAllowancePct?: number;
  /** Common areas with E-Call pull-cords (each billed per area, per month at the E-Call rate). */
  commonAreas?: CommonArea[];
  /** Contingency on top of the plan's pendants / pull-cords (0.05 = 5%). */
  pendantAllowancePct?: number;
}

export interface Commercial {
  /** Post-pilot platform rate per bed per month. List $99. */
  platformRate: number;
  /** Pilot platform rate per bed per month. Standard $75. */
  pilotRate: number;
  ecall: EcallOption;
  ecallRate: number;
  ecallPilotRate: number;
  /** Install per bed before credits. List $400. */
  installRate: number;
  /** Install credit on pilot communities, 0–1. */
  installCreditPct: number;
  /** One-time E-Call installation per bed at E-Call-only communities (subscription). */
  ecallInstallRate?: number;
  /** @deprecated Replaced by the system-specific device prices (ecallDevices). */
  ecallDevicePrice?: number;
  /** Extra or replacement E-Call devices, each (from the price book; shown as prices only). */
  ecallDevices?: { bleButton: number; inoPendant: number; inoPullcord: number };
  /** E-Call-only deals: the business case compares Bluetooth and Inovonics (the chosen system still prices the deal). */
  ecallCompare?: boolean;
  /** The other system's E-Call rate per bed per month, for the comparison (blank = its list price). */
  ecallCompareRate?: number | null;
  /** E-Call monthly billing: per room (default; devices beyond the rooms are one-time extras) or per device. */
  ecallBilling?: EcallBilling;
  /** The rep chose a custom install credit (installCreditPct then carries it; blank until typed, which blocks saving). */
  installCreditCustom?: boolean;
  installCreditCustomPct?: number | null;
  /** Credit is clawed back if the customer doesn't convert. */
  installClawback: boolean;
  /** Credit on pilot sites' additional sensors, 0–1 (its own setting, same choices as the install credit). */
  sensorCreditPct: number;
  /** The rep chose a custom sensor credit (sensorCreditPct then carries it). */
  sensorCreditCustom?: boolean;
  sensorCreditCustomPct?: number | null;
  /** @deprecated Older deals: on = the install credit also applied to sensors. Read into sensorCreditPct. */
  sensorCredit?: boolean;
  /** Optional introductory platform rate for the first months of the service term. */
  specialRate: number | null;
  specialTermMonths: number;
  /** @deprecated pricing for common areas on older deals (communities with coverage 'full_facility'). */
  fullFacilityMultiplier: number;
  sensorPrice: number;
  /** Skilled nursing beds' rate per bed per month (never above the platform rate). Missing on older deals: SNF beds at the platform rate. */
  snfRate?: number | null;
  /** Teton One + E-Call bundle: taken off each bed with both, per month, by E-Call system. Missing on older deals: none. */
  bundleDiscount?: { ble: number; inovonics: number };
  /** Common-area sensors: setup each (one-time) and monthly each. */
  commonArea?: { setup: number; monthly: number };
  /** Equipment-purchase (CapEx) prices for this deal. */
  capex: CapexPricing;
  /** Installation finish: standard (included) or concealed (an add-on range per room). */
  finish: FinishSetting;
  /** Deal prices of generically priced items, by SKU (missing: the item's list price in the deal's line-up). */
  items?: Record<string, number>;
}

/** How the investment is presented to the customer. */
export type Presentation = 'opex' | 'capex' | 'both';

export interface QuoteDraft {
  customerName: string;
  roiCase: RoiCase;
  components: ComponentToggles;
  /** false = the workbook's uniform metrics (one value for every case). */
  customizeCaseMetrics: boolean;
  caseMetrics: Record<RoiCase, CaseMetrics>;
  valuation: { capRate: number; operatingMargin: number };
  monthsUntilCocNoticed: number;
  client: Omit<ClientAssumptions, 'avgRevenuePerResident'> & { avgRevenuePerResidentOverride: number | null };
  cfo: { annualDiscountRate: number; portfolioUnitsOverride: number | null; reimbursementPerOccupiedUnitMonth: number };
  schedule: {
    withPilot: boolean;
    pilotLengthMonths: number;
    roiStartDelayMonths: number;
    rampMonths: number;
    horizonMonths: number;
    includeReimbursement: boolean;
  };
  implementation: {
    /** Also month 1 of the cash flow. */
    desiredGoLive: string;
    communicationWeeks: number;
    installationWeeks: number;
    baselineWeeks: number;
    onboardingDays: number;
  };
  /** Stage lengths from contract to go-live, worked back from pilot go-live dates. */
  implementationPlan: ImplementationPlan;
  /** Terms / Notes on the proposal. null = the standard terms for this deal. */
  terms: TermsSetting | null;
  /** Next steps (business case): null = the standard steps. */
  nextSteps: TermsSetting | null;
  /** The customer's estimated hours by role and implementation stage. */
  resources: Resources;
  commercial: Commercial;
  presentation: Presentation;
  communities: DraftCommunity[];
  /** The products the rep added from the price book (see lib/quote/products). Missing on older deals: implied by the settings. */
  products?: import('./products').DealProduct[];
  /** The core products line-up this deal was built with (lib/pricing/lineup). Missing: the default line-up. */
  lineup?: import('@/lib/pricing/lineup').Lineup;
  /** Core products added in the price book that the rep picked (built-in ones follow from products). */
  extraCores?: string[];
}

const { avgRevenuePerResident: _derived, ...clientDefaults } = DEFAULT_CLIENT;

export function newCommunity(i: number): DraftCommunity {
  return {
    id: `c${Date.now().toString(36)}${i}`,
    name: '',
    city: '',
    market: '',
    ilBeds: 0,
    alBeds: 0,
    mcBeds: 0,
    snfBeds: 0,
    coverage: 'rooms_only',
    ecall: true,
    products: defaultProducts(),
    pilot: false,
    pilotUnits: null,
    occupancy: null,
    goLiveMonth: null,
    roiDelayMonths: null,
    additionalSensors: 0,
  };
}

/** The bundle's saving per bed per month: subscription + E-Call list prices, less the bundle's list price (not below $0). */
export function bundleDiscountFrom(book: PriceBook): { ble: number; inovonics: number } {
  const p = book[SKU.platform]?.list ?? 99;
  const d = (ecall: string, bundle: string, fe: number, fb: number) => Math.max(0, Math.round((p + (book[ecall]?.list ?? fe) - (book[bundle]?.list ?? fb)) * 100) / 100);
  return { ble: d(SKU.ecallBle, SKU.bundleBle, 10, 105), inovonics: d(SKU.ecallInovonics, SKU.bundleInovonics, 15, 110) };
}

export function defaultDraft(customerName: string, book: PriceBook, today = new Date(), opts: { softwareBilling?: 'monthly' | 'upfront' } = {}): QuoteDraft {
  // Default go-live: first of the month, three months out.
  const goLive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 1)).toISOString().slice(0, 10);
  return {
    customerName,
    roiCase: 'target',
    components: {
      careRevenueRecapture: true,
      fallsHospitalization: true,
      fallsDischarge: true,
      staffingAlignment: true,
      moveInImpact: true,
      techReplacement: true,
    },
    customizeCaseMetrics: true,
    caseMetrics: structuredClone(STANDARD_CASE_METRICS),
    valuation: { capRate: 0.09, operatingMargin: 0.35 },
    monthsUntilCocNoticed: 6,
    client: { ...clientDefaults, avgRevenuePerResidentOverride: null },
    cfo: { annualDiscountRate: 0.08, portfolioUnitsOverride: null, reimbursementPerOccupiedUnitMonth: 86 },
    schedule: { withPilot: true, pilotLengthMonths: POLICY.standardPilotMonths, roiStartDelayMonths: 3, rampMonths: 3, horizonMonths: 36, includeReimbursement: false },
    implementation: { desiredGoLive: goLive, communicationWeeks: 3, installationWeeks: 1, baselineWeeks: 4, onboardingDays: 3 },
    implementationPlan: defaultPlan(),
    terms: null,
    nextSteps: null,
    resources: [],
    commercial: {
      platformRate: book[SKU.platform]?.list ?? 99,
      pilotRate: POLICY.standardPilotRate,
      ecall: 'ble',
      ecallRate: book[SKU.ecallBle]?.list ?? 10,
      ecallPilotRate: 0, // E-Call is free during the pilot
      ecallBilling: 'room',
      installRate: book[SKU.install]?.list ?? 400,
      installCreditPct: 0,
      installClawback: false,
      sensorCreditPct: 0,
      specialRate: null,
      specialTermMonths: 0,
      fullFacilityMultiplier: book[SKU.fullFacility]?.list ?? 1.3,
      sensorPrice: book[SKU.sensor]?.list ?? 300,
      snfRate: book[SKU.snf]?.list ?? 49,
      bundleDiscount: bundleDiscountFrom(book),
      commonArea: { setup: book[SKU.commonAreaSetup]?.list ?? 200, monthly: book[SKU.commonAreaMonthly]?.list ?? 50 },
      ecallDevices: { bleButton: book[SKU.ecallBleButton]?.list ?? 100, inoPendant: book[SKU.ecallInoPendant]?.list ?? 160, inoPullcord: book[SKU.ecallInoPullcord]?.list ?? 150 },
      capex: { ...capexPricingFrom((sku) => book[sku]?.list), softwareBilling: opts.softwareBilling ?? 'monthly' },
      finish: finishFrom((sku) => book[sku]?.list),
    },
    presentation: 'opex',
    communities: [{ ...newCommunity(0), pilot: true }],
  };
}

/**
 * Fill fields added after a draft was saved, so older drafts and versions
 * still load. Only adds what's missing; never changes a value that's there.
 */
export function normalizeDraft(d: QuoteDraft): QuoteDraft {
  return {
    ...d,
    presentation: d.presentation ?? 'opex',
    implementationPlan: normalizePlan(d.implementationPlan),
    terms: normalizeTerms(d.terms),
    nextSteps: normalizeTerms(d.nextSteps, 'nextSteps'),
    resources: normalizeResources(d.resources),
    commercial: normalizeCommercial(d.commercial),
    communities: (d.communities ?? []).map((c) => applyRoomTypes(normalizeCommunity(c))),
    ...(d.lineup ? { lineup: normalizeLineup(d.lineup) } : {}),
  };
}

/** Drafts from before equipment-purchase pricing had a capex discount rate instead: drop it, add the list prices. */
function normalizeCommercial(c: Commercial): Commercial {
  const { capexDiscountRate: _old, sensorCredit: _was, ...rest } = c as Commercial & { capexDiscountRate?: number };
  const sensorCreditOf = (r: Commercial) => {
    const pct = Number(r.sensorCreditPct);
    // Older deals had an on/off switch that reused the install credit.
    if (!Number.isFinite(pct)) return { sensorCreditPct: _was === true ? r.installCreditPct ?? 0 : 0 };
    return { sensorCreditPct: Math.min(1, Math.max(0, pct)) };
  };
  const seedList = (sku: string, fb: number) => SEED_PRODUCTS.find((p) => p.sku === sku)?.list ?? fb;
  const capex = { ...capexPricingFrom(() => undefined), ...(rest.capex ?? {}) };
  // The first E-Call purchase figures ($115 / $170) gave way to the pricing workbook's ($165 / $480).
  if (capex.ecallInstallBle === 115) capex.ecallInstallBle = 165;
  if (capex.ecallInstallInovonics === 170) capex.ecallInstallInovonics = 480;
  const devices = rest.ecallDevices ?? { bleButton: seedList(SKU.ecallBleButton, 100), inoPendant: seedList(SKU.ecallInoPendant, 160), inoPullcord: seedList(SKU.ecallInoPullcord, 150) };
  // Older deals: billed monthly (as they were). SNF rate, bundle discount: absent = none (their totals don't change).
  capex.softwareBilling = capex.softwareBilling === 'upfront' ? 'upfront' : 'monthly';
  const commonArea = rest.commonArea ?? { setup: seedList(SKU.commonAreaSetup, 200), monthly: seedList(SKU.commonAreaMonthly, 50) };
  return { ...rest, ecallDevices: devices, capex, commonArea, finish: normalizeFinish(rest.finish), ...sensorCreditOf(rest), ecallBilling: rest.ecallBilling === 'device' ? 'device' : 'room' };
}

/** One additional E-Call device beyond the rooms (per-room billing): a Bluetooth button, or an Inovonics pull-cord. */
export function extraDevicePrice(k: Pick<Commercial, 'ecall' | 'ecallDevices'>): number {
  const d = k.ecallDevices ?? { bleButton: 100, inoPendant: 160, inoPullcord: 150 };
  return k.ecall === 'inovonics' ? d.inoPullcord : d.bleButton;
}

/** Communities saved before the IL/AL/MC split had one bed count: it becomes AL. */
export function normalizeCommunity(c: DraftCommunity): DraftCommunity {
  const { beds: _legacy, ...rest } = c;
  const b = bedsByCare(c);
  // Products per care type (older communities: their community-wide switches, for every care type).
  const products = productsOf(c);
  const withProducts = { ...rest, ilBeds: b.il, alBeds: b.al, mcBeds: b.mc, snfBeds: b.snf, products };
  return { ...withProducts, monitoring: monitors(withProducts), ecall: hasEcall(withProducts) };
}

/** New communities: independent living beds start with no products; the rest with both. */
export const defaultProducts = (): Record<BedKey, BedProducts> => ({
  il: { monitoring: false, ecall: false },
  al: { monitoring: true, ecall: true },
  mc: { monitoring: true, ecall: true },
  snf: { monitoring: true, ecall: true },
});

/** The same products on every care type. */
export const allProducts = (p: BedProducts): Record<BedKey, BedProducts> => Object.fromEntries(BED_KEYS.map((k) => [k, { ...p }])) as Record<BedKey, BedProducts>;

type CommunityLike = Partial<DraftCommunity> | undefined | null;

/** Each care type's products (communities from before per-care-type products: the community-wide switches for all four). */
export function productsOf(c: CommunityLike): Record<BedKey, BedProducts> {
  const legacy: BedProducts = { monitoring: c?.monitoring !== false, ecall: c?.ecall !== false };
  const p = c?.products;
  return Object.fromEntries(
    BED_KEYS.map((k) => {
      const x = p?.[k];
      return [k, x ? { monitoring: x.monitoring === true, ecall: x.ecall === true } : p ? defaultProducts()[k] : legacy];
    }),
  ) as Record<BedKey, BedProducts>;
}

/** Beds by care type. Tolerates un-normalized legacy communities (one bed count = assisted living). */
export function bedsByCare(c: CommunityLike): Record<BedKey, number> {
  const split = c?.ilBeds != null || c?.alBeds != null || c?.mcBeds != null;
  return {
    il: split ? Number(c?.ilBeds) || 0 : 0,
    al: split ? Number(c?.alBeds) || 0 : Number(c?.beds) || 0,
    mc: split ? Number(c?.mcBeds) || 0 : 0,
    snf: Number(c?.snfBeds) || 0,
  };
}

/** What a community's beds are priced with. */
export interface CommunityScope {
  /** Every bed. */
  beds: number;
  /** Beds with resident monitoring (Edge units, sensors, subscription, ROI). */
  monitored: number;
  /** Beds with E-Call (with or without monitoring). */
  ecall: number;
  /** Of those, beds with monitoring too. */
  monitoredEcall: number;
  /** Beds with E-Call and no monitoring. */
  ecallOnly: number;
  /** Beds with at least one product. */
  priced: number;
  /** Beds with no product (left out of the pricing). */
  unpriced: number;
  /** Beds of each care type that are priced, and that are monitored. */
  pricedByCare: Record<BedKey, number>;
  monitoredByCare: Record<BedKey, number>;
  /** The products every priced bed shares; null when they differ by care type. */
  uniform: BedProducts | null;
}

/**
 * A community's scope from its beds and each care type's products. E-Call only counts when the deal has
 * E-Call (`ecallOn`). With no beds yet, `uniform` follows the care types' settings.
 */
export function scopeOf(c: CommunityLike, ecallOn = true): CommunityScope {
  const beds = bedsByCare(c);
  const p = productsOf(c);
  const z = () => ({ il: 0, al: 0, mc: 0, snf: 0 }) as Record<BedKey, number>;
  const s: CommunityScope = { beds: 0, monitored: 0, ecall: 0, monitoredEcall: 0, ecallOnly: 0, priced: 0, unpriced: 0, pricedByCare: z(), monitoredByCare: z(), uniform: null };
  const combos = new Set<string>();
  for (const k of BED_KEYS) {
    const n = beds[k];
    const m = p[k].monitoring;
    const e = ecallOn && p[k].ecall;
    s.beds += n;
    if (m) { s.monitored += n; s.monitoredByCare[k] = n; }
    if (e) s.ecall += n;
    if (m && e) s.monitoredEcall += n;
    if (e && !m) s.ecallOnly += n;
    if (m || e) { s.priced += n; s.pricedByCare[k] = n; if (n > 0) combos.add(`${m}:${e}`); }
    else s.unpriced += n;
  }
  if (combos.size === 1) {
    const [m, e] = Array.from(combos)[0].split(':');
    s.uniform = { monitoring: m === 'true', ecall: e === 'true' };
  } else if (combos.size === 0) {
    // No priced beds yet: the first care type with a product (assisted living first).
    const k = (['al', 'mc', 'snf', 'il'] as const).find((x) => p[x].monitoring || (ecallOn && p[x].ecall));
    s.uniform = k ? { monitoring: p[k].monitoring, ecall: ecallOn && p[k].ecall } : { monitoring: true, ecall: false };
  }
  return s;
}

/** Whether a community has resident monitoring on any of its beds (else it is E-Call only, or not priced). */
export const monitors = (c: CommunityLike) => {
  const s = scopeOf(c);
  return s.beds > 0 ? s.monitored > 0 : !!s.uniform?.monitoring;
};

/** A deal with E-Call and no Resident Monitoring anywhere (the business case then shows E-Call only). */
export const isEcallOnlyDeal = (d: Pick<QuoteDraft, 'commercial' | 'communities'>) =>
  d.commercial.ecall !== 'none' && d.communities.length > 0 && !d.communities.some((c) => monitors(c)) && d.communities.some((c) => hasEcall(c));

/** Whether a community has E-Call on any of its beds (ignores whether the deal offers E-Call). */
export const hasEcall = (c: CommunityLike) => {
  const s = scopeOf(c);
  return s.beds > 0 ? s.ecall > 0 : BED_KEYS.some((k) => productsOf(c)[k].ecall);
};

/** Beds that are priced (have at least one product). */
export const pricedBedsOf = (c: CommunityLike, ecallOn = true) => scopeOf(c, ecallOn).priced;

/** "Louisville, KY", "Louisville", "KY" or "" from the community's city and state. */
export const placeOf = (c: Pick<DraftCommunity, 'city' | 'market'>) => [c.city?.trim(), c.market?.trim()].filter(Boolean).join(', ');

/** Total beds (IL + AL + MC + SNF), priced or not. Tolerates un-normalized legacy communities. */
export function bedsOf(c: Partial<DraftCommunity> | undefined | null): number {
  if (!c) return 0;
  const b = bedsByCare(c);
  return b.il + b.al + b.mc + b.snf;
}
