/**
 * User profiles: what prospects (and teammates) see of a user on a shared link's Resources tab and in emails — title,
 * phone, scheduling link (for "Book a meeting"), LinkedIn, a short bio and a photo — and a few preferences.
 */
import type { Client, Row } from '@libsql/client';

export interface Profile {
  userId: number;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  schedulingUrl: string | null;
  linkedin: string | null;
  bio: string | null;
  /** A cache-busting photo URL (null: none, show initials). */
  photoUrl: string | null;
  showPhone: boolean;
  bookDefault: boolean;
  emailOnOpen: boolean;
}
export interface ProfileInput {
  title?: unknown;
  phone?: unknown;
  schedulingUrl?: unknown;
  linkedin?: unknown;
  bio?: unknown;
  showPhone?: unknown;
  bookDefault?: unknown;
  emailOnOpen?: unknown;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const text = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
};
/** A web address, with https:// added when it's missing; null when it isn't one. */
export function cleanUrl(v: unknown): string | null {
  const s = text(v, 400);
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error();
    return u.toString();
  } catch {
    throw httpError(`“${s}” isn’t a web address`, 400);
  }
}

const SELECT = `SELECT u.id, u.name, u.email, p.title, p.phone, p.scheduling_url, p.linkedin, p.bio, p.photo_updated_at,
  COALESCE(p.show_phone, 1) AS show_phone, COALESCE(p.book_default, 1) AS book_default, COALESCE(p.email_on_open, 0) AS email_on_open
  FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id`;
const toProfile = (r: Row): Profile => ({
  userId: Number(r.id),
  name: String(r.name),
  email: String(r.email),
  title: r.title == null ? null : String(r.title),
  phone: r.phone == null ? null : String(r.phone),
  schedulingUrl: r.scheduling_url == null ? null : String(r.scheduling_url),
  linkedin: r.linkedin == null ? null : String(r.linkedin),
  bio: r.bio == null ? null : String(r.bio),
  photoUrl: r.photo_updated_at == null ? null : `/api/users/${r.id}/photo?v=${encodeURIComponent(String(r.photo_updated_at))}`,
  showPhone: Number(r.show_phone) === 1,
  bookDefault: Number(r.book_default) === 1,
  emailOnOpen: Number(r.email_on_open) === 1,
});

export async function getProfile(db: Client, userId: number): Promise<Profile | null> {
  const r = await db.execute({ sql: `${SELECT} WHERE u.id = ?`, args: [userId] });
  return r.rows.length ? toProfile(r.rows[0]) : null;
}
/** Active users' profiles (to pick teammates from). */
export async function listProfiles(db: Client, ids?: number[]): Promise<Profile[]> {
  if (ids && !ids.length) return [];
  const r = ids
    ? await db.execute({ sql: `${SELECT} WHERE u.id IN (${ids.map(() => '?').join(',')})`, args: ids })
    : await db.execute(`${SELECT} WHERE u.active = 1 ORDER BY u.name`);
  return r.rows.map(toProfile);
}

export async function saveProfile(db: Client, userId: number, input: ProfileInput): Promise<Profile> {
  const v = {
    title: text(input.title, 120),
    phone: text(input.phone, 40),
    scheduling: cleanUrl(input.schedulingUrl),
    linkedin: cleanUrl(input.linkedin),
    bio: text(input.bio, 600),
    showPhone: input.showPhone === false ? 0 : 1,
    bookDefault: input.bookDefault === false ? 0 : 1,
    emailOnOpen: input.emailOnOpen === true ? 1 : 0,
  };
  await db.execute({
    sql: `INSERT INTO user_profiles (user_id, title, phone, scheduling_url, linkedin, bio, show_phone, book_default, email_on_open, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET title = excluded.title, phone = excluded.phone, scheduling_url = excluded.scheduling_url,
            linkedin = excluded.linkedin, bio = excluded.bio, show_phone = excluded.show_phone, book_default = excluded.book_default,
            email_on_open = excluded.email_on_open, updated_at = excluded.updated_at`,
    args: [userId, v.title, v.phone, v.scheduling, v.linkedin, v.bio, v.showPhone, v.bookDefault, v.emailOnOpen],
  });
  return (await getProfile(db, userId))!;
}

export const PHOTO_MAX = 600 * 1024;
/** Set (or clear, with null) the photo: a small square image the browser has already resized. */
export async function setProfilePhoto(db: Client, userId: number, photo: { data: Uint8Array; mime: string } | null): Promise<Profile> {
  if (photo) {
    if (!/^image\/(jpeg|png|webp)$/.test(photo.mime)) throw httpError('Photos must be JPG, PNG or WebP', 400);
    if (!photo.data.byteLength || photo.data.byteLength > PHOTO_MAX) throw httpError('That photo is too large', 400);
  }
  await db.execute({
    sql: `INSERT INTO user_profiles (user_id, photo, photo_mime, photo_updated_at) VALUES (?, ?, ?, ${photo ? "strftime('%Y%m%d%H%M%f','now')" : 'NULL'})
          ON CONFLICT(user_id) DO UPDATE SET photo = excluded.photo, photo_mime = excluded.photo_mime, photo_updated_at = excluded.photo_updated_at`,
    args: [userId, photo ? photo.data : null, photo ? photo.mime : null],
  });
  return (await getProfile(db, userId))!;
}
export async function getProfilePhoto(db: Client, userId: number): Promise<{ data: Uint8Array; mime: string } | null> {
  const r = await db.execute({ sql: 'SELECT photo, photo_mime FROM user_profiles WHERE user_id = ? AND photo IS NOT NULL', args: [userId] });
  if (!r.rows.length) return null;
  const d = r.rows[0].photo as unknown as ArrayBuffer | Uint8Array;
  return { data: d instanceof Uint8Array ? d : new Uint8Array(d), mime: String(r.rows[0].photo_mime) };
}
