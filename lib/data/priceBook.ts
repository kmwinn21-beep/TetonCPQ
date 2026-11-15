/**
 * Editing the price book. List prices live in the `products` table (seeded from
 * SEED_PRODUCTS, which stay the defaults). A change applies to deals created
 * afterwards and to list-price comparisons (discounts, guardrails); saved
 * versions keep the figures they were saved with, and existing drafts keep
 * their own rates.
 */
import type { Client } from '@libsql/client';
import { SEED_PRODUCTS, type PricingModel, type Product } from '@/lib/pricing/catalog';

export interface PriceBookRow extends Product {
  /** The standard list price (what the app shipped with). */
  defaultList: number | null;
  updatedAt: string;
  updatedByName: string | null;
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
  return rs.rows.map((r) => ({
    sku: String(r.sku),
    name: String(r.name),
    pricingModel: String(r.pricing_model) as PricingModel,
    list: Number(r.list_price),
    description: String(r.description ?? ''),
    defaultList: defaultListPrice(String(r.sku)),
    updatedAt: String(r.updated_at),
    updatedByName: r.updated_by_name ? String(r.updated_by_name) : null,
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
