/**
 * Delete a deal for good: the deal and everything that belongs to it (its proposal, versions, communities, floor
 * plans and notes, comments, tasks, notifications, share links and their emails, the deal room, files, agreement
 * requests). Found by walking the schema's foreign keys from `deals`, so tables added later are covered too, plus the
 * few links the schema doesn't declare. Only the deal's owner or an admin may do it.
 */
import type { Client, InValue } from '@libsql/client';
import type { DealAccess } from './access';
import { r2Configured, r2Delete } from '@/lib/storage/r2';

/** Links the schema doesn't declare as foreign keys: [table, column, parent table]. */
const EXTRA_LINKS: Array<[string, string, string]> = [
  ['resource_events', 'deal_id', 'deals'],
  ['comment_reads', 'comment_id', 'proposal_comments'],
];
/** Never deleted (shared across deals). */
const KEEP = new Set(['users', 'products', '_migrations']);

export function canDeleteDeal(a: Pick<DealAccess, 'isOwner' | 'isAdmin'>): boolean {
  return a.isOwner || a.isAdmin;
}

export async function deleteDeal(db: Client, a: DealAccess): Promise<{ rows: number }> {
  if (!canDeleteDeal(a)) throw Object.assign(new Error('Only the deal’s owner or an admin can delete it'), { status: 403 as const });
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => String(r.name)).filter((t) => !KEEP.has(t));
  // child table → [column, parent table]
  const links: Array<[string, string, string]> = [...EXTRA_LINKS];
  const hasId = new Map<string, boolean>();
  // Nullable foreign keys (including a table's links to itself): cleared first, so circular links don't block the deletes.
  const nullable: Array<[string, string, string]> = [];
  for (const t of tables) {
    const fks = (await db.execute(`PRAGMA foreign_key_list("${t}")`)).rows;
    const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows;
    hasId.set(t, cols.some((c) => c.name === 'id'));
    for (const f of fks) {
      const parent = String(f.table);
      if (KEEP.has(parent)) continue;
      if (parent !== t) links.push([t, String(f.from), parent]);
      if (cols.some((c) => c.name === f.from && Number(c.notnull) === 0)) nullable.push([t, String(f.from), parent]);
    }
  }
  const present = new Set(tables);
  // Collect ids table by table, starting from the deal.
  const ids = new Map<string, Set<number>>([['deals', new Set([a.dealId])]]);
  const byColumn: Array<{ table: string; col: string; values: number[] }> = [];
  const queue = ['deals'];
  const order: string[] = ['deals'];
  while (queue.length) {
    const parent = queue.shift()!;
    const parentIds = [...(ids.get(parent) ?? [])];
    if (!parentIds.length) continue;
    for (const [child, col, p] of links) {
      if (p !== parent || !present.has(child)) continue;
      const marks = parentIds.map(() => '?').join(',');
      if (!hasId.get(child)) {
        byColumn.push({ table: child, col, values: parentIds });
        continue;
      }
      const rs = await db.execute({ sql: `SELECT id FROM "${child}" WHERE "${col}" IN (${marks})`, args: parentIds as InValue[] });
      const set = ids.get(child) ?? new Set<number>();
      const before = set.size;
      rs.rows.forEach((r) => set.add(Number(r.id)));
      ids.set(child, set);
      if (set.size > before) {
        queue.push(child);
        if (!order.includes(child)) order.push(child);
      }
    }
  }
  // Files kept in R2: remove them once the rows are gone.
  const fileIds = [...(ids.get('stored_files') ?? [])];
  const r2Keys = fileIds.length
    ? (await db.execute({ sql: `SELECT r2_key FROM stored_files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND r2_key IS NOT NULL`, args: fileIds })).rows.map((r) => String(r.r2_key))
    : [];
  const list = (xs: number[]) => xs.map(() => '?').join(',');
  const stmts: Array<{ sql: string; args: InValue[] }> = [];
  // 1. Clear nullable links between rows that are going (e.g. a proposal's active version, a version's parent).
  for (const [t, col, parent] of nullable) {
    const mine = [...(ids.get(t) ?? [])];
    const theirs = [...(ids.get(parent) ?? [])];
    if (mine.length && theirs.length) stmts.push({ sql: `UPDATE "${t}" SET "${col}" = NULL WHERE id IN (${list(mine)}) AND "${col}" IN (${list(theirs)})`, args: [...mine, ...theirs] });
  }
  // 2. Rows without ids (keyed by their parent), then the rest children first.
  for (const b of byColumn) stmts.push({ sql: `DELETE FROM "${b.table}" WHERE "${b.col}" IN (${list(b.values)})`, args: b.values });
  // Children before parents: a table goes once no other table still to go points at it (through a NOT NULL link).
  const remaining = new Set(order.filter((t) => ids.get(t)?.size));
  const sorted: string[] = [];
  const hard = links.filter(([c, col, p]) => c !== p && !nullable.some(([t, k]) => t === c && k === col));
  while (remaining.size) {
    const next = [...remaining].find((t) => !hard.some(([c, , p]) => p === t && c !== t && remaining.has(c)));
    const pick = next ?? [...remaining][remaining.size - 1]; // a cycle with no nullable link: fall back to discovery order
    sorted.push(pick);
    remaining.delete(pick);
  }
  for (const t of sorted) {
    const set = [...(ids.get(t) ?? [])];
    if (set.length) stmts.push({ sql: `DELETE FROM "${t}" WHERE id IN (${list(set)})`, args: set });
  }
  const res = await db.batch(stmts, 'write');
  if (r2Keys.length && r2Configured()) await Promise.allSettled(r2Keys.map((k) => r2Delete(k)));
  return { rows: res.reduce((n, r) => n + r.rowsAffected, 0) };
}
