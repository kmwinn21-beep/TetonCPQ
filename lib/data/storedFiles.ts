/**
 * Files uploaded to a deal's Resources tab (decks, PDFs, videos, images). With Cloudflare R2 set up, the browser
 * uploads straight to R2 with a signed URL and reads come from short-lived signed URLs; without it, files are kept in
 * the database in chunks (like floor plans), up to a smaller size.
 */
import { randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';
import { presign, r2Configured, r2Delete } from '@/lib/storage/r2';

export const FILE_CHUNK = 3 * 1024 * 1024;
/** Up to 500 MB in R2 (as in Parlay); 60 MB in the database. */
export const maxFileSize = () => (r2Configured() ? 500 : 60) * 1024 * 1024;
export const FILE_TYPES = /^(application\/pdf|video\/(mp4|webm|quicktime|x-m4v)|image\/(png|jpe?g|gif|webp)|application\/vnd\.(ms-powerpoint|openxmlformats-officedocument\.(presentationml\.presentation|wordprocessingml\.document|spreadsheetml\.sheet))|application\/(msword|vnd\.ms-excel))$/;

export interface StoredFile {
  id: number;
  name: string;
  mime: string;
  size: number;
}
export type UploadPlan = { id: number; r2: { url: string; contentType: string } } | { id: number; chunks: number; chunkSize: number };

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const extOf = (name: string) => (name.match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? 'bin').toLowerCase();

async function row(db: Client, dealId: number, id: number) {
  const r = await db.execute({ sql: 'SELECT id, name, mime, size, r2_key, chunks, complete FROM stored_files WHERE id = ? AND deal_id = ?', args: [id, dealId] });
  if (!r.rows.length) throw httpError('File not found', 404);
  const x = r.rows[0];
  return { id: Number(x.id), name: String(x.name), mime: String(x.mime), size: Number(x.size), r2Key: x.r2_key == null ? null : String(x.r2_key), chunks: Number(x.chunks), complete: Number(x.complete) === 1 };
}

/** Start an upload: to R2 (a signed PUT URL for the browser) or to the database (how many chunks to send). */
export async function startUpload(db: Client, dealId: number, f: { name?: unknown; mime?: unknown; size?: unknown }, userId: number): Promise<UploadPlan> {
  const name = String(f.name ?? '').replace(/[\\/\0]/g, '_').trim().slice(0, 160) || 'File';
  const mime = String(f.mime ?? '').toLowerCase() || 'application/octet-stream';
  const size = Number(f.size);
  if (!FILE_TYPES.test(mime)) throw httpError('Upload a PDF, a slide deck or document, an image, or a video (MP4, MOV, WebM)', 400);
  if (!Number.isFinite(size) || size <= 0) throw httpError('That file is empty', 400);
  if (size > maxFileSize()) throw httpError(`Files can be up to ${maxFileSize() / 1024 / 1024} MB${r2Configured() ? '' : ' (larger videos need Cloudflare R2 set up)'}`, 400);
  if (r2Configured()) {
    const key = `teton-resources/${dealId}/${randomBytes(10).toString('hex')}.${extOf(name)}`;
    const r = await db.execute({ sql: 'INSERT INTO stored_files (deal_id, name, mime, size, r2_key, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', args: [dealId, name, mime, size, key, userId] });
    return { id: Number(r.rows[0].id), r2: { url: presign('PUT', key, { expires: 900 }), contentType: mime } };
  }
  const chunks = Math.ceil(size / FILE_CHUNK);
  const r = await db.execute({ sql: 'INSERT INTO stored_files (deal_id, name, mime, size, chunks, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', args: [dealId, name, mime, size, chunks, userId] });
  return { id: Number(r.rows[0].id), chunks, chunkSize: FILE_CHUNK };
}

export async function putChunk(db: Client, dealId: number, id: number, idx: number, data: Uint8Array): Promise<void> {
  const f = await row(db, dealId, id);
  if (f.r2Key || f.complete) throw httpError('This upload is already finished', 400);
  if (!Number.isInteger(idx) || idx < 0 || idx >= f.chunks) throw httpError('Bad chunk', 400);
  const expected = idx === f.chunks - 1 ? f.size - FILE_CHUNK * (f.chunks - 1) : FILE_CHUNK;
  if (data.byteLength !== expected) throw httpError('Chunk size does not match the file', 400);
  await db.execute({ sql: 'INSERT OR REPLACE INTO stored_file_chunks (file_id, idx, data) VALUES (?, ?, ?)', args: [id, idx, data] });
}

/** Finish an upload (every chunk in, or the browser's PUT to R2 done). */
export async function completeUpload(db: Client, dealId: number, id: number): Promise<StoredFile> {
  const f = await row(db, dealId, id);
  if (!f.r2Key) {
    const n = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM stored_file_chunks WHERE file_id = ?', args: [id] });
    if (Number(n.rows[0].n) !== f.chunks) throw httpError('Some of the file is missing; try the upload again', 400);
  }
  await db.execute({ sql: 'UPDATE stored_files SET complete = 1 WHERE id = ?', args: [id] });
  return { id: f.id, name: f.name, mime: f.mime, size: f.size };
}

export async function fileInfo(db: Client, dealId: number, id: number): Promise<StoredFile & { r2Key: string | null; complete: boolean }> {
  const f = await row(db, dealId, id);
  return { id: f.id, name: f.name, mime: f.mime, size: f.size, r2Key: f.r2Key, complete: f.complete };
}

/** Where to read a file: a short-lived signed R2 URL, or its bytes from the database. */
export async function readFile(db: Client, dealId: number, id: number, opts: { download?: boolean } = {}): Promise<{ redirect: string } | { name: string; mime: string; data: Uint8Array }> {
  const f = await row(db, dealId, id);
  if (!f.complete) throw httpError('File not found', 404);
  if (f.r2Key) {
    const disp = `${opts.download ? 'attachment' : 'inline'}; filename="${f.name.replace(/[^\w.\- ]+/g, '_')}"`;
    return { redirect: presign('GET', f.r2Key, { expires: 600, query: { 'response-content-disposition': disp, 'response-content-type': f.mime } }) };
  }
  const r = await db.execute({ sql: 'SELECT data FROM stored_file_chunks WHERE file_id = ? ORDER BY idx', args: [id] });
  const out = new Uint8Array(f.size);
  let at = 0;
  for (const x of r.rows) {
    const b = new Uint8Array(x.data as ArrayBuffer);
    out.set(b, at);
    at += b.byteLength;
  }
  return { name: f.name, mime: f.mime, data: out };
}

export async function deleteFile(db: Client, dealId: number, id: number): Promise<void> {
  const f = await row(db, dealId, id);
  if (f.r2Key) await r2Delete(f.r2Key);
  await db.execute({ sql: 'DELETE FROM stored_file_chunks WHERE file_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM stored_files WHERE id = ?', args: [id] });
}

/** A file read as an HTTP response: a redirect to R2, or the bytes (with Range support so videos can seek). */
export function fileResponse(r: Awaited<ReturnType<typeof readFile>>, req: Request, download: boolean): Response {
  if ('redirect' in r) return Response.redirect(r.redirect, 302);
  const disp = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(r.name)}`;
  const base = { 'content-type': r.mime, 'content-disposition': disp, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=300' };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '');
  if (range) {
    const size = r.data.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(r.data.slice(start, end + 1) as unknown as BodyInit, { status: 206, headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(r.data as unknown as BodyInit, { headers: { ...base, 'content-length': String(r.data.byteLength) } });
}
