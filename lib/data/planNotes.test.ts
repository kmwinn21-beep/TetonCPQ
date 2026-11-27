import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { completeFloorPlan, deleteFloorPlan, putFloorPlanChunk, startFloorPlan } from './floorPlans';
import { addPlanComment, createPlanNote, deletePlanComment, deletePlanNote, initialsOf, listPlanNotes, markPlanItemsRead, unreadPlanItems, updatePlanNote, type Viewer } from './planNotes';

let db: Client;
let dir: string;
let quoteId: number;
let planId: number;
const users: Record<'kw' | 'js' | 'ad', Viewer> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-notes-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  quoteId = (await createDeal(db, 'Acme')).quoteId;
  const s = await startFloorPlan(db, quoteId, { communityId: 'c1', name: 'plan.png', mime: 'image/png', size: 4 }, users.kw.id);
  await putFloorPlanChunk(db, quoteId, s.id, 0, new Uint8Array([1, 2, 3, 4]));
  planId = (await completeFloorPlan(db, quoteId, s.id)).id;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('floor plan notes and comments', () => {
  it('makes initials from first and last name', () => {
    expect(initialsOf('Kevin Winn')).toBe('KW');
    expect(initialsOf('Mary Jo Ruiz')).toBe('MR');
    expect(initialsOf('Cher')).toBe('CH');
  });

  it('numbers notes, keeps their place and box, and lets only the author edit or delete', async () => {
    const a = await createPlanNote(db, quoteId, planId, { page: 2, x: 0.4, y: 0.5, box: { x: 0.9, y: 0.1, w: 0.3, h: 0.1 }, body: '  Tall ceiling  ', roomTypeId: 'rt-1', onPlan: false }, users.kw);
    const b = await createPlanNote(db, quoteId, planId, { x: 0.1, y: 0.1, body: 'Laundry: no coverage' }, users.js);
    const { notes } = await listPlanNotes(db, quoteId, planId, users.kw);
    expect(notes.map((n) => [n.number, n.body, n.mine, n.author.initials])).toEqual([
      [1, 'Tall ceiling', true, 'KW'],
      [2, 'Laundry: no coverage', false, 'JS'],
    ]);
    expect(notes[0]).toMatchObject({ page: 2, onPlan: false, roomTypeId: 'rt-1' });
    expect(notes[0].box.x).toBeCloseTo(0.7); // kept on the page
    expect(notes[0].color).not.toBe(notes[1].color);
    await expect(updatePlanNote(db, quoteId, planId, a, { body: 'hijack' }, users.js)).rejects.toThrow(/Only the author/);
    await expect(updatePlanNote(db, quoteId, planId, a, { body: 'nope' }, users.ad)).rejects.toThrow(/Only the author/);
    await updatePlanNote(db, quoteId, planId, a, { body: 'Tall ceiling, 18 ft', onPlan: true, box: { w: 0.4 } }, users.kw);
    const after = (await listPlanNotes(db, quoteId, planId, users.kw)).notes[0];
    expect([after.body, after.onPlan, after.box.w]).toEqual(['Tall ceiling, 18 ft', true, 0.4]);
    await expect(deletePlanNote(db, quoteId, planId, b, users.kw)).rejects.toThrow(/Only the author/);
  });

  it('threads comments on a note and general comments; authors and admins delete, no one else', async () => {
    const note = (await listPlanNotes(db, quoteId, planId, users.kw)).notes[0];
    const c1 = await addPlanComment(db, quoteId, planId, { noteId: note.id, body: 'Confirmed with maintenance' }, users.js);
    const c2 = await addPlanComment(db, quoteId, planId, { body: 'Ask for the 2024 plans' }, users.kw);
    const l = await listPlanNotes(db, quoteId, planId, users.ad);
    expect(l.notes[0].comments.map((c) => [c.body, c.canDelete])).toEqual([['Confirmed with maintenance', true]]);
    expect(l.general.map((c) => c.body)).toEqual(['Ask for the 2024 plans']);
    await expect(deletePlanComment(db, quoteId, planId, c2, users.js)).rejects.toThrow(/Only the author/);
    await deletePlanComment(db, quoteId, planId, c1, users.ad);
    expect((await listPlanNotes(db, quoteId, planId, users.kw)).notes[0].comments).toEqual([]);
  });

  it('lists what someone else wrote and the viewer has not read, and marks it read', async () => {
    const before = await unreadPlanItems(db, quoteId, users.kw);
    expect(before.map((x) => [x.kind, x.preview, x.author.initials])).toEqual([['note', 'Laundry: no coverage', 'JS']]);
    expect(before[0]).toMatchObject({ communityId: 'c1', planId, noteNumber: 2 });
    const note = (await listPlanNotes(db, quoteId, planId, users.kw)).notes[1];
    await addPlanComment(db, quoteId, planId, { noteId: note.id, body: 'Agree' }, users.js);
    expect((await unreadPlanItems(db, quoteId, users.kw)).map((x) => x.kind)).toEqual(['comment', 'note']);
    await markPlanItemsRead(db, quoteId, users.kw, [{ kind: 'note', id: note.id }]);
    expect((await unreadPlanItems(db, quoteId, users.kw)).map((x) => x.kind)).toEqual(['comment']);
    await markPlanItemsRead(db, quoteId, users.kw, 'all');
    expect(await unreadPlanItems(db, quoteId, users.kw)).toEqual([]);
    // Jordan never sees their own writing as unread.
    expect((await unreadPlanItems(db, quoteId, users.js)).every((x) => x.author.id !== users.js.id)).toBe(true);
  });

  it('removes a plan’s notes and comments with it', async () => {
    await deleteFloorPlan(db, quoteId, planId);
    for (const t of ['plan_notes', 'plan_comments']) expect(Number((await db.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n)).toBe(0);
  });
});
