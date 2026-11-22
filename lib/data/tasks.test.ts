import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import type { Viewer } from './planNotes';
import { addInputComment, listDealComments } from './proposalComments';
import { createTask, deleteTask, listTasks, markTaskNotificationsRead, myTaskCounts, openTasksFor, setTaskDone, sortTasks, taskNotifications, updateTask } from './tasks';

let db: Client;
let dir: string;
let quoteId: number;
let dealId: number;
const users: Record<'kw' | 'js' | 'mo' | 'out' | 'ad', Viewer> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-tasks-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['mo', 'Morgan Owens', 'rep'], ['out', 'Olive Out', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  const d = await createDeal(db, 'Acme', { userId: users.kw.id });
  quoteId = d.quoteId;
  dealId = d.dealId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [users.kw.id, dealId] });
  // Jordan collaborates with view-only access; Morgan with scope only.
  await db.execute({ sql: 'INSERT INTO deal_collaborators (deal_id, user_id, can_inputs, can_scope, can_deliverables) VALUES (?, ?, 0, 0, 0), (?, ?, 0, 1, 0)', args: [dealId, users.js.id, dealId, users.mo.id] });
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('deal tasks', () => {
  it('sorts by priority, then earliest due date, no due date last', () => {
    const t = (id: number, priority: 'high' | 'medium' | 'low' | null, dueDate: string | null) => ({ id, priority, dueDate });
    expect(sortTasks([t(1, null, '2026-01-01'), t(2, 'low', null), t(3, 'high', '2026-03-01'), t(4, 'high', '2026-02-01'), t(5, 'medium', null), t(6, null, null), t(7, 'low', '2026-01-05')]).map((x) => x.id)).toEqual([4, 3, 5, 7, 2, 1, 6]);
  });

  it('lets any collaborator add, assign and complete; creator or admin edits and deletes', async () => {
    await expect(createTask(db, quoteId, { title: 'x' }, users.out)).rejects.toThrow(/owner and collaborators/);
    await expect(createTask(db, quoteId, { title: '  ' }, users.js)).rejects.toThrow(/Say what/);
    const id = await createTask(db, quoteId, { title: 'Send MSA', assignees: [users.kw.id, users.mo.id, users.out.id], priority: 'high', dueDate: '2026-12-01' }, users.js);
    const [t] = await listTasks(db, quoteId, users.kw);
    expect(t).toMatchObject({ id, title: 'Send MSA', priority: 'high', dueDate: '2026-12-01', canEdit: false });
    expect(t.assignees.map((p) => p.initials)).toEqual(['KW', 'MO']); // not on the deal: dropped
    expect(t.createdBy.initials).toBe('JS');
    await expect(updateTask(db, quoteId, id, { title: 'nope' }, users.mo)).rejects.toThrow(/Only the person/);
    await updateTask(db, quoteId, id, { assignees: [], priority: null, dueDate: null }, users.ad);
    expect((await listTasks(db, quoteId, users.kw))[0]).toMatchObject({ assignees: [], priority: null, dueDate: null });
    await setTaskDone(db, quoteId, id, true, users.mo);
    expect((await listTasks(db, quoteId, users.kw))[0].completedBy?.initials).toBe('MO');
    await setTaskDone(db, quoteId, id, false, users.kw);
    await expect(deleteTask(db, quoteId, id, users.kw)).rejects.toThrow(/Only the person/);
    await deleteTask(db, quoteId, id, users.js);
    expect(await listTasks(db, quoteId, users.kw)).toEqual([]);
  });

  it('notifies assignees, and reminds about overdue tasks every 3 days', async () => {
    const id = await createTask(db, quoteId, { title: 'Confirm beds', assignees: [users.mo.id, users.kw.id], dueDate: '2026-11-01' }, users.kw);
    expect((await taskNotifications(db, users.kw, undefined, '2026-10-20')).length).toBe(0); // not yourself
    const mo = await taskNotifications(db, users.mo, quoteId, '2026-10-20');
    expect(mo.map((n) => n.kind)).toEqual(['task_assigned']);
    await markTaskNotificationsRead(db, users.mo, 'all');
    expect(await taskNotifications(db, users.mo, undefined, '2026-11-03')).toEqual([]); // 2 days late
    const late = await taskNotifications(db, users.mo, undefined, '2026-11-04');
    expect(late.map((n) => [n.kind, n.days])).toEqual([['task_overdue', 3]]);
    const later = await taskNotifications(db, users.mo, undefined, '2026-11-08');
    expect(later.map((n) => n.days)).toEqual([6]); // the 3-day one is replaced
    expect(await myTaskCounts(db, users.mo, '2026-11-08')).toEqual({ open: 1, overdue: 1 });
    // Unassigned: reminders go to the creator.
    await createTask(db, quoteId, { title: 'Nobody', dueDate: '2026-11-01' }, users.js);
    expect((await taskNotifications(db, users.js, undefined, '2026-11-10')).some((n) => n.taskTitle === 'Nobody' && n.days === 9)).toBe(true);
    await setTaskDone(db, quoteId, id, true, users.mo);
    expect((await taskNotifications(db, users.mo, undefined, '2026-11-20')).length).toBe(0);
  });

  it('lists open tasks across deals by scope', async () => {
    const id = await createTask(db, quoteId, { title: 'Walk-through', assignees: [users.js.id], priority: 'medium' }, users.mo);
    expect((await openTasksFor(db, users.js, 'mine')).map((t) => t.id)).toContain(id);
    expect((await openTasksFor(db, users.mo, 'byme')).map((t) => t.id)).toEqual([id]);
    expect((await openTasksFor(db, users.kw, 'all')).map((t) => t.title)).toEqual(['Walk-through', 'Nobody']);
    expect(await openTasksFor(db, users.out, 'all')).toEqual([]);
  });

  it('keeps a comment thread per task (deleted with the task)', async () => {
    const id = await createTask(db, quoteId, { title: 'Thread me' }, users.kw);
    const c = await addInputComment(db, quoteId, { area: 'task', page: String(id), body: 'On it' }, users.js);
    await addInputComment(db, quoteId, { parentId: c, body: 'Thanks' }, users.kw);
    await updateTask(db, quoteId, id, { title: 'Thread me (renamed)' }, users.kw);
    const t = (await listDealComments(db, quoteId, users.kw)).find((x) => x.id === c)!;
    expect(t).toMatchObject({ area: 'task', page: String(id), label: 'Thread me (renamed)', versionNo: null, draft: false });
    expect(t.replies).toHaveLength(1);
    await expect(addInputComment(db, quoteId, { area: 'task', page: '99999', body: 'x' }, users.kw)).rejects.toThrow(/Task not found/);
    await deleteTask(db, quoteId, id, users.kw);
    expect((await listDealComments(db, quoteId, users.kw)).some((x) => x.id === c)).toBe(false);
  });
});
