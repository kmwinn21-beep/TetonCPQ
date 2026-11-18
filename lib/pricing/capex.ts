/**
 * Equipment purchase (CapEx). The customer buys the hardware outright: title
 * passes at install and the embedded license is perpetual, so nearly all of
 * the cost is a capital purchase.
 *
 * Per community (beds = resident rooms):
 *   base packages      = beds × base package price, where the price depends on
 *                        the community's E-Call: base / + E-Call (Bluetooth) /
 *                        + Inovonics E-Call (the complete-solution prices)
 *   additional sensors = sensors × sensor price
 *   one-time equipment = base packages + additional sensors (no separate install, no license fee)
 *   conversion credit  = a deal's per-unit credit on pilot communities, taken off both the
 *                        base package price per bed and the additional sensor price (not below $0)
 *   software           = beds × software rate, per month
 * Cost of ownership over the hardware's useful life (48 months):
 *   equipment + software × 48 + E-Call renewals that fall inside it
 *   (Bluetooth renews every 4 years, Inovonics every 3 years).
 *
 * Not in the ROI workbook; the subscription pricing drives the ROI model.
 */
import { SEED_PRODUCTS, SKU, POLICY } from './catalog';
import { derived, input, type Trace } from '@/lib/model/trace';
import type { EcallOption, QuoteDraft } from '@/lib/quote/draft';
import { bedsOf } from '@/lib/quote/draft';

/** A deal's equipment-purchase prices (copied from the price book when the deal is created). */
export interface CapexPricing {
  basePrice: number;
  bleBasePrice: number;
  inovonicsBasePrice: number;
  sensorPrice: number;
  /** Software and services, per bed per month. */
  softwareRate: number;
  bleRenewal: number;
  inovonicsRenewal: number;
  /** Per bed and per additional sensor, off the price at pilot communities (0 or blank = none). Not in the price book. */
  conversionCredit?: number | null;
}

const seed = (sku: string, fallback: number) => SEED_PRODUCTS.find((p) => p.sku === sku)?.list ?? fallback;

/** Prices from a price book (or the standard list when a product is missing). */
export function capexPricingFrom(list: (sku: string) => number | undefined): CapexPricing {
  const get = (sku: string, fb: number) => list(sku) ?? seed(sku, fb);
  return {
    basePrice: get(SKU.capexBase, 4600),
    bleBasePrice: get(SKU.capexBaseBle, 5300),
    inovonicsBasePrice: get(SKU.capexBaseInovonics, 5450),
    sensorPrice: get(SKU.capexSensor, 450),
    softwareRate: get(SKU.capexSoftware, 10),
    bleRenewal: get(SKU.capexBleRenewal, 480),
    inovonicsRenewal: get(SKU.capexInovonicsRenewal, 400),
  };
}
export const DEFAULT_CAPEX_PRICING: CapexPricing = capexPricingFrom(() => undefined);

export interface CapexCommunity {
  name: string;
  beds: number;
  ecall: EcallOption;
  /** Price per bed after any conversion credit, and before it. */
  basePerBed: number;
  listPerBed?: number;
  basePackages: number;
  sensors: number;
  /** Price per additional sensor after any conversion credit, and before it. */
  sensorPrice?: number;
  listSensorPrice?: number;
  /** The conversion credit applied to each bed and sensor here (pilot communities only). */
  credit?: number;
  sensorCost: number;
  equipment: number;
  softwareMonthly: number;
  renewals: number;
}

export interface CapexResult {
  /** Marks results from this equipment-purchase model (older saved versions used a different one). */
  model: 'equipment';
  ownershipMonths: number;
  pricing: CapexPricing;
  communities: CapexCommunity[];
  beds: number;
  sensors: number;
  basePackages: number;
  sensorCost: number;
  /** One-time equipment cost, paid at install. */
  equipment: number;
  softwareMonthly: number;
  /** Software over the ownership period. */
  software: number;
  /** E-Call renewals that fall inside the ownership period. */
  renewals: number;
  /** Equipment + software + renewals over the ownership period. */
  ownershipTotal: number;
  /** Equipment ÷ cost of ownership. */
  equipmentShare: number;
  trace: Trace;
}

export const isEquipmentCapex = (c: unknown): c is Omit<CapexResult, 'trace'> => !!c && typeof c === 'object' && (c as { model?: string }).model === 'equipment';

/** Renewals inside the ownership period: one each time the term ends before the period does. */
const renewalsWithin = (months: number, years: number) => Math.max(0, Math.ceil(months / (years * 12)) - 1);

export function computeCapex(draft: QuoteDraft, ownershipMonths: number = POLICY.capexOwnershipMonths): CapexResult {
  const pricing: CapexPricing = { ...DEFAULT_CAPEX_PRICING, ...(draft.commercial.capex ?? {}) };
  const option = draft.commercial.ecall;
  const conversion = Math.max(0, Number(pricing.conversionCredit) || 0);
  const communities: CapexCommunity[] = draft.communities.map((c) => {
    const beds = bedsOf(c);
    const ecall: EcallOption = option !== 'none' && c.ecall ? option : 'none';
    const listPerBed = ecall === 'ble' ? pricing.bleBasePrice : ecall === 'inovonics' ? pricing.inovonicsBasePrice : pricing.basePrice;
    const credit = draft.schedule?.withPilot && c.pilot ? conversion : 0;
    const basePerBed = Math.max(0, listPerBed - credit);
    const sensorPrice = Math.max(0, pricing.sensorPrice - credit);
    const sensors = Math.max(0, Number(c.additionalSensors) || 0);
    const renewalPerBed =
      ecall === 'ble'
        ? pricing.bleRenewal * renewalsWithin(ownershipMonths, POLICY.capexBleRenewalYears)
        : ecall === 'inovonics'
          ? pricing.inovonicsRenewal * renewalsWithin(ownershipMonths, POLICY.capexInovonicsRenewalYears)
          : 0;
    return {
      name: c.name,
      beds,
      ecall,
      basePerBed,
      listPerBed,
      basePackages: beds * basePerBed,
      sensors,
      sensorPrice,
      listSensorPrice: pricing.sensorPrice,
      credit,
      sensorCost: sensors * sensorPrice,
      equipment: beds * basePerBed + sensors * sensorPrice,
      softwareMonthly: beds * pricing.softwareRate,
      renewals: beds * renewalPerBed,
    };
  });
  const sum = (k: 'beds' | 'sensors' | 'basePackages' | 'sensorCost' | 'equipment' | 'softwareMonthly' | 'renewals') => communities.reduce((s, c) => s + c[k], 0);
  const equipment = sum('equipment');
  const softwareMonthly = sum('softwareMonthly');
  const software = softwareMonthly * ownershipMonths;
  const renewals = sum('renewals');
  const ownershipTotal = equipment + software + renewals;

  const trace = derived('capex.total', 'One-time equipment cost', equipment, 'usd', 'Base packages + Additional sensors', [
    derived('capex.base', 'Base packages', sum('basePackages'), 'usd', 'Σ beds × base package price (by E-Call option)', communities.map((c, i) =>
      derived(`capex.base.c${i}`, `Base packages — ${c.name}`, c.basePackages, 'usd', 'Beds × price per bed', [
        input(`capex.beds.c${i}`, `Beds — ${c.name}`, c.beds, 'count'),
        input(`capex.price.c${i}`, `Price per bed${c.ecall === 'ble' ? ' (with E-Call)' : c.ecall === 'inovonics' ? ' (with Inovonics E-Call)' : ''}${c.credit ? ' after the conversion credit' : ''}`, c.basePerBed, 'usd'),
      ]),
    )),
    derived('capex.sensors', 'Additional sensors', sum('sensorCost'), 'usd', conversion ? 'Sensors × sensor price (less the conversion credit at pilot communities)' : 'Sensors × sensor price', [
      input('capex.sensorCount', 'Additional sensors', sum('sensors'), 'count'),
      input('capex.sensorPrice', 'Price per sensor', pricing.sensorPrice, 'usd'),
      ...(conversion ? [input('capex.conversionCredit', 'Conversion credit per bed and sensor (pilot communities)', conversion, 'usd')] : []),
    ]),
  ]);

  return {
    model: 'equipment',
    ownershipMonths,
    pricing,
    communities,
    beds: sum('beds'),
    sensors: sum('sensors'),
    basePackages: sum('basePackages'),
    sensorCost: sum('sensorCost'),
    equipment,
    softwareMonthly,
    software,
    renewals,
    ownershipTotal,
    equipmentShare: ownershipTotal > 0 ? equipment / ownershipTotal : 0,
    trace,
  };
}

const ECALL_LABEL: Record<EcallOption, string> = { none: 'Base package', ble: 'Base package + E-Call', inovonics: 'Base package + Inovonics E-Call' };

export interface PriceRow {
  /** Unique per row (E-Call option and credit). */
  key: string;
  /** The list price, the conversion credit taken off it (0 = none), and the price after it. */
  list: number;
  credit: number;
  perUnit: number;
  units: number;
  total: number;
}

/** "($4,600 − $250)" when a conversion credit applies, else "$4,600". */
export const unitPriceText = (r: Pick<PriceRow, 'list' | 'credit'>, money: (n: number) => string) => (r.credit > 0 ? `(${money(r.list)} − ${money(r.credit)})` : money(r.list));

/** The conversion credit in this result, if any community has one. */
export const conversionCreditOf = (c: Pick<CapexResult, 'communities'>) => Math.max(0, ...c.communities.map((x) => (x.credit ?? 0)));

/** Base packages grouped by price: one row per E-Call option in use, split where a conversion credit applies. */
export function basePackageRows(c: Pick<CapexResult, 'communities'>): Array<PriceRow & { ecall: EcallOption; label: string; perBed: number; beds: number }> {
  const rows = new Map<string, PriceRow & { ecall: EcallOption; label: string; perBed: number; beds: number }>();
  for (const x of c.communities) {
    if (!x.beds) continue;
    const credit = x.credit ?? 0;
    const list = x.listPerBed ?? x.basePerBed;
    const key = `${x.ecall}:${x.basePerBed}:${credit}`;
    const r = rows.get(key) ?? { key: `${x.ecall}${credit ? '-credited' : ''}`, ecall: x.ecall, label: ECALL_LABEL[x.ecall], perBed: x.basePerBed, list, credit, perUnit: x.basePerBed, units: 0, beds: 0, total: 0 };
    r.beds += x.beds;
    r.units += x.beds;
    r.total += x.basePackages;
    rows.set(key, r);
  }
  return Array.from(rows.values());
}

/** Additional sensors grouped by price: one row, or two where a conversion credit applies to some communities. */
export function sensorRows(c: Pick<CapexResult, 'communities' | 'pricing'>): PriceRow[] {
  const rows = new Map<string, PriceRow>();
  for (const x of c.communities) {
    if (!x.sensors) continue;
    const credit = x.credit ?? 0;
    const list = x.listSensorPrice ?? c.pricing.sensorPrice;
    const per = x.sensorPrice ?? list;
    const k = `${per}:${credit}`;
    const r = rows.get(k) ?? { key: credit ? 'credited' : 'list', list, credit, perUnit: per, units: 0, total: 0 };
    r.units += x.sensors;
    r.total += x.sensorCost;
    rows.set(k, r);
  }
  return Array.from(rows.values());
}
