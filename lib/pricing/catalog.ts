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
}

export const SKU = {
  platform: 'TETON-PLATFORM',
  install: 'TETON-INSTALL',
  ecallBle: 'ECALL-BLE',
  ecallInovonics: 'ECALL-INOVONICS',
  fullFacility: 'COVERAGE-FULL-FACILITY',
  sensor: 'SENSOR-ADDITIONAL',
  // Equipment purchase (CapEx): title passes at install, perpetual embedded license.
  capexBase: 'CAPEX-BASE',
  capexBaseBle: 'CAPEX-BASE-ECALL-BLE',
  capexBaseInovonics: 'CAPEX-BASE-ECALL-INOVONICS',
  capexSensor: 'CAPEX-SENSOR',
  capexSoftware: 'CAPEX-SOFTWARE',
  capexBleRenewal: 'CAPEX-ECALL-BLE-RENEWAL',
  capexInovonicsRenewal: 'CAPEX-ECALL-INOVONICS-RENEWAL',
  // E-Call only: installation per bed, devices beyond the first, and software (shown as post-pilot unit costs).
  ecallDevice: 'ECALL-DEVICE',
  // Extra or replacement E-Call devices, each (shown as prices; not added to totals).
  ecallBleButton: 'ECALL-BLE-BUTTON',
  ecallInoPendant: 'ECALL-INOVONICS-PENDANT',
  ecallInoPullcord: 'ECALL-INOVONICS-PULLCORD',
  capexEcallInstallBle: 'CAPEX-ECALL-INSTALL-BLE',
  capexEcallInstallInovonics: 'CAPEX-ECALL-INSTALL-INOVONICS',
  capexEcallDevice: 'CAPEX-ECALL-DEVICE',
  capexEcallSoftware: 'CAPEX-ECALL-SOFTWARE',
  // Installation finish: concealed cabling, quoted as a range per room pending the site survey.
  finishConcealedLow: 'FINISH-CONCEALED-LOW',
  finishConcealedHigh: 'FINISH-CONCEALED-HIGH',
  finishStandardCredit: 'FINISH-STANDARD-CREDIT',
} as const;

export const SEED_PRODUCTS: Product[] = [
  { sku: SKU.platform, name: 'Teton subscription', pricingModel: 'per_bed_month', list: 99, description: 'Ambient monitoring platform, support and analytics, per bed per month. SNF beds priced the same.' },
  { sku: SKU.install, name: 'Installation & implementation', pricingModel: 'per_bed_once', list: 400, description: 'One-time, per bed.' },
  { sku: SKU.ecallBle, name: 'E-Call (Bluetooth)', pricingModel: 'per_bed_month', list: 10, description: 'Add-on nurse call on Teton’s Bluetooth network.' },
  { sku: SKU.ecallInovonics, name: 'E-Call (Inovonics)', pricingModel: 'per_bed_month', list: 15, description: 'Add-on nurse call on Inovonics 900 MHz; supports UL 2560 path.' },
  { sku: SKU.fullFacility, name: 'Full-facility coverage', pricingModel: 'multiplier', list: 1.3, description: 'Common areas and hallways. Typical range 1.2–1.4× rooms-only.' },
  { sku: SKU.sensor, name: 'Additional sensor', pricingModel: 'per_unit_once', list: 300, description: 'One-time, per sensor.' },
  { sku: SKU.capexBase, name: 'Base package', pricingModel: 'per_bed_once', list: 4600, description: 'Edge unit + sensor, installed. No separate installation charge and no license fee; title passes at install.' },
  { sku: SKU.capexBaseBle, name: 'Base package + E-Call (Bluetooth/WiFi)', pricingModel: 'per_bed_once', list: 5300, description: 'Teton One + E-Call: base package plus E-Call pendant and wall-mount pendant. Replaces the base package price for beds with E-Call.' },
  { sku: SKU.capexBaseInovonics, name: 'Base package + Inovonics E-Call', pricingModel: 'per_bed_once', list: 5450, description: 'Teton One + Inovonics E-Call: base package plus E-Call pendant and wall-mount pull cord. Replaces the base package price for beds with E-Call.' },
  { sku: SKU.capexSensor, name: 'Additional sensor', pricingModel: 'per_unit_once', list: 450, description: 'One-time, per sensor.' },
  { sku: SKU.capexSoftware, name: 'Software and services', pricingModel: 'per_bed_month', list: 10, description: 'Per bed per month, billed monthly.' },
  { sku: SKU.capexBleRenewal, name: 'E-Call (Bluetooth/WiFi) renewal', pricingModel: 'per_bed_once', list: 480, description: 'Every 4 years, per bed.' },
  { sku: SKU.capexInovonicsRenewal, name: 'Inovonics E-Call renewal', pricingModel: 'per_bed_once', list: 400, description: 'Every 3 years after the first 3-year contract, per bed.' },
  { sku: SKU.ecallDevice, name: 'E-Call device', pricingModel: 'per_unit_once', list: 75, description: 'Each additional pendant or pull-cord, one-time.' },
  { sku: SKU.capexEcallInstallBle, name: 'E-Call only installation (Bluetooth/WiFi)', pricingModel: 'per_bed_once', list: 165, description: 'Buying E-Call: per bed, installed, one-time (then E-Call software per bed per month).' },
  { sku: SKU.capexEcallInstallInovonics, name: 'E-Call only installation (Inovonics)', pricingModel: 'per_bed_once', list: 480, description: 'Buying E-Call: per bed, installed, one-time (then E-Call software per bed per month).' },
  { sku: SKU.ecallBleButton, name: 'Bluetooth wearable or wall button', pricingModel: 'per_unit_once', list: 100, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.ecallInoPendant, name: 'Inovonics pendant', pricingModel: 'per_unit_once', list: 160, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.ecallInoPullcord, name: 'Inovonics pull-cord station', pricingModel: 'per_unit_once', list: 150, description: 'Extra or replacement E-Call device, each, one-time.' },
  { sku: SKU.capexEcallDevice, name: 'E-Call device', pricingModel: 'per_unit_once', list: 150, description: 'Each pendant or pull-cord, one-time.' },
  { sku: SKU.capexEcallSoftware, name: 'E-Call software', pricingModel: 'per_bed_month', list: 5, description: 'E-Call only beds, per bed per month (Bluetooth and Inovonics).' },
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
