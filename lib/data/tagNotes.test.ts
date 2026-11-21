import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import type { Viewer } from './planNotes';
import { createTagNote, deleteTagNote, listTagNotes, updateTagNote } from './tagNotes';

let db: Client;
let dir: string;
let quoteId: number;
const users: Record<'kw' | 'js' | 'ad', Viewer> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-tagnotes-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  quoteId = (await createDeal(db, 'Acme')).quoteId;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('notes on tagged rooms', () => {
  it('puts one note on several rooms and needs text and rooms', async () => {
    await expect(createTagNote(db, quoteId, { markIds: ['a'], body: '  ' }, users.kw)).rejects.toThrow(/Write/);
    await expect(createTagNote(db, quoteId, { markIds: [], body: 'x' }, users.kw)).rejects.toThrow(/rooms/);
    await createTagNote(db, quoteId, { markIds: ['m1', 'm2', 'm2', 'm3'], body: ' Brick wall ' }, users.kw);
    const [n] = await listTagNotes(db, quoteId, users.js);
    expect(n).toMatchObject({ markIds: ['m1', 'm2', 'm3'], body: 'Brick wall', mine: false, canDelete: false });
    expect(n.author.initials).toBe('KW');
  });

  it('changes a shared note for all rooms, or splits one room off', async () => {
    const id = await createTagNote(db, quoteId, { markIds: ['s1', 's2', 's3'], body: 'Drop ceiling' }, users.kw);
    await expect(updateTagNote(db, quoteId, id, { body: 'hijack' }, users.js)).rejects.toThrow(/Only the author/);
    await expect(updateTagNote(db, quoteId, id, { body: 'nope' }, users.ad)).rejects.toThrow(/Only the author/);
    await updateTagNote(db, quoteId, id, { body: 'Drop ceiling, wall bracket' }, users.kw);
    const split = await updateTagNote(db, quoteId, id, { body: 'Hospice resident', only: 's2' }, users.kw);
    const cleared = await updateTagNote(db, quoteId, id, { body: '', only: 's3' }, users.kw);
    expect(cleared.id).toBeNull();
    const notes = (await listTagNotes(db, quoteId, users.kw)).filter((n) => n.markIds.some((m) => m.startsWith('s')));
    expect(notes.map((n) => [n.markIds, n.body])).toEqual([
      [['s1'], 'Drop ceiling, wall bracket'],
      [['s2'], 'Hospice resident'],
    ]);
    expect(notes[1].id).toBe(split.id);
    // Clearing the last room's text deletes the note.
    await updateTagNote(db, quoteId, id, { body: '' }, users.kw);
    expect((await listTagNotes(db, quoteId, users.kw)).some((n) => n.id === id)).toBe(false);
  });

  it('lets the author or an admin delete a note', async () => {
    const id = await createTagNote(db, quoteId, { markIds: ['d1'], body: 'Gone soon' }, users.js);
    await expect(deleteTagNote(db, quoteId, id, users.kw)).rejects.toThrow(/author or an admin/);
    await deleteTagNote(db, quoteId, id, users.ad);
    await expect(deleteTagNote(db, quoteId, id, users.js)).rejects.toThrow(/not found/);
  });
});
