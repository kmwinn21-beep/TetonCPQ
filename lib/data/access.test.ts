import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, getQuoteEditor } from './quotes';
import { accessForQuote, collaboratorCandidates, listCollaborators, need, needDraftEdit, onlyScopeChanged, removeCollaborator, setCollaborator, transferOwnership, type Actor } from './access';
import { newCommunity } from '@/lib/quote/draft';

let db: Client;
let dir: string;
let quoteId: number;
const u: Record<'own' | 'col' | 'view' | 'adm', Actor & { name: string }> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-access-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['adm', 'Ada Admin', 'admin'], ['own', 'Kevin Winn', 'rep'], ['col', 'Jordan Smith', 'rep'], ['view', 'Riley Rep', 'rep']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    u[k] = { id: Number(r.rows[0].id), role, name };
  }
  quoteId = (await createDeal(db, 'Acme', { userId: u.own.id })).quoteId;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('deal access', () => {
  it('owner and admins can do everything; others only view', async () => {
    const own = await accessForQuote(db, quoteId, u.own);
    expect(own).toMatchObject({ isOwner: true, inputs: true, scope: true, deliverables: true, canManage: true });
    expect(own.owner?.initials).toBe('KW');
    expect(await accessForQuote(db, quoteId, u.adm)).toMatchObject({ isAdmin: true, inputs: true, canManage: true });
    const view = await accessForQuote(db, quoteId, u.view);
    expect(view).toMatchObject({ inputs: false, scope: false, deliverables: false, canManage: false });
    expect(() => need(view, 'inputs')).toThrow(/view this deal/);
  });

  it('collaborators get the permissions the owner gives them; only the owner or an admin manages them', async () => {
    await setCollaborator(db, await accessForQuote(db, quoteId, u.own), u.col.id, { scope: true }, u.own.id);
    const col = await accessForQuote(db, quoteId, u.col);
    expect(col).toMatchObject({ isCollaborator: true, inputs: false, scope: true, deliverables: false, canManage: false });
    await expect(setCollaborator(db, col, u.view.id, { inputs: true }, u.col.id)).rejects.toThrow(/owner or an admin/);
    await setCollaborator(db, await accessForQuote(db, quoteId, u.adm), u.col.id, { scope: true, deliverables: true }, u.adm.id);
    expect((await listCollaborators(db, col.dealId)).map((c) => [c.user.initials, c.inputs, c.scope, c.deliverables])).toEqual([['JS', false, true, true]]);
    expect((await collaboratorCandidates(db, col.dealId)).map((c) => c.name)).toEqual(['Ada Admin', 'Riley Rep']);
    await expect(setCollaborator(db, await accessForQuote(db, quoteId, u.own), u.own.id, { inputs: true }, u.own.id)).rejects.toThrow(/already/);
  });

  it('Edit Scope may change room types (and the beds they set) but nothing else', async () => {
    const draft = (await getQuoteEditor(db, quoteId))!.draft;
    const before = { ...draft, communities: [{ ...newCommunity(0), id: 'c1', name: 'Oak' }] };
    const rooms = { ...before, communities: [{ ...before.communities[0], alBeds: 20, additionalSensors: 4, roomTypes: [{ id: 'r', name: 'Studio', care: 'al' as const, rooms: 20, sensors: 1 }] }] };
    expect(onlyScopeChanged(before, rooms)).toBe(true);
    expect(onlyScopeChanged(before, { ...rooms, commercial: { ...rooms.commercial, platformRate: 50 } })).toBe(false);
    expect(onlyScopeChanged(before, { ...before, communities: [{ ...before.communities[0], name: 'Renamed' }] })).toBe(false);
    const col = await accessForQuote(db, quoteId, u.col);
    expect(() => needDraftEdit(col, before, rooms)).not.toThrow();
    expect(() => needDraftEdit(col, before, { ...before, customerName: 'Other' })).toThrow(/room types only/);
    const view = await accessForQuote(db, quoteId, u.view);
    expect(() => needDraftEdit(view, before, rooms)).toThrow();
  });

  it('hands the deal over; the previous owner stays on with every permission', async () => {
    await expect(transferOwnership(db, await accessForQuote(db, quoteId, u.col), u.col.id, u.col.id)).rejects.toThrow(/owner or an admin/);
    await transferOwnership(db, await accessForQuote(db, quoteId, u.own), u.col.id, u.own.id);
    expect(await accessForQuote(db, quoteId, u.col)).toMatchObject({ isOwner: true, isCollaborator: false });
    expect(await accessForQuote(db, quoteId, u.own)).toMatchObject({ isOwner: false, isCollaborator: true, inputs: true, scope: true, deliverables: true, canManage: false });
    await removeCollaborator(db, await accessForQuote(db, quoteId, u.col), u.own.id);
    expect((await accessForQuote(db, quoteId, u.own)).inputs).toBe(false);
  });
});

describe('access from the roles & permissions matrix', () => {
  it('RevOps scopes any deal; changes saved in the matrix apply', async () => {
    const { getMatrix, grantsForRole, saveMatrix } = await import('./permissions');
    const r = await db.execute("INSERT INTO users (email, name, role) VALUES ('ops@x.test', 'Ops Person', 'deal_desk') RETURNING id");
    const ops = { id: Number(r.rows[0].id), role: 'deal_desk' };
    const a = await accessForQuote(db, quoteId, { ...ops, grants: await grantsForRole(db, 'deal_desk') });
    expect(a).toMatchObject({ scope: true, inputs: false, canManage: false, canDelete: false });

    // Reps lose sharing on deals they only collaborate on; the owner keeps it.
    await saveMatrix(db, { rep: { 'deal.share': 'own', 'deal.view': 'own' } }, u.adm.id);
    const stored = await db.execute("SELECT capability, value FROM role_permissions WHERE role = 'rep'");
    expect(stored.rows.map((x) => [x.capability, x.value])).toEqual([['deal.share', 'own']]); // fixed rows never stored
    const grants = await grantsForRole(db, 'rep');
    const mine = (await createDeal(db, 'Beta', { userId: u.view.id })).quoteId;
    expect((await accessForQuote(db, mine, { ...u.view, grants })).share).toBe(true);
    await setCollaborator(db, await accessForQuote(db, mine, u.view), u.col.id, { inputs: true, scope: true, deliverables: true }, u.view.id);
    const col = await accessForQuote(db, mine, { ...u.col, grants });
    expect(col).toMatchObject({ share: false, deliverables: true, room: true, canManage: false, canDelete: false });
    expect((await getMatrix(db)).roles.rep['deal.share']).toBe('own');
    await saveMatrix(db, { rep: {} }, u.adm.id);
    expect((await db.execute("SELECT COUNT(*) AS n FROM role_permissions WHERE role = 'rep'")).rows[0].n).toBe(0);
  });
});
