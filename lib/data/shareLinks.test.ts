import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, saveVersion } from './quotes';
import type { Viewer } from './planNotes';
import { addComment, deleteComment, editComment, listComments, listSharedThreads } from './proposalComments';
import { allNotifications, markNotificationsRead } from './notifications';
import { addProspectComment, checkAccess, daysLeft, getDealShareLink, isoDay, linkByToken, normalizeEmails, recordOpen, revokeShareLink, saveShareLink } from './shareLinks';

let db: Client;
let dir: string;
let quoteId: number;
let v1: number;
let v2: number;
const users: Record<'kw' | 'js' | 'ad', Viewer> = {} as never;
const TODAY = '2026-11-24';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-share-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  const d = await createDeal(db, 'Forest Hills', { userId: users.kw.id });
  quoteId = d.quoteId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [users.kw.id, d.dealId] });
  v1 = (await saveVersion(db, quoteId, 'one')).versionId;
  v2 = (await saveVersion(db, quoteId, 'two')).versionId;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('share links', () => {
  it('checks emails', () => {
    expect(normalizeEmails(' Dana.Lee@ForestHills.com, cfo@foresthills.com;dana.lee@foresthills.com ')).toEqual(['dana.lee@foresthills.com', 'cfo@foresthills.com']);
    expect(() => normalizeEmails(['nope'])).toThrow(/isn’t an email/);
  });

  it('creates one link per deal, 30 days by default, and changes it in place', async () => {
    await expect(saveShareLink(db, quoteId, { versionId: v1, emails: [] }, users.kw.id, TODAY)).rejects.toThrow(/at least one email/);
    const a = await saveShareLink(db, quoteId, { versionId: v1, emails: ['dana@fh.com'] }, users.kw.id, TODAY);
    expect(a).toMatchObject({ versionNo: 1, expiresOn: '2026-12-24', allowComments: true, allowPdf: true, verifyEmail: false });
    expect(a.token.length).toBeGreaterThan(10);
    const b = await saveShareLink(db, quoteId, { versionId: v2, emails: ['dana@fh.com', 'cfo@fh.com'], expiresOn: '2026-11-30', allowPdf: false }, users.kw.id, TODAY);
    expect(b.id).toBe(a.id);
    expect(b.token).toBe(a.token);
    expect(b).toMatchObject({ versionNo: 2, expiresOn: '2026-11-30', allowPdf: false });
    expect(b.people.map((p) => p.email)).toEqual(['dana@fh.com', 'cfo@fh.com']);
    await expect(saveShareLink(db, quoteId, { versionId: v2, emails: ['dana@fh.com'], expiresOn: '2026-11-01' }, users.kw.id, TODAY)).rejects.toThrow(/passed/);
    await expect(saveShareLink(db, quoteId, { versionId: v2, emails: ['dana@fh.com'], expiresOn: '2028-01-01' }, users.kw.id, TODAY)).rejects.toThrow(/up to/);
  });

  it('lets in a listed email; keeps names; the verify switch', async () => {
    const l = (await linkByToken(db, (await getDealShareLink(db, quoteId))!.token))!;
    expect(checkAccess(l, ' DANA@fh.com ', TODAY)).toBe('ok');
    expect(checkAccess(l, 'someone@fh.com', TODAY)).toBe('email');
    expect(checkAccess(l, 'dana@fh.com', '2026-12-01')).toBe('expired');
    expect(daysLeft(l.expiresOn, TODAY)).toBe(6);
    const v = await saveShareLink(db, quoteId, { versionId: v2, emails: ['Dana Lee <dana@fh.com>', { email: 'cfo@fh.com', name: 'Chris Fox' }], expiresOn: '2026-11-30', verifyEmail: true, proposalName: 'Forest Hills proposal', intro: 'Hi {first name}!', note: ' Have a look ' }, users.kw.id, TODAY);
    expect(v).toMatchObject({ verifyEmail: true, proposalName: 'Forest Hills proposal', intro: 'Hi {first name}!', note: 'Have a look' });
    expect(v.people.map((p) => [p.email, p.name])).toEqual([['dana@fh.com', 'Dana Lee'], ['cfo@fh.com', 'Chris Fox']]);
    const off = await saveShareLink(db, quoteId, { versionId: v2, emails: ['dana@fh.com', 'cfo@fh.com'], expiresOn: '2026-11-30' }, users.kw.id, TODAY);
    expect(off.verifyEmail).toBe(false);
  });

  it('counts visits and tells the owner about each person’s first one', async () => {
    const l = (await linkByToken(db, (await getDealShareLink(db, quoteId))!.token))!;
    await recordOpen(db, l, 'dana@fh.com');
    await recordOpen(db, l, 'dana@fh.com');
    const again = (await getDealShareLink(db, quoteId))!;
    expect(again.people.find((p) => p.email === 'dana@fh.com')).toMatchObject({ views: 2 });
    const n = await allNotifications(db, users.kw);
    const d = n.deals.find((x) => x.quoteId === quoteId)!;
    expect(d.prospect.filter((p) => p.kind === 'prospect_open')).toHaveLength(1);
    expect((await allNotifications(db, users.js)).deals.find((x) => x.quoteId === quoteId)).toBeUndefined();
  });

  it('takes prospect comments: shared threads, the team’s replies, the owner notified', async () => {
    const l = (await linkByToken(db, (await getDealShareLink(db, quoteId))!.token))!;
    // An internal thread the prospect must not see.
    await addComment(db, v2, { page: 'roi', label: 'ROI', body: 'Internal: check the numbers' }, users.js);
    const t = await addProspectComment(db, l, { email: 'dana@fh.com', name: 'Dana Lee' }, { page: 'pilot', block: 'costs', label: 'Pilot costs · The pilot', body: 'Can the pilot start in January?' });
    await addProspectComment(db, l, { email: 'cfo@fh.com' }, { body: 'Is the software fee fixed?' });
    // The owner replies from the app: the reply joins the shared thread.
    await addComment(db, v2, { parentId: t, body: 'Yes, January works.' }, users.kw);
    const shared = await listSharedThreads(db, v2, l.id);
    expect(shared.map((x) => x.body)).toEqual(['Is the software fee fixed?', 'Can the pilot start in January?']);
    const th = shared[1];
    expect(th).toMatchObject({ page: 'pilot', block: 'costs', canResolve: false, author: { name: 'Dana Lee' }, prospect: 'dana@fh.com' });
    expect(th.replies.map((r) => [r.author.name, r.prospect])).toEqual([['Kevin Winn', null]]);
    expect(shared[0].author.name).toBe('cfo@fh.com');
    // The team sees them too, marked as the prospect's.
    const team = await listComments(db, v2, users.kw);
    const mine = team.find((x) => x.id === t)!;
    expect(mine).toMatchObject({ prospect: 'dana@fh.com', mine: false, shareLinkId: l.id });
    // Nobody on the team edits a prospect's words; only an admin deletes them.
    await expect(editComment(db, v2, t, { body: 'x' }, users.kw)).rejects.toThrow(/Only the author/);
    await expect(deleteComment(db, v2, t, users.kw)).rejects.toThrow(/Only the author or an admin/);
    // A prospect replies only on their link's threads.
    const internal = team.find((x) => x.body.startsWith('Internal'))!;
    await expect(addProspectComment(db, l, { email: 'dana@fh.com' }, { parentId: internal.id, body: 'Peek' })).rejects.toThrow(/not found/);
    // The owner's notifications: two comments (plus the first visit), read one by one.
    const d = (await allNotifications(db, users.kw)).deals.find((x) => x.quoteId === quoteId)!;
    const comments = d.prospect.filter((p) => p.kind === 'prospect_comment');
    expect(comments.map((c) => [c.who, c.label])).toEqual([['cfo@fh.com', 'General'], ['Dana Lee', 'Pilot costs · The pilot']]);
    expect(comments[1]).toMatchObject({ threadId: t, versionId: v2, reply: false });
    await markNotificationsRead(db, users.kw, { prospect: [comments[0].id] });
    expect((await allNotifications(db, users.kw)).deals.find((x) => x.quoteId === quoteId)!.prospect).toHaveLength(2);
  });

  it('turns off: the link stops opening; comments turned off stop new ones', async () => {
    const token = (await getDealShareLink(db, quoteId))!.token;
    await saveShareLink(db, quoteId, { versionId: v2, emails: ['dana@fh.com'], expiresOn: '2026-11-30', allowComments: false }, users.kw.id, TODAY);
    await expect(addProspectComment(db, (await linkByToken(db, token))!, { email: 'dana@fh.com' }, { body: 'Hello' })).rejects.toThrow(/turned off/);
    await revokeShareLink(db, quoteId);
    expect(await getDealShareLink(db, quoteId)).toBeNull();
    expect(checkAccess((await linkByToken(db, token))!, 'dana@fh.com', TODAY)).toBe('revoked');
    expect(await linkByToken(db, 'not a token')).toBeNull();
    expect(isoDay(new Date('2026-11-24T23:00:00Z'), 30)).toBe('2026-12-24');
  });
});
