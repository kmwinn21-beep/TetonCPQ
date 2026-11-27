import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, listDeals } from './quotes';
import { accessForQuote } from './access';
import { archiveDeal, unarchiveDeal } from './archive';
import { openTasksFor } from './tasks';

let db: Client;
let dir: string;
const u: Record<'own' | 'col' | 'adm', { id: number; role: string }> = {} as never;
let dealId: number;
let quoteId: number;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-arch-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, role] of [['own', 'rep'], ['col', 'rep'], ['adm', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, k, role] });
    u[k] = { id: Number(r.rows[0].id), role };
  }
  ({ dealId, quoteId } = await createDeal(db, 'Acme', { userId: u.own.id }));
  await db.execute({ sql: 'INSERT INTO deal_collaborators (deal_id, user_id, added_by, can_inputs) VALUES (?, ?, ?, 1)', args: [dealId, u.col.id, u.own.id] });
  await db.execute({ sql: "INSERT INTO deal_tasks (deal_id, title, created_by, assignees) VALUES (?, 'Follow up', ?, ?)", args: [dealId, u.own.id, JSON.stringify([u.own.id])] });
  const v = Number((await db.execute({ sql: 'SELECT id FROM quote_versions WHERE quote_id = ?', args: [quoteId] })).rows[0].id);
  for (const [tok, revoked] of [['live', null], ['old', '2026-01-01']] as const)
    await db.execute({ sql: "INSERT INTO share_links (deal_id, version_id, token, expires_on, created_by, revoked_at) VALUES (?, ?, ?, '2099-01-01', ?, ?)", args: [dealId, v, tok, u.own.id, revoked] });
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const linkOff = async (tok: string) => (await db.execute({ sql: 'SELECT revoked_at FROM share_links WHERE token = ?', args: [tok] })).rows[0].revoked_at != null;

describe('archiving a deal', () => {
  it('only the owner or an admin; a reason is required', async () => {
    await expect(archiveDeal(db, await accessForQuote(db, quoteId, u.col), { reason: 'won' }, u.col.id)).rejects.toThrow('permission');
    await expect(archiveDeal(db, await accessForQuote(db, quoteId, u.own), {}, u.own.id)).rejects.toThrow('Pick why');
  });
  it('makes it read-only, turns its links off, and hides its tasks', async () => {
    expect((await openTasksFor(db, { id: u.own.id } as never, 'mine')).length).toBe(1);
    const r = await archiveDeal(db, await accessForQuote(db, quoteId, u.own), { reason: 'won', note: ' Signed ' }, u.own.id);
    expect(r.linksOff).toBe(1);
    expect(await linkOff('live')).toBe(true);
    const own = await accessForQuote(db, quoteId, u.own);
    expect(own).toMatchObject({ inputs: false, scope: false, deliverables: false, canManage: false, isOwner: true });
    expect(own.archived).toMatchObject({ reason: 'won', note: 'Signed', by: 'own' });
    expect(await accessForQuote(db, quoteId, u.col)).toMatchObject({ inputs: false });
    expect((await openTasksFor(db, { id: u.own.id } as never, 'mine')).length).toBe(0);
    expect((await listDeals(db, u.own.id))[0].archived?.reason).toBe('won');
  });
  it('unarchiving brings it back, with only the links archiving turned off', async () => {
    const r = await unarchiveDeal(db, await accessForQuote(db, quoteId, u.adm));
    expect(r.linksOn).toBe(1);
    expect(await linkOff('live')).toBe(false);
    expect(await linkOff('old')).toBe(true);
    expect(await accessForQuote(db, quoteId, u.own)).toMatchObject({ inputs: true, archived: null });
  });
});
