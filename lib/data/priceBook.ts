/**
 * Editing the price book. List prices live in the `products` table (seeded from
 * SEED_PRODUCTS, which stay the defaults). A change applies to deals created
 * afterwards and to list-price comparisons (discounts, guardrails); saved
 * versions keep the figures they were saved with, and existing drafts keep
 * their own rates.
 */
import type { Client } from '@libsql/client';
import { COUNT_BASES, SEED_PRODUCTS, type Billing, type CountBasis, type PerUnit, type PilotRule, type PricingModel, type Product } from '@/lib/pricing/catalog';
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
  /** The SKU reps see (editable); `sku` is the system key. */
  itemCode: string | null;
  /** Changes, newest first. */
  history: PriceBookChange[];
}

export interface PriceBookChange {
  id: number;
  /** 'sku', 'list' (US list price) or 'market:UK' (a reference price). */
  field: string;
  oldValue: string | null;
  newValue: string | null;
  by: string | null;
  at: string;
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

/** The item-detail columns, for SELECTs (see productDetails). */
export const DETAIL_COLS = 'billing, every_years, per_unit, counted, pilot_rule, category, sub, generic';

const BILLINGS = ['monthly', 'once', 'years'];
const PERS = ['bed', 'room', 'sensor', 'device', 'community', 'flat'];
const PILOTS = ['free', 'charged', 'credited', 'none'];

/** A product row's item details (missing columns before the migration read as unset). */
export function productDetails(r: Record<string, unknown>): Pick<Product, 'billing' | 'everyYears' | 'per' | 'counted' | 'pilotRule' | 'category' | 'sub' | 'generic'> {
  const s = (v: unknown) => (v == null ? null : String(v));
  const billing = s(r.billing);
  return {
    ...(billing && BILLINGS.includes(billing) ? { billing: billing as Billing } : {}),
    everyYears: r.every_years == null ? null : Number(r.every_years),
    per: PERS.includes(s(r.per_unit) ?? '') ? (s(r.per_unit) as PerUnit) : null,
    counted: COUNT_BASES.includes(s(r.counted) as CountBasis) ? (s(r.counted) as CountBasis) : null,
    pilotRule: PILOTS.includes(s(r.pilot_rule) ?? '') ? (s(r.pilot_rule) as PilotRule) : null,
    category: s(r.category),
    sub: s(r.sub),
    generic: Number(r.generic) === 1,
  };
}

export async function listPriceBookRows(db: Client): Promise<PriceBookRow[]> {
  const rs = await db.execute(`
    SELECT p.sku, p.name, p.pricing_model, p.list_price, p.description, p.updated_at, p.item_code, ${DETAIL_COLS},
           (SELECT name FROM users u WHERE u.id = p.updated_by) AS updated_by_name
    FROM products p WHERE p.active = 1 ORDER BY p.rowid`);
  // In price book order (products added later are stored after the rest).
  const at = (sku: string) => {
    const i = SEED_PRODUCTS.findIndex((p) => p.sku === sku);
    return i < 0 ? SEED_PRODUCTS.length : i;
  };
  const markets = await marketPrices(db);
  const usage = await usageBySku(db);
  const history = await historyBySku(db);
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
    itemCode: r.item_code == null ? null : String(r.item_code),
    history: history[String(r.sku)] ?? [],
    ...productDetails(r as Record<string, unknown>),
  }));
}

/** Set a product's list price, or put it back to the default with `list: 'default'`. */
export async function setListPrice(db: Client, sku: string, list: unknown, userId: number | null): Promise<PriceBookRow> {
  const cur = await db.execute({ sql: 'SELECT pricing_model, list_price FROM products WHERE sku = ? AND active = 1', args: [sku] });
  if (!cur.rows.length) throw new Error('Product not found');
  const model = String(cur.rows[0].pricing_model) as PricingModel;
  const was = Number(cur.rows[0].list_price);
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
  if (value !== was) await logChange(db, sku, 'list', String(was), String(value), userId);
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
  const before = await db.execute({ sql: 'SELECT price, not_sold FROM product_market_prices WHERE sku = ? AND market = ?', args: [sku, market] });
  const show = (x: { price: number | null; notSold: boolean } | null) => (!x ? null : x.notSold ? 'not sold' : x.price == null ? null : String(x.price));
  const was = before.rows.length ? show({ price: before.rows[0].price == null ? null : Number(before.rows[0].price), notSold: Number(before.rows[0].not_sold) === 1 }) : null;
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
  if (show(next) !== was) await logChange(db, sku, `market:${market}`, was, show(next), userId);
  const row = (await listPriceBookRows(db)).find((r) => r.sku === sku);
  if (!row) throw new Error('Product not found');
  return row;
}

async function logChange(db: Client, sku: string, field: string, oldValue: string | null, newValue: string | null, userId: number | null) {
  await db.execute({ sql: 'INSERT INTO product_history (sku, field, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?)', args: [sku, field, oldValue, newValue, userId] });
}

async function historyBySku(db: Client): Promise<Record<string, PriceBookChange[]>> {
  const out: Record<string, PriceBookChange[]> = {};
  try {
    const rs = await db.execute(`SELECT h.id, h.sku, h.field, h.old_value, h.new_value, h.created_at, u.name AS by_name
      FROM product_history h LEFT JOIN users u ON u.id = h.user_id ORDER BY h.id DESC`);
    for (const r of rs.rows) {
      const list = (out[String(r.sku)] ??= []);
      if (list.length < 50) list.push({ id: Number(r.id), field: String(r.field), oldValue: r.old_value == null ? null : String(r.old_value), newValue: r.new_value == null ? null : String(r.new_value), by: r.by_name == null ? null : String(r.by_name), at: String(r.created_at) });
    }
  } catch {
    // Before the migration: no history.
  }
  return out;
}

/** Change an item's SKU (letters, digits and dashes; unique). Recorded in its history. */
export async function setItemCode(db: Client, sku: string, code: unknown, userId: number | null): Promise<PriceBookRow> {
  const next = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(next)) throw new Error('Use 2–32 letters, digits and dashes');
  const cur = await db.execute({ sql: 'SELECT item_code FROM products WHERE sku = ? AND active = 1', args: [sku] });
  if (!cur.rows.length) throw new Error('Product not found');
  const was = cur.rows[0].item_code == null ? null : String(cur.rows[0].item_code);
  if (was !== next) {
    const taken = (await otherProducts(db, sku)).find((o) => o.code != null && norm(o.code) === norm(next));
    if (taken) throw new Error(`${next} is already used by ${taken.name}`);
    await db.execute({ sql: "UPDATE products SET item_code = ?, updated_by = ?, updated_at = datetime('now') WHERE sku = ?", args: [next, userId, sku] });
    await logChange(db, sku, 'sku', was, next, userId);
  }
  const row = (await listPriceBookRows(db)).find((r) => r.sku === sku);
  if (!row) throw new Error('Product not found');
  return row;
}

/** How duplicates are compared: lower case, trimmed, single spaces. */
export const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

async function otherProducts(db: Client, sku: string): Promise<Array<{ name: string; code: string | null }>> {
  const rs = await db.execute({ sql: 'SELECT name, item_code FROM products WHERE sku <> ?', args: [sku] });
  return rs.rows.map((r) => ({ name: String(r.name), code: r.item_code == null ? null : String(r.item_code) }));
}

/** Rename an item (unique, ignoring case and extra spaces). Recorded in its history. */
export async function setProductName(db: Client, sku: string, name: unknown, userId: number | null): Promise<PriceBookRow> {
  const next = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (next.length < 2 || next.length > 80) throw new Error('Use 2–80 characters');
  const cur = await db.execute({ sql: 'SELECT name FROM products WHERE sku = ? AND active = 1', args: [sku] });
  if (!cur.rows.length) throw new Error('Product not found');
  const was = String(cur.rows[0].name);
  if (was !== next) {
    const taken = (await otherProducts(db, sku)).find((o) => norm(o.name) === norm(next));
    if (taken) throw new Error(`“${taken.name}” already exists`);
    await db.execute({ sql: "UPDATE products SET name = ?, updated_by = ?, updated_at = datetime('now') WHERE sku = ?", args: [next, userId, sku] });
    await logChange(db, sku, 'name', was, next, userId);
  }
  const row = (await listPriceBookRows(db)).find((r) => r.sku === sku);
  if (!row) throw new Error('Product not found');
  return row;
}
