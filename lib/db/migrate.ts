import type { Client } from '@libsql/client';
import { SEED_PRODUCTS } from '@/lib/pricing/catalog';
import { MIGRATIONS } from './migrations';

/** Apply pending migrations and seed the price book (insert-only: existing prices are never overwritten). */
export async function migrate(db: Client): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set((await db.execute('SELECT id FROM _migrations')).rows.map((r) => Number(r.id)));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.batch([...m.sql, { sql: 'INSERT INTO _migrations (id, name) VALUES (?, ?)', args: [m.id, m.name] }], 'write');
  }
  await db.batch(
    SEED_PRODUCTS.map((p) => ({
      sql: 'INSERT OR IGNORE INTO products (sku, name, pricing_model, list_price, description) VALUES (?, ?, ?, ?, ?)',
      args: [p.sku, p.name, p.pricingModel, p.list, p.description],
    })),
    'write',
  );
}
