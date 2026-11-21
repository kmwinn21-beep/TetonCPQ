/**
 * Floor plans uploaded for a deal's communities (PDFs and images). A file is
 * stored in chunks small enough for one request each, so large plans fit under
 * the hosting platform's request size limit.
 */
import type { Client } from '@libsql/client';
import { deletePlanNotesFor } from './planNotes';
import type { PlanLabel, PlanLabels } from '@/lib/quote/roomNumbers';

export const FLOOR_PLAN_CHUNK = 3 * 1024 * 1024;
export const FLOOR_PLAN_MAX = 40 * 1024 * 1024;
export const FLOOR_PLAN_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic|heif))$/;

export interface FloorPlan {
  id: number;
  communityId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

const notFound = () => Object.assign(new Error('Floor plan not found'), { status: 404 });

export async function listFloorPlans(db: Client, quoteId: number): Promise<FloorPlan[]> {
  const r = await db.execute({ sql: 'SELECT id, community_id, name, mime, size, created_at FROM floor_plans WHERE quote_id = ? AND complete = 1 ORDER BY id', args: [quoteId] });
  return r.rows.map((x) => ({ id: Number(x.id), communityId: String(x.community_id), name: String(x.name), mime: String(x.mime), size: Number(x.size), createdAt: String(x.created_at) }));
}

/** Start an upload: checks the type and size, returns the new file's id and how many chunks to send. */
export async function startFloorPlan(db: Client, quoteId: number, f: { communityId: string; name: string; mime: string; size: number }, userId: number | null): Promise<{ id: number; chunks: number }> {
  const name = String(f.name ?? '').replace(/[\\/\0]/g, '_').trim().slice(0, 160) || 'Floor plan';
  const mime = String(f.mime ?? '').toLowerCase();
  const size = Number(f.size);
  if (!FLOOR_PLAN_TYPES.test(mime)) throw new Error('Floor plans must be a PDF or an image');
  if (!Number.isFinite(size) || size <= 0) throw new Error('That file is empty');
  if (size > FLOOR_PLAN_MAX) throw new Error(`Floor plans can be up to ${FLOOR_PLAN_MAX / 1024 / 1024} MB`);
  const communityId = String(f.communityId ?? '').slice(0, 80);
  if (!communityId) throw new Error('Missing community');
  const q = await db.execute({ sql: 'SELECT 1 FROM quotes WHERE id = ?', args: [quoteId] });
  if (!q.rows.length) throw Object.assign(new Error('Quote not found'), { status: 404 });
  const chunks = Math.ceil(size / FLOOR_PLAN_CHUNK);
  const r = await db.execute({
    sql: 'INSERT INTO floor_plans (quote_id, community_id, name, mime, size, chunks, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    args: [quoteId, communityId, name, mime, size, chunks, userId],
  });
  return { id: Number(r.rows[0].id), chunks };
}

async function plan(db: Client, quoteId: number, id: number) {
  const r = await db.execute({ sql: 'SELECT id, name, mime, size, chunks, complete FROM floor_plans WHERE id = ? AND quote_id = ?', args: [id, quoteId] });
  if (!r.rows.length) throw notFound();
  const x = r.rows[0];
  return { name: String(x.name), mime: String(x.mime), size: Number(x.size), chunks: Number(x.chunks), complete: Number(x.complete) === 1 };
}

export async function putFloorPlanChunk(db: Client, quoteId: number, id: number, idx: number, data: Uint8Array): Promise<void> {
  const p = await plan(db, quoteId, id);
  if (p.complete) throw new Error('This upload is already finished');
  if (!Number.isInteger(idx) || idx < 0 || idx >= p.chunks) throw new Error('Bad chunk');
  const expected = idx === p.chunks - 1 ? p.size - FLOOR_PLAN_CHUNK * (p.chunks - 1) : FLOOR_PLAN_CHUNK;
  if (data.byteLength !== expected) throw new Error('Chunk size does not match the file');
  await db.execute({ sql: 'INSERT OR REPLACE INTO floor_plan_chunks (floor_plan_id, idx, data) VALUES (?, ?, ?)', args: [id, idx, data] });
}

/** Finish an upload once every chunk is in. */
export async function completeFloorPlan(db: Client, quoteId: number, id: number): Promise<FloorPlan> {
  const p = await plan(db, quoteId, id);
  const n = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM floor_plan_chunks WHERE floor_plan_id = ?', args: [id] });
  if (Number(n.rows[0].n) !== p.chunks) throw new Error('Some of the file is missing; try the upload again');
  await db.execute({ sql: 'UPDATE floor_plans SET complete = 1 WHERE id = ?', args: [id] });
  return (await listFloorPlans(db, quoteId)).find((f) => f.id === id)!;
}

/** The whole file, for viewing or downloading. */
export async function readFloorPlan(db: Client, quoteId: number, id: number): Promise<{ name: string; mime: string; data: Uint8Array }> {
  const p = await plan(db, quoteId, id);
  if (!p.complete) throw notFound();
  const r = await db.execute({ sql: 'SELECT data FROM floor_plan_chunks WHERE floor_plan_id = ? ORDER BY idx', args: [id] });
  const out = new Uint8Array(p.size);
  let at = 0;
  for (const row of r.rows) {
    const b = new Uint8Array(row.data as ArrayBuffer);
    out.set(b, at);
    at += b.byteLength;
  }
  return { name: p.name, mime: p.mime, data: out };
}

export async function deleteFloorPlan(db: Client, quoteId: number, id: number): Promise<void> {
  await plan(db, quoteId, id);
  await deletePlanNotesFor(db, id);
  await db.execute({ sql: 'DELETE FROM floor_plan_chunks WHERE floor_plan_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM floor_plans WHERE id = ?', args: [id] });
}

/** Room numbers read from a plan, cleaned: up to 500 pages, 2000 numbers a page. */
export function normalizePlanLabels(v: unknown): PlanLabels | null {
  if (!v || typeof v !== 'object') return null;
  const pages = (v as { pages?: unknown }).pages;
  if (!pages || typeof pages !== 'object') return null;
  const out: PlanLabels = { pages: {}, readAt: new Date().toISOString() };
  const n01 = (x: unknown) => Math.min(1, Math.max(0, Number(x) || 0));
  for (const [k, p] of Object.entries(pages as Record<string, unknown>).slice(0, 500)) {
    const n = Math.round(Number(k));
    if (!Number.isFinite(n) || n < 1 || !p || typeof p !== 'object') continue;
    const q = p as { aspect?: unknown; labels?: unknown };
    const labels = (Array.isArray(q.labels) ? q.labels : []).slice(0, 2000).flatMap((l) => {
      const x = l as Partial<PlanLabel>;
      const t = String(x?.t ?? '').replace(/\D/g, '').slice(0, 6);
      return t ? [{ t, x: n01(x.x), y: n01(x.y), sure: x.sure === true }] : [];
    });
    out.pages[String(n)] = { aspect: Math.min(10, Math.max(0.1, Number(q.aspect) || 1.3)), labels };
  }
  return out;
}

export async function getPlanLabels(db: Client, quoteId: number, id: number): Promise<PlanLabels | null> {
  const r = await db.execute({ sql: 'SELECT labels FROM floor_plans WHERE id = ? AND quote_id = ? AND complete = 1', args: [id, quoteId] });
  if (!r.rows.length) throw notFound();
  if (r.rows[0].labels == null) return null;
  try {
    const v = JSON.parse(String(r.rows[0].labels));
    const l = normalizePlanLabels(v);
    return l && { ...l, readAt: String(v.readAt ?? l.readAt) };
  } catch {
    return null;
  }
}

export async function savePlanLabels(db: Client, quoteId: number, id: number, v: unknown): Promise<PlanLabels> {
  const labels = normalizePlanLabels(v);
  if (!labels) throw Object.assign(new Error('Nothing to save'), { status: 400 });
  const r = await db.execute({ sql: 'UPDATE floor_plans SET labels = ? WHERE id = ? AND quote_id = ? AND complete = 1', args: [JSON.stringify(labels), id, quoteId] });
  if (!r.rowsAffected) throw notFound();
  return labels;
}
