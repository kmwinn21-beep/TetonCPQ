import type { Client } from '@libsql/client';
import { SEED_PRODUCTS } from '@/lib/pricing/catalog';
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
}
