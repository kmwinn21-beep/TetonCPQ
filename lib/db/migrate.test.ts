import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';

const dirs: string[] = [];
const clients: Client[] = [];
function freshDb(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'teton-migrate-'));
  dirs.push(dir);
  return `file:${path.join(dir, 'm.db')}`;
}
const open = (url: string) => {
  const c = createClient({ url });
  clients.push(c);
  return c;
};
afterEach(() => {
  clients.splice(0).forEach((c) => c.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

async function applied(db: Client) {
  return (await db.execute('SELECT id FROM _migrations ORDER BY id')).rows.map((r) => Number(r.id));
}

describe('migrate', () => {
  it('losing a race to another instance is not an error', async () => {
    const url = freshDb();
    const winner = open(url);
    await migrate(winner);
    // The loser read _migrations before the winner committed, so it thinks nothing is applied
    // and its batch fails with "table users already exists" — exactly what Vercel logged.
    const real = open(url);
    let staleReads = 1;
    const loser = new Proxy(real, {
      get(target, prop, recv) {
        if (prop === 'execute') {
          return (stmt: Parameters<Client['execute']>[0]) =>
            typeof stmt === 'string' && stmt.startsWith('SELECT id FROM _migrations') && staleReads-- > 0
              ? Promise.resolve({ rows: [], columns: [], columnTypes: [], rowsAffected: 0, lastInsertRowid: undefined, toJSON: () => ({}) })
              : target.execute(stmt as never);
        }
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    await expect(migrate(loser)).resolves.toBeUndefined();
    expect(await applied(real)).toEqual(MIGRATIONS.map((m) => m.id));
  });

  it('two instances migrating a fresh database at once both succeed, once', async () => {
    const url = freshDb();
    await Promise.all([migrate(open(url)), migrate(open(url))]);
    const db = open(url);
    expect(await applied(db)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM products WHERE sku = 'TETON-PLATFORM'")).rows[0].n)).toBe(1);
  });

  it('a genuinely broken migration fails with its name after retrying', async () => {
    const db = open(freshDb());
    await db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY)'); // a stray table from something else
    await expect(migrate(db)).rejects.toThrow(/migration 1 \(“initial schema”\) failed: .*users already exists/);
  });
});
