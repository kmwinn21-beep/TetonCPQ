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
} as const;

export const SEED_PRODUCTS: Product[] = [
  { sku: SKU.platform, name: 'Teton subscription', pricingModel: 'per_bed_month', list: 99, description: 'Ambient monitoring platform, support and analytics, per bed per month. SNF beds priced the same.' },
  { sku: SKU.install, name: 'Installation & implementation', pricingModel: 'per_bed_once', list: 400, description: 'One-time, per bed.' },
  { sku: SKU.ecallBle, name: 'E-Call (Bluetooth)', pricingModel: 'per_bed_month', list: 10, description: 'Add-on nurse call on Teton’s Bluetooth network.' },
  { sku: SKU.ecallInovonics, name: 'E-Call (Inovonics)', pricingModel: 'per_bed_month', list: 15, description: 'Add-on nurse call on Inovonics 900 MHz; supports UL 2560 path.' },
  { sku: SKU.fullFacility, name: 'Full-facility coverage', pricingModel: 'multiplier', list: 1.3, description: 'Common areas and hallways. Typical range 1.2–1.4× rooms-only.' },
  { sku: SKU.sensor, name: 'Additional sensor', pricingModel: 'per_unit_once', list: 300, description: 'One-time, per sensor.' },
];

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
} as const;
