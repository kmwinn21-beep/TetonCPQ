import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, deleteVersion, saveVersion } from './quotes';
import type { Viewer } from './planNotes';
import { addComment, addInputComment, deleteComment, editComment, listComments, listDealComments, markMentionsRead, mentionable, resolveThread, unreadMentions } from './proposalComments';

let db: Client;
let dir: string;
let quoteId: number;
let v1: number;
let v2: number;
const users: Record<'kw' | 'js' | 'mo' | 'ad', Viewer> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-comments-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['mo', 'Morgan Owens', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  const d = await createDeal(db, 'Acme', { userId: users.kw.id });
  quoteId = d.quoteId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [users.kw.id, d.dealId] });
  v1 = (await saveVersion(db, quoteId, 'one')).versionId;
  v2 = (await saveVersion(db, quoteId, 'two')).versionId;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('business case comments', () => {
  it('keeps threads with the deal and notes the version', async () => {
    await expect(addComment(db, v1, { body: ' ' }, users.js)).rejects.toThrow(/Write/);
    const a = await addComment(db, v1, { page: 'roi', block: 'callout', label: 'ROI · Callout', body: 'Check this' }, users.js);
    await addComment(db, v2, { body: 'General note' }, users.mo);
    const r = await addComment(db, v2, { parentId: a, page: 'other', body: 'Fixed in v2' }, users.kw);
    const list = await listComments(db, v2, users.js);
    expect(list.map((t) => t.label)).toEqual(['General', 'ROI · Callout']);
    const t = list[1];
    expect(t).toMatchObject({ page: 'roi', block: 'callout', versionNo: 1, mine: true });
    expect(t.replies).toHaveLength(1);
    expect(t.replies[0]).toMatchObject({ id: r, versionNo: 2, mine: false });
    // Same threads from the other version.
    expect((await listComments(db, v1, users.js)).length).toBe(2);
  });

  it('lets the author, the deal owner, or someone tagged resolve', async () => {
    const id = await addComment(db, v2, { page: 'cost', label: 'Cost', body: 'Ask @Ada', mentions: [users.ad.id] }, users.js);
    const t = (await listComments(db, v2, users.mo)).find((x) => x.id === id)!;
    expect(t.canResolve).toBe(false);
    await expect(resolveThread(db, v2, id, true, users.mo)).rejects.toThrow(/Only the author/);
    await resolveThread(db, v2, id, true, users.ad);
    expect((await listComments(db, v2, users.js)).find((x) => x.id === id)!.resolvedBy?.id).toBe(users.ad.id);
    await resolveThread(db, v2, id, false, users.kw); // owner reopens
    await resolveThread(db, v2, id, true, users.js); // author
    // A reply reopens it.
    await addComment(db, v2, { parentId: id, body: 'One more thing' }, users.mo);
    expect((await listComments(db, v2, users.js)).find((x) => x.id === id)!.resolvedAt).toBeNull();
  });

  it('edits by the author only; deletes by the author or an admin', async () => {
    const id = await addComment(db, v2, { body: 'Typo' }, users.js);
    await expect(editComment(db, v2, id, { body: 'x' }, users.kw)).rejects.toThrow(/Only the author/);
    await editComment(db, v2, id, { body: 'Fixed typo' }, users.js);
    expect((await listComments(db, v2, users.js)).find((x) => x.id === id)!.body).toBe('Fixed typo');
    await addComment(db, v2, { parentId: id, body: 'reply' }, users.mo);
    await expect(deleteComment(db, v2, id, users.kw)).rejects.toThrow(/author or an admin/);
    await deleteComment(db, v2, id, users.ad);
    expect((await listComments(db, v2, users.js)).some((x) => x.id === id)).toBe(false);
    const n = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM proposal_comments WHERE parent_id = ?', args: [id] });
    expect(Number(n.rows[0].n)).toBe(0);
  });

  it('lists unread mentions and marks them read', async () => {
    const id = await addComment(db, v2, { body: 'Hey @Morgan', mentions: [users.mo.id, users.js.id] }, users.js);
    const un = await unreadMentions(db, quoteId, users.mo);
    expect(un.map((m) => m.id)).toContain(id);
    expect((await unreadMentions(db, quoteId, users.js)).some((m) => m.id === id)).toBe(false); // not yourself
    await markMentionsRead(db, quoteId, users.mo, 'all');
    expect(await unreadMentions(db, quoteId, users.mo)).toEqual([]);
    expect((await mentionable(db)).map((p) => p.initials)).toContain('KW');
  });

  it('keeps comments when their version is deleted', async () => {
    const id = await addComment(db, v1, { body: 'On v1' }, users.js);
    await deleteVersion(db, quoteId, v1);
    const t = (await listComments(db, v2, users.js)).find((x) => x.id === id)!;
    expect(t).toMatchObject({ versionId: null, versionNo: 1 });
  });

  it('keeps inputs comments apart from the business case', async () => {
    const draft = await addInputComment(db, quoteId, { page: 'pricing', label: 'Pricing & products', body: 'Hold 8%?', draft: true, mentions: [users.kw.id] }, users.js);
    const saved = await addInputComment(db, quoteId, { body: 'Whole deal note' }, users.mo);
    const all = await listDealComments(db, quoteId, users.kw);
    const d = all.find((t) => t.id === draft)!;
    expect(d).toMatchObject({ area: 'inputs', page: 'pricing', block: null, draft: true, versionNo: null, canResolve: true });
    expect(all.find((t) => t.id === saved)).toMatchObject({ area: 'inputs', label: 'Whole deal', draft: false, versionNo: 2 });
    expect(all.some((t) => t.area === 'deliverable')).toBe(true);
    // The business case doesn't list them; the deal page can't change business case comments.
    expect((await listComments(db, v2, users.kw)).some((t) => t.id === draft)).toBe(false);
    const bc = all.find((t) => t.area === 'deliverable')!;
    await expect(resolveThread(db, { quoteId }, bc.id, true, users.kw)).rejects.toThrow(/not found/);
    await expect(resolveThread(db, v2, draft, true, users.kw)).rejects.toThrow(/not found/);
    await resolveThread(db, { quoteId }, draft, true, users.kw);
    await expect(addComment(db, v2, { parentId: draft, body: 'x' }, users.kw)).rejects.toThrow(/Thread not found/);
    const r = await addInputComment(db, quoteId, { parentId: draft, body: 'Yes' }, users.kw);
    expect((await listDealComments(db, quoteId, users.js)).find((t) => t.id === draft)!.replies.map((x) => x.id)).toEqual([r]);
    expect((await unreadMentions(db, quoteId, users.kw)).find((m) => m.id === draft)?.area).toBe('inputs');
    await editComment(db, { quoteId }, draft, { body: 'Hold 8% to Q1?' }, users.js);
    await deleteComment(db, { quoteId }, saved, users.mo);
  });
});
