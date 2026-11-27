/**
 * US price book. This is the seed for the `products` table; the database copy
 * is what the app reads, so prices can change without a deploy and every quote
 * keeps the prices it was built with.
 */

export type PricingModel = 'per_bed_month' | 'per_bed_once' | 'per_unit_once' | 'per_unit_month' | 'multiplier';

export interface Product {
  sku: string;
  name: string;
  pricingModel: PricingModel;
  /** List price in dollars (or the multiplier, for pricingModel 'multiplier'). */
  list: number;
  description: string;
  /** The price book SKU reps see (editable); `sku` is the system key. */
  itemCode?: string | null;
  /** How often it bills: monthly, once, or every N years (everyYears). Missing: from pricingModel. */
  billing?: Billing;
  everyYears?: number | null;
  /** What one unit is (for wording): a bed, room, sensor, device, community, or a flat fee. */
  per?: PerUnit | null;
  /** Items priced generically (added in the price book): what the quantity is, and how pilots treat it. */
  counted?: CountBasis | null;
  pilotRule?: PilotRule | null;
  /** Where it sits in the price book (items added in the price book; built-in ones use lib/pricing/markets). */
  category?: string | null;
  sub?: string | null;
  /** Priced generically (quantity × deal price × billing) instead of by a built-in role. */
  generic?: boolean;
}

export type Billing = 'monthly' | 'once' | 'years';
export type PerUnit = 'bed' | 'room' | 'sensor' | 'device' | 'community' | 'flat';
/** The quantity of a generically priced item, per community, from Communities and Scope. */
export type CountBasis = 'monitoredBeds' | 'ecallBeds' | 'ecallOnlyBeds' | 'monitoredEcallBeds' | 'rooms' | 'snfBeds' | 'commonAreaSensors' | 'additionalSensors' | 'perCommunity';
/** Monthly items: billed during the pilot or free; one-time items: credited on pilot sites or not. */
export type PilotRule = 'free' | 'charged' | 'credited' | 'none';

export const BILLING_LABEL: Record<Billing, string> = { monthly: 'Monthly', once: 'One-time', years: 'Every N years' };
export const PER_LABEL: Record<PerUnit, string> = { bed: 'bed', room: 'room', sensor: 'sensor', device: 'device', community: 'community', flat: 'flat fee' };
export const COUNT_LABEL: Record<CountBasis, string> = {
  monitoredBeds: 'per monitored bed',
  ecallBeds: 'per E-Call bed',
  ecallOnlyBeds: 'per E-Call-only bed',
  monitoredEcallBeds: 'per bed with monitoring and E-Call',
  rooms: 'per room (every priced bed)',
  snfBeds: 'per skilled nursing bed',
  commonAreaSensors: 'per common-area sensor',
  additionalSensors: 'per additional sensor (from the scope)',
  perCommunity: 'one per community',
};
export const COUNT_BASES = Object.keys(COUNT_LABEL) as CountBasis[];

/** A product's billing (stored, or from its pricing model). */
export const billingOf = (p: Pick<Product, 'billing' | 'pricingModel'>): Billing => p.billing ?? (p.pricingModel === 'per_bed_month' || p.pricingModel === 'per_unit_month' ? 'monthly' : 'once');

/** The pricing model a billing and unit come to (kept for older readers of pricing_model). */
export const pricingModelFor = (billing: Billing, per: PerUnit | null | undefined): PricingModel => (billing === 'monthly' ? (per === 'bed' ? 'per_bed_month' : 'per_unit_month') : per === 'bed' ? 'per_bed_once' : 'per_unit_once');

export const SKU = {
  platform: 'TETON-PLATFORM',
  /** Skilled nursing beds: their own (lower) subscription rate. */
  snf: 'TETON-SNF',
  /** Teton One + E-Call bundles: the subscription with E-Call, per bed per month (less than the two added up). */
  bundleBle: 'BUNDLE-ECALL-BLE',
  bundleInovonics: 'BUNDLE-ECALL-INOVONICS',
  install: 'TETON-INSTALL',
  ecallBle: 'ECALL-BLE',
  ecallInovonics: 'ECALL-INOVONICS',
  fullFacility: 'COVERAGE-FULL-FACILITY',
  sensor: 'SENSOR-ADDITIONAL',
  // Common areas: sensors outside resident rooms, priced each (setup once, then monthly).
  commonAreaSetup: 'COMMON-AREA-SETUP',
  commonAreaMonthly: 'COMMON-AREA-MONTHLY',
  // Equipment purchase (CapEx): title passes at install, perpetual embedded license.
  capexBase: 'CAPEX-BASE',
  capexBaseBle: 'CAPEX-BASE-ECALL-BLE',
  capexBaseInovonics: 'CAPEX-BASE-ECALL-INOVONICS',
  capexSensor: 'CAPEX-SENSOR',
  capexSoftware: 'CAPEX-SOFTWARE',
  /** The same software & services paid once upfront (per room), when a deal bills software upfront. */
  capexSoftwareUpfront: 'CAPEX-SOFTWARE-UPFRONT',
  capexBleRenewal: 'CAPEX-ECALL-BLE-RENEWAL',
  capexInovonicsRenewal: 'CAPEX-ECALL-INOVONICS-RENEWAL',
  // Extra or replacement E-Call devices, each: billed one-time beyond the rooms when E-Call is priced per room.
  ecallBleButton: 'ECALL-BLE-BUTTON',
  ecallInoPendant: 'ECALL-INOVONICS-PENDANT',
  ecallInoPullcord: 'ECALL-INOVONICS-PULLCORD',
  capexEcallInstallBle: 'CAPEX-ECALL-INSTALL-BLE',
  capexEcallInstallInovonics: 'CAPEX-ECALL-INSTALL-INOVONICS',
  capexEcallDevice: 'CAPEX-ECALL-DEVICE',
  capexEcallSoftware: 'CAPEX-ECALL-SOFTWARE',
  capexEcallSoftwareUpfront: 'CAPEX-ECALL-SOFTWARE-UPFRONT',
  // Installation finish: concealed cabling, quoted as a range per room pending the site survey.
  finishConcealedLow: 'FINISH-CONCEALED-LOW',
  finishConcealedHigh: 'FINISH-CONCEALED-HIGH',
  finishStandardCredit: 'FINISH-STANDARD-CREDIT',
} as const;

export const SEED_PRODUCTS: Product[] = [
  { sku: SKU.platform, name: 'Teton subscription', pricingModel: 'per_bed_month', list: 99, description: 'Ambient monitoring platform, support and analytics, per bed per month (Teton One).' },
  { sku: SKU.snf, name: 'Teton subscription — skilled nursing', pricingModel: 'per_bed_month', list: 49, description: 'Skilled nursing (SNF) beds, per bed per month.' },
  { sku: SKU.bundleBle, name: 'Teton One + E-Call (Bluetooth) bundle', pricingModel: 'per_bed_month', list: 105, description: 'Subscription with Bluetooth E-Call on the same bed, per bed per month. The saving against the two added up is taken off as a bundle discount.' },
  { sku: SKU.bundleInovonics, name: 'Teton One + E-Call (Inovonics) bundle', pricingModel: 'per_bed_month', list: 110, description: 'Subscription with Inovonics E-Call on the same bed, per bed per month. The saving against the two added up is taken off as a bundle discount.' },
  { sku: SKU.install, name: 'Installation & implementation', pricingModel: 'per_bed_once', list: 400, description: 'One-time, per bed.' },
  { sku: SKU.ecallBle, name: 'E-Call (Bluetooth)', pricingModel: 'per_bed_month', list: 10, description: 'Add-on nurse call on Teton’s Bluetooth network.' },
  { sku: SKU.ecallInovonics, name: 'E-Call (Inovonics)', pricingModel: 'per_bed_month', list: 15, description: 'Add-on nurse call on Inovonics 900 MHz; supports UL 2560 path.' },
  { sku: SKU.fullFacility, name: 'Full-facility coverage', pricingModel: 'multiplier', list: 1.3, description: 'Older deals only: common areas priced as a markup on rooms-only. New deals price common-area sensors each.' },
  { sku: SKU.sensor, name: 'Additional sensor', pricingModel: 'per_unit_once', list: 300, description: 'One-time, per sensor.' },
  { sku: SKU.commonAreaSetup, name: 'Common area setup', pricingModel: 'per_unit_once', list: 200, description: 'Per common-area sensor, one-time.' },
  { sku: SKU.commonAreaMonthly, name: 'Common area', pricingModel: 'per_unit_month', list: 50, description: 'Per common-area sensor, per month.' },
  { sku: SKU.capexBase, name: 'Base package', pricingModel: 'per_bed_once', list: 4570, description: 'Edge unit + sensor, installed. No separate installation charge and no license fee; title passes at install.' },
  { sku: SKU.capexBaseBle, name: 'Base package + E-Call (Bluetooth/WiFi)', pricingModel: 'per_bed_once', list: 5300, description: 'Teton One + E-Call: base package plus E-Call pendant and wall-mount pendant. Replaces the base package price for beds with E-Call.' },
  { sku: SKU.capexBaseInovonics, name: 'Base package + Inovonics E-Call', pricingModel: 'per_bed_once', list: 5450, description: 'Teton One + Inovonics E-Call: base package plus E-Call pendant and wall-mount pull cord. Replaces the base package price for beds with E-Call.' },
  { sku: SKU.capexSensor, name: 'Additional sensor', pricingModel: 'per_unit_once', list: 450, description: 'One-time, per sensor.' },
  { sku: SKU.capexSoftware, name: 'Software and services', pricingModel: 'per_bed_month', list: 10, description: 'Per bed per month, when software is billed monthly.' },
  { sku: SKU.capexSoftwareUpfront, name: 'Software and services, upfront', pricingModel: 'per_bed_once', list: 480, description: 'Per bed, one-time, when software is billed upfront (covers the 4-year ownership period).' },
  { sku: SKU.capexBleRenewal, name: 'E-Call (Bluetooth/WiFi) renewal', pricingModel: 'per_bed_once', list: 480, description: 'Every 4 years, per bed.' },
  { sku: SKU.capexInovonicsRenewal, name: 'Inovonics E-Call renewal', pricingModel: 'per_bed_once', list: 400, description: 'Every 3 years after the first 3-year contract, per bed.' },
  { sku: SKU.capexEcallInstallBle, name: 'E-Call only installation (Bluetooth/WiFi)', pricingModel: 'per_bed_once', list: 240, description: 'Buying E-Call: per bed, installed, one-time (then E-Call software per bed per month).' },
  { sku: SKU.capexEcallInstallInovonics, name: 'E-Call only installation (Inovonics)', pricingModel: 'per_bed_once', list: 480, description: 'Buying E-Call: per bed, installed, one-time (then E-Call software per bed per month).' },
  { sku: SKU.ecallBleButton, name: 'Bluetooth wearable or wall button', pricingModel: 'per_unit_once', list: 100, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.ecallInoPendant, name: 'Inovonics pendant', pricingModel: 'per_unit_once', list: 160, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.ecallInoPullcord, name: 'Inovonics pull-cord station', pricingModel: 'per_unit_once', list: 150, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.capexEcallDevice, name: 'E-Call device', pricingModel: 'per_unit_once', list: 150, description: 'Each pendant or pull-cord, one-time.' },
  { sku: SKU.capexEcallSoftware, name: 'E-Call software', pricingModel: 'per_bed_month', list: 5, description: 'E-Call only beds, per bed per month (Bluetooth and Inovonics), when software is billed monthly.' },
  { sku: SKU.capexEcallSoftwareUpfront, name: 'E-Call software, upfront', pricingModel: 'per_bed_once', list: 240, description: 'E-Call only beds, per bed, one-time, when software is billed upfront (4 years).' },
  { sku: SKU.finishConcealedLow, name: 'Concealed installation, low estimate', pricingModel: 'per_bed_once', list: 700, description: 'Cables behind the wall and/or above the ceiling, no raceway showing. Per room, pending the site survey.' },
  { sku: SKU.finishConcealedHigh, name: 'Concealed installation, high estimate', pricingModel: 'per_bed_once', list: 1000, description: 'Upper end of the concealed range, per room. Depends on building materials and access; painting not included.' },
  { sku: SKU.finishStandardCredit, name: 'Standard installation credit', pricingModel: 'per_bed_once', list: 400, description: 'Value of the standard (raceway) installation, credited against the concealed price, per room.' },
];

/** Which buying model a product belongs to, for the price book. */
export const productGroup = (sku: string): 'subscription' | 'capex' | 'finish' => (sku.startsWith('CAPEX-') ? 'capex' : sku.startsWith('FINISH-') ? 'finish' : 'subscription');

/** List prices keyed by SKU, as the app reads them. */
export type PriceBook = Record<string, Product>;

export function priceBook(products: Product[] = SEED_PRODUCTS): PriceBook {
  return Object.fromEntries(products.map((p) => [p.sku, p]));
}

/** Pricing policy (US). Rules, not prices — change here and in the tests together. */
export const POLICY = {
  standardPilotRate: 75,
  standardPilotMonths: 3,
  serviceTermMonths: 36,
  postPilotFloor: 89,
  /** Below this fraction of list routes to Deal Desk. */
  hardFloorPct: 0.5,
  /** Service-term rate below this fraction of list is a soft warning. */
  serviceTermFloorPct: 0.9,
  fullFacilityRange: [1.2, 1.4] as const,
  /** Equipment purchase: cost of ownership is shown over the hardware's useful life. */
  capexOwnershipMonths: 48,
  capexBleRenewalYears: 4,
  capexInovonicsRenewalYears: 3,
} as const;

/** Item details of the built-in items (filled in where a product has none; admins' edits are kept). */
export const BUILTIN_DETAILS: Record<string, { billing: Billing; everyYears?: number; per: PerUnit }> = Object.fromEntries(
  SEED_PRODUCTS.filter((p) => p.pricingModel !== 'multiplier').map((p) => {
    const sensor = [SKU.sensor, SKU.capexSensor, SKU.commonAreaSetup, SKU.commonAreaMonthly].includes(p.sku as never);
    const device = [SKU.ecallBleButton, SKU.ecallInoPendant, SKU.ecallInoPullcord, SKU.capexEcallDevice].includes(p.sku as never);
    const room = p.sku.startsWith('FINISH-');
    const years = p.sku === SKU.capexBleRenewal ? POLICY.capexBleRenewalYears : p.sku === SKU.capexInovonicsRenewal ? POLICY.capexInovonicsRenewalYears : undefined;
    const billing: Billing = years ? 'years' : billingOf(p);
    return [p.sku, { billing, ...(years ? { everyYears: years } : {}), per: sensor ? 'sensor' : device ? 'device' : room ? 'room' : 'bed' }];
  }),
);
