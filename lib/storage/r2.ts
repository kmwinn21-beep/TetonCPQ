/**
 * Cloudflare R2 (S3-compatible) for large uploads such as videos: the browser uploads straight to R2 with a short-lived
 * signed URL (so files don't pass through our functions and their request size limit), and prospects get short-lived
 * signed URLs to view or download. Uses R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME (the
 * same variables as Parlay); without them, uploads are kept in the database instead.
 *
 * Signing is AWS Signature V4 query-string signing (no SDK needed).
 */
import { createHash, createHmac } from 'node:crypto';

export const r2Configured = () => !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s).digest();

/** A signed URL for one request (GET to read, PUT to upload) to an object, good for `expires` seconds. */
export function presign(method: 'GET' | 'PUT' | 'DELETE', key: string, opts: { expires?: number; query?: Record<string, string>; now?: Date } = {}): string {
  const account = process.env.R2_ACCOUNT_ID!;
  const host = `${account}.r2.cloudflarestorage.com`;
  const bucket = process.env.R2_BUCKET_NAME!;
  const now = opts.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = `/${bucket}/${key.split('/').map(enc).join('/')}`;
  const q: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${process.env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(opts.expires ?? 300),
    'X-Amz-SignedHeaders': 'host',
    ...(opts.query ?? {}),
  };
  const qs = Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join('&');
  const canonical = [method, path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kDate = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, day);
  const kSigning = hmac(hmac(hmac(kDate, 'auto'), 's3'), 'aws4_request');
  const sig = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}

/** Delete an object (best effort). */
export async function r2Delete(key: string): Promise<void> {
  await fetch(presign('DELETE', key), { method: 'DELETE' }).catch(() => {});
}
