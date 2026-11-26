/**
 * Markets and the price book's catalog structure.
 *
 * Deals are priced in the US (the `products` table's list prices). The other markets' prices come from the official
 * Teton pricing sheet and are kept for reference in the price book (compare markets, gaps); they don't price deals.
 */
export interface Market {
  code: string;
  name: string;
  currency: string;
  /** How prices are written: "$99", "£70", "875 kr", "CHF 80", "€90". */
  symbol: string;
  after?: boolean;
}

export const MARKETS: Market[] = [
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$' },
  { code: 'UK', name: 'United Kingdom', currency: 'GBP', symbol: '£' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', symbol: ' kr', after: true },
  { code: 'NO', name: 'Norway', currency: 'NOK', symbol: ' kr', after: true },
  { code: 'IS', name: 'Iceland', currency: 'ISK', symbol: ' kr', after: true },
  { code: 'SE', name: 'Sweden', currency: 'SEK', symbol: ' kr', after: true },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', symbol: 'CHF ' },
  { code: 'AT', name: 'Austria', currency: 'EUR', symbol: '€' },
  { code: 'DE', name: 'Germany', currency: 'EUR', symbol: '€' },
];
export const MARKET_CODES = MARKETS.map((m) => m.code);
/** The market deals are priced in. */
export const LIVE_MARKET = 'US';

export function formatMarketPrice(code: string, v: number, decimals = 0): string {
  const m = MARKETS.find((x) => x.code === code) ?? MARKETS[0];
  const n = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, Number.isInteger(v) ? 0 : 2) });
  return m.after ? `${n}${m.symbol}` : `${m.symbol}${n}`;
}

/** A non-US price from the official sheet: a number, or 'ns' (not sold there). Missing: no price on the sheet. */
type Seed = Partial<Record<string, number | 'ns'>>;
const all = (v: number | 'ns'): Seed => Object.fromEntries(MARKET_CODES.filter((c) => c !== 'US').map((c) => [c, v]));
const row = (UK: number | 'ns', DK: number | 'ns', NO: number | 'ns', IS: number | 'ns', SE: number | 'ns', CH: number | 'ns', AT: number | 'ns', DE: number | 'ns'): Seed => ({ UK, DK, NO, IS, SE, CH, AT, DE });

/** Reference prices outside the US, from the official Teton pricing sheet (2026), by product. */
export const MARKET_SEED: Record<string, Seed> = {
  'TETON-PLATFORM': row(70, 875, 1250, 16000, 900, 80, 90, 75),
  'TETON-SNF': all('ns'),
  'BUNDLE-ECALL-BLE': row(75, 975, 1350, 17000, 1000, 85, 95, 80),
  'BUNDLE-ECALL-INOVONICS': all('ns'),
  'TETON-INSTALL': row(300, 2000, 2900, 37000, 4050, 300, 250, 250),
  'ECALL-BLE': row(10, 100, 150, 1850, 125, 10, 10, 10),
  'ECALL-INOVONICS': all('ns'),
  'COMMON-AREA-SETUP': row(200, 1000, 1450, 18500, 2700, 300, 200, 200),
  'COMMON-AREA-MONTHLY': row(35, 450, 650, 8350, 475, 40, 65, 65),
  'SENSOR-ADDITIONAL': row(225, 2000, 2900, 37000, 3050, 250, 275, 275),
  // Equipment purchase: the sheet prices the US and UK only.
  'CAPEX-BASE': { UK: 3375 }, // edge unit £3,050 + sensor £150 + sensor install £175
  'CAPEX-BASE-ECALL-BLE': { UK: 3965 },
  'CAPEX-BASE-ECALL-INOVONICS': { UK: 'ns' },
  'CAPEX-SENSOR': { UK: 325 }, // sensor £150 + install £175
  'CAPEX-SOFTWARE-UPFRONT': { UK: 350 },
  'CAPEX-ECALL-INSTALL-INOVONICS': { UK: 'ns' },
};

/** Where each product sits in the catalog: category, subcategory, and its icon from the card icon pack. */
export interface CatalogPlace {
  category: string;
  sub: string;
  icon: string;
  tint: string;
}
export const CATEGORIES = ['Platform', 'Add-ons', 'Capital purchase', 'Installation finish'] as const;
export const CATALOG: Record<string, CatalogPlace> = {
  'TETON-PLATFORM': { category: 'Platform', sub: 'Subscriptions', icon: 'sensor', tint: 'lilac' },
  'TETON-SNF': { category: 'Platform', sub: 'Subscriptions', icon: 'stethoscope', tint: 'lilac' },
  'BUNDLE-ECALL-BLE': { category: 'Platform', sub: 'Subscriptions', icon: 'call-bell', tint: 'lilac' },
  'BUNDLE-ECALL-INOVONICS': { category: 'Platform', sub: 'Subscriptions', icon: 'call-bell', tint: 'lilac' },
  'TETON-INSTALL': { category: 'Platform', sub: 'Implementation', icon: 'checklist', tint: 'lilac' },
  'ECALL-BLE': { category: 'Add-ons', sub: 'E-Call', icon: 'call-bell', tint: 'coral' },
  'ECALL-INOVONICS': { category: 'Add-ons', sub: 'E-Call', icon: 'call-bell', tint: 'coral' },
  'ECALL-BLE-BUTTON': { category: 'Add-ons', sub: 'E-Call devices', icon: 'heartbeat', tint: 'coral' },
  'ECALL-INOVONICS-PENDANT': { category: 'Add-ons', sub: 'E-Call devices', icon: 'heartbeat', tint: 'coral' },
  'ECALL-INOVONICS-PULLCORD': { category: 'Add-ons', sub: 'E-Call devices', icon: 'heartbeat', tint: 'coral' },
  'COMMON-AREA-SETUP': { category: 'Add-ons', sub: 'Common areas', icon: 'community', tint: 'sky' },
  'COMMON-AREA-MONTHLY': { category: 'Add-ons', sub: 'Common areas', icon: 'community', tint: 'sky' },
  'COVERAGE-FULL-FACILITY': { category: 'Add-ons', sub: 'Common areas', icon: 'building', tint: 'stone' },
  'SENSOR-ADDITIONAL': { category: 'Add-ons', sub: 'Additional coverage', icon: 'sensor', tint: 'teal' },
  'CAPEX-BASE': { category: 'Capital purchase', sub: 'Room packages', icon: 'room', tint: 'mint' },
  'CAPEX-BASE-ECALL-BLE': { category: 'Capital purchase', sub: 'Room packages', icon: 'room', tint: 'mint' },
  'CAPEX-BASE-ECALL-INOVONICS': { category: 'Capital purchase', sub: 'Room packages', icon: 'room', tint: 'mint' },
  'CAPEX-SENSOR': { category: 'Capital purchase', sub: 'Components', icon: 'sensor', tint: 'mint' },
  'CAPEX-SOFTWARE': { category: 'Capital purchase', sub: 'Software & services', icon: 'dashboard', tint: 'mint' },
  'CAPEX-SOFTWARE-UPFRONT': { category: 'Capital purchase', sub: 'Software & services', icon: 'dashboard', tint: 'mint' },
  'CAPEX-ECALL-INSTALL-BLE': { category: 'Capital purchase', sub: 'E-Call', icon: 'call-bell', tint: 'coral' },
  'CAPEX-ECALL-INSTALL-INOVONICS': { category: 'Capital purchase', sub: 'E-Call', icon: 'call-bell', tint: 'coral' },
  'CAPEX-ECALL-SOFTWARE': { category: 'Capital purchase', sub: 'E-Call', icon: 'dashboard', tint: 'coral' },
  'CAPEX-ECALL-SOFTWARE-UPFRONT': { category: 'Capital purchase', sub: 'E-Call', icon: 'dashboard', tint: 'coral' },
  'CAPEX-ECALL-DEVICE': { category: 'Capital purchase', sub: 'E-Call', icon: 'heartbeat', tint: 'coral' },
  'CAPEX-ECALL-BLE-RENEWAL': { category: 'Capital purchase', sub: 'Renewals', icon: 'calendar', tint: 'sand' },
  'CAPEX-ECALL-INOVONICS-RENEWAL': { category: 'Capital purchase', sub: 'Renewals', icon: 'calendar', tint: 'sand' },
  'FINISH-CONCEALED-LOW': { category: 'Installation finish', sub: 'Concealed installation', icon: 'campus', tint: 'stone' },
  'FINISH-CONCEALED-HIGH': { category: 'Installation finish', sub: 'Concealed installation', icon: 'campus', tint: 'stone' },
  'FINISH-STANDARD-CREDIT': { category: 'Installation finish', sub: 'Concealed installation', icon: 'pricing', tint: 'stone' },
};
export const placeOf = (sku: string): CatalogPlace => CATALOG[sku] ?? { category: 'Add-ons', sub: 'Other', icon: 'document', tint: 'stone' };

/** The price book's SKUs (what reps and the sheet call each item). Editable; the system key stays the same. */
export const ITEM_CODES: Record<string, string> = {
  'TETON-PLATFORM': 'TT-PLT-ONE',
  'TETON-SNF': 'TT-PLT-SNF',
  'BUNDLE-ECALL-BLE': 'TT-PLT-BBL',
  'BUNDLE-ECALL-INOVONICS': 'TT-PLT-BIN',
  'TETON-INSTALL': 'TT-PLT-SET',
  'ECALL-BLE': 'TT-ADD-001',
  'ECALL-INOVONICS': 'TT-ADD-002',
  'COMMON-AREA-SETUP': 'TT-ADD-003',
  'COMMON-AREA-MONTHLY': 'TT-ADD-004',
  'SENSOR-ADDITIONAL': 'TT-ADD-005',
  'COVERAGE-FULL-FACILITY': 'TT-ADD-006',
  'ECALL-BLE-BUTTON': 'TT-ADD-007',
  'ECALL-INOVONICS-PENDANT': 'TT-ADD-008',
  'ECALL-INOVONICS-PULLCORD': 'TT-ADD-009',
  'CAPEX-BASE': 'TT-CAP-001',
  'CAPEX-BASE-ECALL-BLE': 'TT-CAP-002',
  'CAPEX-BASE-ECALL-INOVONICS': 'TT-CAP-003',
  'CAPEX-SENSOR': 'TT-CAP-004',
  'CAPEX-SOFTWARE': 'TT-CAP-005',
  'CAPEX-SOFTWARE-UPFRONT': 'TT-CAP-006',
  'CAPEX-ECALL-INSTALL-BLE': 'TT-CAP-007',
  'CAPEX-ECALL-INSTALL-INOVONICS': 'TT-CAP-008',
  'CAPEX-ECALL-SOFTWARE': 'TT-CAP-009',
  'CAPEX-ECALL-SOFTWARE-UPFRONT': 'TT-CAP-010',
  'CAPEX-ECALL-DEVICE': 'TT-CAP-011',
  'CAPEX-ECALL-BLE-RENEWAL': 'TT-CAP-012',
  'CAPEX-ECALL-INOVONICS-RENEWAL': 'TT-CAP-013',
  'FINISH-CONCEALED-LOW': 'TT-FIN-001',
  'FINISH-CONCEALED-HIGH': 'TT-FIN-002',
  'FINISH-STANDARD-CREDIT': 'TT-FIN-003',
};
