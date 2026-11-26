/**
 * Editing the price book. List prices live in the `products` table (seeded from
 * SEED_PRODUCTS, which stay the defaults). A change applies to deals created
 * afterwards and to list-price comparisons (discounts, guardrails); saved
 * versions keep the figures they were saved with, and existing drafts keep
 * their own rates.
 */
import type { Client } from '@libsql/client';
import { SEED_PRODUCTS, type PricingModel, type Product } from '@/lib/pricing/catalog';
import { LIVE_MARKET, MARKET_CODES, MARKET_SEED } from '@/lib/pricing/markets';

/** A product's reference price in a market outside the US: a price, not sold there, or no price yet. */
export interface MarketPrice {
  price: number | null;
  notSold: boolean;
}

export interface PriceBookRow extends Product {
  /** The standard list price (what the app shipped with). */
  defaultList: number | null;
  updatedAt: string;
  updatedByName: string | null;
  /** Reference prices outside the US, by market code. */
  markets: Record<string, MarketPrice>;
  /** Saved versions (and deals) with this product on their price lines. */
  usage: { versions: number; deals: number };
}

const LIMITS: Record<PricingModel, { min: number; max: number; decimals: number }> = {
  per_bed_month: { min: 0, max: 10000, decimals: 2 },
  per_bed_once: { min: 0, max: 100000, decimals: 2 },
  per_unit_month: { min: 0, max: 10000, decimals: 2 },
  per_unit_once: { min: 0, max: 100000, decimals: 2 },
  multiplier: { min: 1, max: 3, decimals: 2 },
};

/** Check and round a list price for its pricing model; throws a readable message. */
export function cleanListPrice(model: PricingModel, value: unknown): number {
  const lim = LIMITS[model];
  if (!lim) throw new Error('Unknown pricing model');
  if (value === null || value === undefined || value === '') throw new Error('Enter a number');
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error('Enter a number');
  const f = 10 ** lim.decimals;
  const r = Math.round(n * f) / f;
  if (r < lim.min || r > lim.max) {
    throw new Error(model === 'multiplier' ? `Enter a multiplier from ${lim.min}× to ${lim.max}×` : `Enter a price from $${lim.min} to $${lim.max.toLocaleString('en-US')}`);
  }
  return r;
}

export function defaultListPrice(sku: string): number | null {
  return SEED_PRODUCTS.find((p) => p.sku === sku)?.list ?? null;
}

export async function listPriceBookRows(db: Client): Promise<PriceBookRow[]> {
  const rs = await db.execute(`
    SELECT p.sku, p.name, p.pricing_model, p.list_price, p.description, p.updated_at,
           (SELECT name FROM users u WHERE u.id = p.updated_by) AS updated_by_name
    FROM products p WHERE p.active = 1 ORDER BY p.rowid`);
  // In price book order (products added later are stored after the rest).
  const at = (sku: string) => {
    const i = SEED_PRODUCTS.findIndex((p) => p.sku === sku);
    return i < 0 ? SEED_PRODUCTS.length : i;
  };
  const markets = await marketPrices(db);
  const usage = await usageBySku(db);
  return [...rs.rows].sort((a, b) => at(String(a.sku)) - at(String(b.sku))).map((r) => ({
    sku: String(r.sku),
    name: String(r.name),
    pricingModel: String(r.pricing_model) as PricingModel,
    list: Number(r.list_price),
    description: String(r.description ?? ''),
    defaultList: defaultListPrice(String(r.sku)),
    updatedAt: String(r.updated_at),
    updatedByName: r.updated_by_name ? String(r.updated_by_name) : null,
    markets: markets[String(r.sku)] ?? {},
    usage: usage[String(r.sku)] ?? { versions: 0, deals: 0 },
  }));
}

/** Set a product's list price, or put it back to the default with `list: 'default'`. */
export async function setListPrice(db: Client, sku: string, list: unknown, userId: number | null): Promise<PriceBookRow> {
  const cur = await db.execute({ sql: 'SELECT pricing_model FROM products WHERE sku = ? AND active = 1', args: [sku] });
  if (!cur.rows.length) throw new Error('Product not found');
  const model = String(cur.rows[0].pricing_model) as PricingModel;
  let value: number;
  if (list === 'default') {
    const d = defaultListPrice(sku);
    if (d == null) throw new Error('This product has no default price');
    value = d;
  } else {
    value = cleanListPrice(model, list);
  }
  await db.execute({
    sql: "UPDATE products SET list_price = ?, updated_by = ?, updated_at = datetime('now') WHERE sku = ?",
    args: [value, userId, sku],
  });
  const row = (await listPriceBookRows(db)).find((r) => r.sku === sku);
  if (!row) throw new Error('Product not found');
  return row;
}

/** Price book settings that aren't prices. */
export interface PriceBookSettings {
  /** How new equipment-purchase deals bill software & services (a deal can change it). */
  softwareBilling: 'monthly' | 'upfront';
}

export async function getPriceBookSettings(db: Client): Promise<PriceBookSettings> {
  try {
    const r = await db.execute({ sql: 'SELECT value FROM price_book_settings WHERE key = ?', args: ['capex.softwareBilling'] });
    return { softwareBilling: r.rows[0]?.value === 'upfront' ? 'upfront' : 'monthly' };
  } catch {
    return { softwareBilling: 'monthly' };
  }
}

export async function setSoftwareBillingDefault(db: Client, value: unknown, userId: number | null): Promise<PriceBookSettings> {
  if (value !== 'monthly' && value !== 'upfront') throw new Error('Choose monthly or upfront');
  await db.execute({
    sql: "INSERT INTO price_book_settings (key, value, updated_by, updated_at) VALUES ('capex.softwareBilling', ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    args: [value, userId],
  });
  return getPriceBookSettings(db);
}

async function marketPrices(db: Client): Promise<Record<string, Record<string, MarketPrice>>> {
  const out: Record<string, Record<string, MarketPrice>> = {};
  try {
    const rs = await db.execute('SELECT sku, market, price, not_sold FROM product_market_prices');
    for (const r of rs.rows) (out[String(r.sku)] ??= {})[String(r.market)] = { price: r.price == null ? null : Number(r.price), notSold: Number(r.not_sold) === 1 };
  } catch {
    // Before the migration: no reference prices.
  }
  return out;
}

/** Saved (not draft) versions and their deals, by product on their price lines. */
async function usageBySku(db: Client): Promise<Record<string, { versions: number; deals: number }>> {
  const rs = await db.execute(`
    SELECT l.sku, COUNT(DISTINCT l.quote_version_id) AS versions, COUNT(DISTINCT q.deal_id) AS deals
    FROM quote_version_lines l JOIN quote_versions v ON v.id = l.quote_version_id JOIN quotes q ON q.id = v.quote_id
    WHERE v.status <> 'draft' GROUP BY l.sku`);
  return Object.fromEntries(rs.rows.map((r) => [String(r.sku), { versions: Number(r.versions), deals: Number(r.deals) }]));
}

/** The sheet's reference price for a product in a market (what Reset puts back). */
export function defaultMarketPrice(sku: string, market: string): MarketPrice | null {
  const v = MARKET_SEED[sku]?.[market];
  if (v === undefined) return null;
  return v === 'ns' ? { price: null, notSold: true } : { price: v, notSold: false };
}

/**
 * Set a product's reference price outside the US: a number, 'not_sold', null (no price), or 'default' (the sheet's).
 * The US price is the list price (setListPrice).
 */
export async function setMarketPrice(db: Client, sku: string, market: string, value: unknown, userId: number | null): Promise<PriceBookRow> {
  if (market === LIVE_MARKET || !MARKET_CODES.includes(market)) throw new Error('Unknown market');
  const cur = await db.execute({ sql: 'SELECT pricing_model FROM products WHERE sku = ? AND active = 1', args: [sku] });
  if (!cur.rows.length) throw new Error('Product not found');
  const model = String(cur.rows[0].pricing_model) as PricingModel;
  let next: MarketPrice;
  if (value === 'default') next = defaultMarketPrice(sku, market) ?? { price: null, notSold: false };
  else if (value === 'not_sold') next = { price: null, notSold: true };
  else if (value === null || value === '') next = { price: null, notSold: false };
  else {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error('Enter a price');
    // Local currencies run larger than dollars (Iceland), so allow more headroom than the US limits.
    if (model === 'multiplier' ? n < 1 || n > 3 : n > 10_000_000) throw new Error('That price is out of range');
    next = { price: Math.round(n * 100) / 100, notSold: false };
  }
  await db.execute({
    sql: `INSERT INTO product_market_prices (sku, market, price, not_sold, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(sku, market) DO UPDATE SET price = excluded.price, not_sold = excluded.not_sold, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [sku, market, next.price, next.notSold ? 1 : 0, userId],
  });
  const row = (await listPriceBookRows(db)).find((r) => r.sku === sku);
  if (!row) throw new Error('Product not found');
  return row;
}
