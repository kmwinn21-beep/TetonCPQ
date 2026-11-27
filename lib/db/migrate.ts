import type { Client } from '@libsql/client';
import { BUILTIN_DETAILS, GENERIC_SEED, SEED_PRODUCTS } from '@/lib/pricing/catalog';
import { ITEM_CODES, MARKET_SEED } from '@/lib/pricing/markets';
import { MIGRATIONS } from './migrations';

const appliedIds = async (db: Client) => new Set((await db.execute('SELECT id FROM _migrations')).rows.map((r) => Number(r.id)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Apply pending migrations and seed the price book (insert-only: existing
 * prices are never overwritten).
 *
 * Several serverless instances can cold-start at once and all try to migrate
 * the same database. Each migration is one atomic batch, so at most one wins;
 * a loser's batch fails (e.g. "table users already exists"). When that
 * happens, re-read what's applied: if another instance finished it, carry on.
 * Otherwise retry briefly, then fail with the migration named.
 */
export async function migrate(db: Client): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  let done = await appliedIds(db);
  for (const m of MIGRATIONS) {
    for (let attempt = 1; !done.has(m.id); attempt++) {
      try {
        await db.batch([...m.sql, { sql: 'INSERT INTO _migrations (id, name) VALUES (?, ?)', args: [m.id, m.name] }], 'write');
        done.add(m.id);
      } catch (e) {
        done = await appliedIds(db);
        if (done.has(m.id)) break; // another instance applied it first
        if (attempt >= 4) {
          throw new Error(`Database migration ${m.id} (“${m.name}”) failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(200 * attempt);
        done = await appliedIds(db);
      }
    }
  }
  await db.batch(
    SEED_PRODUCTS.map((p) => ({
      sql: 'INSERT OR IGNORE INTO products (sku, name, pricing_model, list_price, description) VALUES (?, ?, ?, ?, ?)',
      args: [p.sku, p.name, p.pricingModel, p.list, p.description],
    })),
    'write',
  );
  // SKUs: filled in where a product has none (edits are kept).
  await db.batch(
    Object.entries(ITEM_CODES).map(([sku, code]) => ({
      sql: 'UPDATE products SET item_code = ? WHERE sku = ? AND item_code IS NULL AND NOT EXISTS (SELECT 1 FROM products x WHERE x.item_code = ?)',
      args: [code, sku, code],
    })),
    'write',
  );
  // Item details of the built-in items: filled in where a product has none (edits are kept).
  await db.batch(
    Object.entries(BUILTIN_DETAILS).map(([sku, d]) => ({
      sql: 'UPDATE products SET billing = ?, every_years = ?, per_unit = ? WHERE sku = ? AND billing IS NULL',
      args: [d.billing, d.everyYears ?? null, d.per, sku],
    })),
    'write',
  );
  // Items priced from their own details that ship with the app (added once; edits are kept). Not in any core
  // product until an admin adds one: the equipment-purchase common area sensor has no confirmed price yet.
  await db.batch(
    GENERIC_SEED.map((g) => ({
      sql: `INSERT OR IGNORE INTO products (sku, name, pricing_model, list_price, description, item_code, billing, per_unit, counted, pilot_rule, category, sub, generic)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM products x WHERE x.item_code = ? AND x.sku <> ?)`,
      args: [g.sku, g.name, g.pricingModel, g.list, g.description, g.itemCode, g.billing, g.per, g.counted, g.pilotRule, g.category, g.sub, g.itemCode, g.sku],
    })),
    'write',
  );
  // Reference prices outside the US: seeded once per product and market (edits are kept).
  await db.batch(
    Object.entries(MARKET_SEED).flatMap(([sku, prices]) =>
      Object.entries(prices).map(([market, v]) => ({
        sql: 'INSERT OR IGNORE INTO product_market_prices (sku, market, price, not_sold) VALUES (?, ?, ?, ?)',
        args: [sku, market, v === 'ns' || v == null ? null : v, v === 'ns' ? 1 : 0],
      })),
    ),
    'write',
  );
}
