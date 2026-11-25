/**
 * Upload a file to a deal's Resources: straight to Cloudflare R2 with the signed URL the server hands back (so big
 * videos skip our functions' request limit), or in chunks to the database when R2 isn't set up. Reports progress 0–1.
 */
import type { ResourceFile } from './model';

function put(url: string, body: Blob, type: string, onProgress?: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('content-type', type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status})`)));
    x.onerror = () => reject(new Error('Upload failed: check your connection (and the R2 bucket’s CORS settings)'));
    x.send(body);
  });
}

export async function uploadResourceFile(quoteId: number, file: File, onProgress?: (f: number) => void): Promise<ResourceFile> {
  const base = `/api/quotes/${quoteId}/resources/upload`;
  const mime = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : /\.pdf$/i.test(file.name) ? 'application/pdf' : '');
  const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, mime, size: file.size }) });
  const plan = (await r.json().catch(() => ({}))) as { id?: number; r2?: { url: string; contentType: string }; chunks?: number; chunkSize?: number; error?: string };
  if (!r.ok || !plan.id) throw new Error(plan.error ?? 'Couldn’t start the upload');
  if (plan.r2) await put(plan.r2.url, file, plan.r2.contentType, onProgress);
  else {
    for (let i = 0; i < (plan.chunks ?? 0); i++) {
      const part = file.slice(i * plan.chunkSize!, (i + 1) * plan.chunkSize!);
      const c = await fetch(`${base}/${plan.id}/${i}`, { method: 'PUT', body: part });
      if (!c.ok) throw new Error(((await c.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed');
      onProgress?.((i + 1) / plan.chunks!);
    }
  }
  const done = await fetch(`${base}/${plan.id}/complete`, { method: 'POST' });
  const j = (await done.json().catch(() => ({}))) as { file?: ResourceFile; error?: string };
  if (!done.ok || !j.file) throw new Error(j.error ?? 'Upload failed');
  return j.file;
}
