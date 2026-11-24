/**
 * Sending email: Resend (RESEND_API_KEY) from tetonproposals@useparlay.app, or, with no key (local and tests), an
 * outbox: each email is logged and appended to a file, so it can be read back. Emails can be scheduled (Resend holds
 * them until then) and a scheduled one canceled; that is how replies are batched.
 */
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const EMAIL_FROM = process.env.EMAIL_FROM || 'tetonproposals@useparlay.app';

export interface OutgoingEmail {
  /** Shown as the sender's name (the address is always EMAIL_FROM). */
  fromName: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  /** Send later (Resend holds it). */
  scheduledAt?: Date | null;
  headers?: Record<string, string>;
}

export interface Mailer {
  send(e: OutgoingEmail): Promise<{ id: string }>;
  /** Cancel a scheduled email (false: it's gone already, or can't be). */
  cancel(id: string): Promise<boolean>;
}

const clean = (s: string) => s.replace(/["<>\r\n]/g, '').trim();
const fromHeader = (name: string) => `${clean(name) || 'Teton'} <${EMAIL_FROM}>`;

const resend = (key: string): Mailer => ({
  async send(e) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: fromHeader(e.fromName),
        to: [e.to],
        ...(e.replyTo ? { reply_to: e.replyTo } : {}),
        subject: e.subject,
        html: e.html,
        text: e.text,
        ...(e.scheduledAt ? { scheduled_at: e.scheduledAt.toISOString() } : {}),
        ...(e.headers ? { headers: e.headers } : {}),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok || !j.id) throw new Error(`Email not sent: ${j.message ?? r.status}`);
    return { id: j.id };
  },
  async cancel(id) {
    const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${key}` } });
    return r.ok;
  },
});

/** Where the outbox writes (one JSON line per email or cancel). */
export const OUTBOX_FILE = process.env.EMAIL_OUTBOX_FILE || path.join(tmpdir(), 'teton-outbox.jsonl');
const outbox: Mailer = {
  async send(e) {
    const id = `dev_${randomUUID()}`;
    const line = { id, at: new Date().toISOString(), from: fromHeader(e.fromName), to: e.to, replyTo: e.replyTo ?? null, subject: e.subject, scheduledAt: e.scheduledAt?.toISOString() ?? null, text: e.text };
    try {
      appendFileSync(OUTBOX_FILE, `${JSON.stringify({ ...line, html: e.html })}\n`);
    } catch {
      // (read-only file system: the log line is enough)
    }
    console.log(`[email outbox] ${JSON.stringify(line)}`);
    return { id };
  },
  async cancel(id) {
    try {
      appendFileSync(OUTBOX_FILE, `${JSON.stringify({ cancel: id, at: new Date().toISOString() })}\n`);
    } catch {}
    console.log(`[email outbox] canceled ${id}`);
    return true;
  },
};

let override: Mailer | null = null;
/** Tests swap in their own. */
export const setMailer = (m: Mailer | null) => void (override = m);
export function mailer(): Mailer {
  if (override) return override;
  const key = process.env.RESEND_API_KEY;
  return key ? resend(key) : outbox;
}

/** The app's address for links in emails: APP_URL, else the request's own host. */
export function baseUrlOf(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
  return new URL(req.url).origin;
}
