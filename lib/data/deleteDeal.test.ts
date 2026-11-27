import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { accessForQuote } from './access';
import { deleteDeal } from './deleteDeal';

let db: Client;
let dir: string;
const u: Record<'own' | 'other' | 'adm', { id: number; role: string }> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-del-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, role] of [['own', 'rep'], ['other', 'rep'], ['adm', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, k, role] });
    u[k] = { id: Number(r.rows[0].id), role };
  }
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Rows across every table that belong to a deal (via deal_id, or its quote / versions). */
async function rowsFor(dealId: number) {
  const q = (sql: string) => db.execute({ sql, args: [dealId] }).then((r) => Number(r.rows[0].n));
  return {
    deals: await q('SELECT COUNT(*) n FROM deals WHERE id = ?'),
    quotes: await q('SELECT COUNT(*) n FROM quotes WHERE deal_id = ?'),
    versions: await q('SELECT COUNT(*) n FROM quote_versions v JOIN quotes q ON q.id = v.quote_id WHERE q.deal_id = ?'),
    tasks: await q('SELECT COUNT(*) n FROM deal_tasks WHERE deal_id = ?'),
    collaborators: await q('SELECT COUNT(*) n FROM deal_collaborators WHERE deal_id = ?'),
  };
}

async function seed(name: string) {
  const { dealId, quoteId } = await createDeal(db, name, { userId: u.own.id });
  await db.execute({ sql: "INSERT INTO deal_tasks (deal_id, title, created_by) VALUES (?, 'Call them', ?)", args: [dealId, u.own.id] });
  await db.execute({ sql: 'INSERT INTO deal_collaborators (deal_id, user_id, added_by) VALUES (?, ?, ?)', args: [dealId, u.other.id, u.own.id] });
  return { dealId, quoteId };
}

describe('deleting a deal', () => {
  it('only the owner or an admin can', async () => {
    const { quoteId } = await seed('Keep');
    await expect(deleteDeal(db, await accessForQuote(db, quoteId, u.other))).rejects.toThrow('permission');
  });
  it('removes the deal and everything under it, and nothing of other deals', async () => {
    const a = await seed('Alpha');
    const b = await seed('Bravo');
    const before = await rowsFor(b.dealId);
    await deleteDeal(db, await accessForQuote(db, a.quoteId, u.own));
    expect(await rowsFor(a.dealId)).toEqual({ deals: 0, quotes: 0, versions: 0, tasks: 0, collaborators: 0 });
    expect(await rowsFor(b.dealId)).toEqual(before);
    // An admin can delete someone else's deal.
    await deleteDeal(db, await accessForQuote(db, b.quoteId, u.adm));
    expect((await rowsFor(b.dealId)).deals).toBe(0);
  });
});
