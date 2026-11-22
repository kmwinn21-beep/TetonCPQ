/**
 * Tasks on a deal. Anyone on the deal (its owner, any collaborator whatever their access, or an admin) adds tasks,
 * assigns them (to any number of the deal's people, or no one) and ticks them done. The creator or an admin edits
 * and deletes. Due date (no time) and priority are optional.
 *
 * Notifications: assignees hear when they're assigned. An overdue task reminds its assignees (its creator if it's
 * unassigned) at 3, 6, 9 … days past due; reminders are created when notifications are read, so no scheduler.
 */
import type { Client, Row } from '@libsql/client';
import { initialsOf, type Person, type Viewer } from './planNotes';

export type Priority = 'low' | 'medium' | 'high';
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
export interface Task {
  id: number;
  quoteId: number;
  dealName: string;
  title: string;
  assignees: Person[];
  priority: Priority | null;
  /** yyyy-mm-dd, or null. */
  dueDate: string | null;
  createdBy: Person;
  createdAt: string;
  completedAt: string | null;
  completedBy: Person | null;
  /** The viewer may edit or delete it (its creator, or an admin). */
  canEdit: boolean;
}
export interface TaskInput {
  title?: string;
  assignees?: number[];
  priority?: Priority | null;
  dueDate?: string | null;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const person = (id: unknown, name: unknown): Person => ({ id: Number(id), name: String(name ?? 'Someone'), initials: initialsOf(String(name ?? '')) });
const ids = (v: unknown): number[] => {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 30) : [];
  } catch {
    return [];
  }
};
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
/** Today as yyyy-mm-dd (UTC unless given). */
export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);
/** Whole days from `from` to `to` (both yyyy-mm-dd). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** High, then medium, then low, then no priority; earliest due date first in each; no due date last. */
export function sortTasks<T extends { priority: Priority | null; dueDate: string | null; id: number }>(list: T[]): T[] {
  const rank = (p: Priority | null) => (p ? PRIORITIES.indexOf(p) : 3);
  return [...list].sort((a, b) => rank(a.priority) - rank(b.priority) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id - b.id);
}

/** The deal's people: its owner and collaborators (the ones who can be assigned and work on tasks). */
export async function dealPeople(db: Client, dealId: number): Promise<Person[]> {
  const r = await db.execute({
    sql: `SELECT u.id, u.name FROM users u WHERE u.id = (SELECT owner_id FROM deals WHERE id = ?)
          UNION SELECT u.id, u.name FROM deal_collaborators c JOIN users u ON u.id = c.user_id WHERE c.deal_id = ? ORDER BY 2`,
    args: [dealId, dealId],
  });
  return r.rows.map((x) => person(x.id, x.name));
}

async function dealOfQuote(db: Client, quoteId: number) {
  const r = await db.execute({ sql: 'SELECT deal_id FROM quotes WHERE id = ?', args: [quoteId] });
  if (!r.rows.length) throw httpError('Deal not found', 404);
  return Number(r.rows[0].deal_id);
}

/** Owner, collaborator (any access) or admin. */
async function onDeal(db: Client, dealId: number, v: Viewer): Promise<boolean> {
  if (v.role === 'admin') return true;
  return (await dealPeople(db, dealId)).some((p) => p.id === v.id);
}

async function users(db: Client, list: number[]): Promise<Map<number, string>> {
  if (!list.length) return new Map();
  const r = await db.execute({ sql: `SELECT id, name FROM users WHERE id IN (${list.map(() => '?').join(',')})`, args: list });
  return new Map(r.rows.map((x) => [Number(x.id), String(x.name)]));
}

const SELECT = `SELECT t.*, d.customer_name AS deal_name, (SELECT q.id FROM quotes q WHERE q.deal_id = t.deal_id ORDER BY q.id LIMIT 1) AS quote_id,
  cu.name AS created_name, du.name AS completed_name
  FROM deal_tasks t JOIN deals d ON d.id = t.deal_id JOIN users cu ON cu.id = t.created_by LEFT JOIN users du ON du.id = t.completed_by`;

async function toTasks(db: Client, rows: Row[], v: Viewer): Promise<Task[]> {
  const names = await users(db, [...new Set(rows.flatMap((x) => ids(x.assignees)))]);
  return rows.map((x) => ({
    id: Number(x.id),
    quoteId: Number(x.quote_id),
    dealName: String(x.deal_name ?? ''),
    title: String(x.title),
    assignees: ids(x.assignees)
      .filter((id) => names.has(id))
      .map((id) => person(id, names.get(id))),
    priority: (x.priority as Priority | null) ?? null,
    dueDate: x.due_date == null ? null : String(x.due_date),
    createdBy: person(x.created_by, x.created_name),
    createdAt: String(x.created_at),
    completedAt: x.completed_at == null ? null : String(x.completed_at),
    completedBy: x.completed_by == null ? null : person(x.completed_by, x.completed_name),
    canEdit: Number(x.created_by) === v.id || v.role === 'admin',
  }));
}

/** The deal's tasks: open ones sorted by priority then due date; completed ones newest first. */
export async function listTasks(db: Client, quoteId: number, v: Viewer): Promise<Task[]> {
  const dealId = await dealOfQuote(db, quoteId);
  const r = await db.execute({ sql: `${SELECT} WHERE t.deal_id = ?`, args: [dealId] });
  const all = await toTasks(db, r.rows, v);
  return [...sortTasks(all.filter((t) => !t.completedAt)), ...all.filter((t) => t.completedAt).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))];
}

async function cleanInput(db: Client, dealId: number, input: TaskInput, partial: boolean) {
  const out: { title?: string; assignees?: number[]; priority?: Priority | null; dueDate?: string | null } = {};
  if (!partial || input.title !== undefined) {
    const t = String(input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) throw httpError('Say what the task is', 400);
    out.title = t;
  }
  if (!partial || input.assignees !== undefined) {
    const people = new Set((await dealPeople(db, dealId)).map((p) => p.id));
    out.assignees = ids(input.assignees ?? []).filter((id) => people.has(id));
  }
  if (!partial || input.priority !== undefined) out.priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : null;
  if (!partial || input.dueDate !== undefined) out.dueDate = isDate(input.dueDate) ? input.dueDate : null;
  return out;
}

async function notifyAssigned(db: Client, dealId: number, taskId: number, list: number[], by: Viewer) {
  for (const uid of list) {
    if (uid === by.id) continue;
    await db.execute({
      sql: `INSERT INTO user_notifications (user_id, deal_id, kind, task_id, step, actor_id) VALUES (?, ?, 'task_assigned', ?, 0, ?)
            ON CONFLICT (user_id, kind, task_id, step) DO UPDATE SET read_at = NULL, created_at = datetime('now'), actor_id = excluded.actor_id`,
      args: [uid, dealId, taskId, by.id],
    });
  }
}

export async function createTask(db: Client, quoteId: number, input: TaskInput, v: Viewer): Promise<number> {
  const dealId = await dealOfQuote(db, quoteId);
  if (!(await onDeal(db, dealId, v))) throw httpError('Only the deal’s owner and collaborators can add tasks', 403);
  const c = await cleanInput(db, dealId, input, false);
  const r = await db.execute({
    sql: 'INSERT INTO deal_tasks (deal_id, title, assignees, priority, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [dealId, c.title!, JSON.stringify(c.assignees), c.priority ?? null, c.dueDate ?? null, v.id],
  });
  const id = Number(r.rows[0].id);
  await notifyAssigned(db, dealId, id, c.assignees!, v);
  return id;
}

async function taskRow(db: Client, quoteId: number, taskId: number) {
  const dealId = await dealOfQuote(db, quoteId);
  const r = await db.execute({ sql: 'SELECT * FROM deal_tasks WHERE id = ? AND deal_id = ?', args: [taskId, dealId] });
  if (!r.rows.length) throw httpError('Task not found', 404);
  return { row: r.rows[0], dealId };
}

/** Edit (creator or admin): title, assignees, priority, due date. Newly added assignees are notified. */
export async function updateTask(db: Client, quoteId: number, taskId: number, input: TaskInput, v: Viewer): Promise<void> {
  const { row, dealId } = await taskRow(db, quoteId, taskId);
  if (Number(row.created_by) !== v.id && v.role !== 'admin') throw httpError('Only the person who added this task or an admin can change it', 403);
  const c = await cleanInput(db, dealId, input, true);
  const before = ids(row.assignees);
  await db.execute({
    sql: "UPDATE deal_tasks SET title = ?, assignees = ?, priority = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?",
    args: [c.title ?? String(row.title), JSON.stringify(c.assignees ?? before), c.priority !== undefined ? c.priority : (row.priority as string | null), c.dueDate !== undefined ? c.dueDate : (row.due_date as string | null), taskId],
  });
  if (c.assignees) await notifyAssigned(db, dealId, taskId, c.assignees.filter((id) => !before.includes(id)), v);
  // A new due date starts its overdue reminders afresh.
  if (c.dueDate !== undefined && c.dueDate !== row.due_date) await db.execute({ sql: "DELETE FROM user_notifications WHERE task_id = ? AND kind = 'task_overdue'", args: [taskId] });
}

/** Tick done or reopen: anyone on the deal. */
export async function setTaskDone(db: Client, quoteId: number, taskId: number, done: boolean, v: Viewer): Promise<void> {
  const { dealId } = await taskRow(db, quoteId, taskId);
  if (!(await onDeal(db, dealId, v))) throw httpError('Only the deal’s owner and collaborators can complete tasks', 403);
  await db.execute({
    sql: done ? "UPDATE deal_tasks SET completed_at = datetime('now'), completed_by = ? WHERE id = ?" : 'UPDATE deal_tasks SET completed_at = NULL, completed_by = NULL WHERE id = ? AND ? IS NOT NULL',
    args: done ? [v.id, taskId] : [taskId, v.id],
  });
}

/** Delete (creator or admin), with its comments and notifications. */
export async function deleteTask(db: Client, quoteId: number, taskId: number, v: Viewer): Promise<void> {
  const { row, dealId } = await taskRow(db, quoteId, taskId);
  if (Number(row.created_by) !== v.id && v.role !== 'admin') throw httpError('Only the person who added this task or an admin can delete it', 403);
  const page = String(taskId);
  await db.execute({ sql: "DELETE FROM comment_reads WHERE comment_id IN (SELECT id FROM proposal_comments WHERE deal_id = ? AND area = 'task' AND page = ?)", args: [dealId, page] });
  await db.execute({ sql: "DELETE FROM proposal_comments WHERE deal_id = ? AND area = 'task' AND page = ?", args: [dealId, page] });
  await db.execute({ sql: 'DELETE FROM user_notifications WHERE task_id = ?', args: [taskId] });
  await db.execute({ sql: 'DELETE FROM deal_tasks WHERE id = ?', args: [taskId] });
}

export type TaskScope = 'mine' | 'byme' | 'all';
/**
 * Open tasks across deals: assigned to the viewer ('mine'), added by them ('byme'), or every open task on the deals
 * they own or collaborate on ('all'). Sorted by priority then due date.
 */
export async function openTasksFor(db: Client, v: Viewer, scope: TaskScope): Promise<Task[]> {
  const where =
    scope === 'mine'
      ? 'EXISTS (SELECT 1 FROM json_each(t.assignees) j WHERE j.value = ?)'
      : scope === 'byme'
        ? 't.created_by = ?'
        : '(d.owner_id = ? OR EXISTS (SELECT 1 FROM deal_collaborators c WHERE c.deal_id = t.deal_id AND c.user_id = ?))';
  const r = await db.execute({ sql: `${SELECT} WHERE t.completed_at IS NULL AND ${where}`, args: scope === 'all' ? [v.id, v.id] : [v.id] });
  return sortTasks(await toTasks(db, r.rows, v));
}

/** How many open tasks are assigned to the viewer, and how many of those are overdue. */
export async function myTaskCounts(db: Client, v: Viewer, today = todayIso()): Promise<{ open: number; overdue: number }> {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS n, SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS late FROM deal_tasks t
          WHERE completed_at IS NULL AND EXISTS (SELECT 1 FROM json_each(t.assignees) j WHERE j.value = ?)`,
    args: [today, v.id],
  });
  return { open: Number(r.rows[0].n ?? 0), overdue: Number(r.rows[0].late ?? 0) };
}

// ---------------------------------------------------------------- notifications

export interface TaskNotification {
  id: number;
  kind: 'task_assigned' | 'task_overdue';
  quoteId: number;
  dealName: string;
  taskId: number;
  taskTitle: string;
  /** Overdue: days past due (3, 6, 9 …). */
  days: number;
  actor: Person | null;
  createdAt: string;
}

/**
 * Creates the overdue reminders now due for the viewer: for each open task they're assigned to (or created, when
 * it has no assignees), one per 3 days past due, keeping only the latest step unread.
 */
export async function remindOverdue(db: Client, v: Viewer, today = todayIso()): Promise<void> {
  const r = await db.execute({
    sql: `SELECT id, deal_id, due_date FROM deal_tasks t WHERE completed_at IS NULL AND due_date IS NOT NULL AND due_date < ?
          AND (EXISTS (SELECT 1 FROM json_each(t.assignees) j WHERE j.value = ?) OR (json_array_length(t.assignees) = 0 AND created_by = ?))`,
    args: [today, v.id, v.id],
  });
  for (const x of r.rows) {
    const step = Math.floor(daysBetween(String(x.due_date), today) / 3);
    if (step < 1) continue;
    const ins = await db.execute({
      sql: `INSERT OR IGNORE INTO user_notifications (user_id, deal_id, kind, task_id, step) VALUES (?, ?, 'task_overdue', ?, ?)`,
      args: [v.id, Number(x.deal_id), Number(x.id), step],
    });
    // A newer reminder replaces the older unread ones for the same task.
    if (ins.rowsAffected) await db.execute({ sql: "UPDATE user_notifications SET read_at = datetime('now') WHERE user_id = ? AND task_id = ? AND kind = 'task_overdue' AND step < ? AND read_at IS NULL", args: [v.id, Number(x.id), step] });
  }
}

/** The viewer's unread task notifications (one deal, or all), newest first. Creates due overdue reminders first. */
export async function taskNotifications(db: Client, v: Viewer, quoteId?: number, today = todayIso()): Promise<TaskNotification[]> {
  await remindOverdue(db, v, today);
  const r = await db.execute({
    sql: `SELECT n.*, t.title, t.due_date, d.customer_name, a.name AS actor_name, (SELECT q.id FROM quotes q WHERE q.deal_id = n.deal_id ORDER BY q.id LIMIT 1) AS quote_id
          FROM user_notifications n JOIN deal_tasks t ON t.id = n.task_id JOIN deals d ON d.id = n.deal_id LEFT JOIN users a ON a.id = n.actor_id
          WHERE n.user_id = ? AND n.read_at IS NULL AND t.completed_at IS NULL ${quoteId ? 'AND n.deal_id = (SELECT deal_id FROM quotes WHERE id = ?)' : ''}
          ORDER BY n.created_at DESC, n.id DESC`,
    args: quoteId ? [v.id, quoteId] : [v.id],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    kind: x.kind === 'task_overdue' ? ('task_overdue' as const) : ('task_assigned' as const),
    quoteId: Number(x.quote_id),
    dealName: String(x.customer_name ?? ''),
    taskId: Number(x.task_id),
    taskTitle: String(x.title),
    days: Number(x.step) * 3,
    actor: x.actor_id == null ? null : person(x.actor_id, x.actor_name),
    createdAt: String(x.created_at),
  }));
}

export async function markTaskNotificationsRead(db: Client, v: Viewer, list: number[] | 'all', quoteId?: number): Promise<void> {
  if (list === 'all') {
    await db.execute({
      sql: `UPDATE user_notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL ${quoteId ? 'AND deal_id = (SELECT deal_id FROM quotes WHERE id = ?)' : ''}`,
      args: quoteId ? [v.id, quoteId] : [v.id],
    });
    return;
  }
  for (const id of list.slice(0, 2000)) await db.execute({ sql: "UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?", args: [Math.round(Number(id)), v.id] });
}
