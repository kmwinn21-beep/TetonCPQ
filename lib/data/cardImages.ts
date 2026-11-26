/**
 * A rep's saved card images (logos, headshots) for deal room cards. The browser resizes them first, so they're small
 * and kept in the database. Anyone with the key can load one (prospects see them on cards); only the owner lists them.
 */
import { randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';
import { cardImageUrl } from '@/lib/resources/cardImageUrl';

export const CARD_IMAGE_MAX = 400 * 1024;
export const CARD_IMAGE_LIMIT = 50;

export interface CardImage {
  key: string;
  name: string;
  url: string;
}
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export async function listCardImages(db: Client, userId: number): Promise<CardImage[]> {
  const r = await db.execute({ sql: 'SELECT key, name FROM card_images WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC', args: [userId] });
  return r.rows.map((x) => ({ key: String(x.key), name: String(x.name), url: cardImageUrl(String(x.key)) }));
}

export async function saveCardImage(db: Client, userId: number, img: { name: string; mime: string; data: Uint8Array }): Promise<CardImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(img.mime)) throw httpError('Images must be PNG, JPG or WebP', 400);
  if (!img.data.byteLength || img.data.byteLength > CARD_IMAGE_MAX) throw httpError('That image is too large', 400);
  const n = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM card_images WHERE user_id = ? AND deleted_at IS NULL', args: [userId] });
  if (Number(n.rows[0].n) >= CARD_IMAGE_LIMIT) throw httpError(`You can save up to ${CARD_IMAGE_LIMIT} images; delete one first`, 400);
  const key = randomBytes(12).toString('hex');
  const name = img.name.replace(/[\\/\0]/g, '_').replace(/\.[a-z0-9]{1,5}$/i, '').trim().slice(0, 80) || 'Image';
  await db.execute({ sql: 'INSERT INTO card_images (user_id, key, name, mime, size, data) VALUES (?, ?, ?, ?, ?, ?)', args: [userId, key, name, img.mime, img.data.byteLength, img.data] });
  return { key, name, url: cardImageUrl(key) };
}

/** Out of the library; cards already using it keep showing it. */
export async function deleteCardImage(db: Client, userId: number, key: string): Promise<void> {
  await db.execute({ sql: "UPDATE card_images SET deleted_at = datetime('now') WHERE user_id = ? AND key = ?", args: [userId, key] });
}

export async function readCardImage(db: Client, key: string): Promise<{ mime: string; data: Uint8Array } | null> {
  if (!/^[0-9a-f]{24}$/.test(key)) return null;
  const r = await db.execute({ sql: 'SELECT mime, data FROM card_images WHERE key = ?', args: [key] });
  if (!r.rows.length) return null;
  return { mime: String(r.rows[0].mime), data: new Uint8Array(r.rows[0].data as ArrayBuffer) };
}

export async function cardImageExists(db: Client, key: string): Promise<boolean> {
  const r = await db.execute({ sql: 'SELECT 1 FROM card_images WHERE key = ?', args: [key] });
  return r.rows.length > 0;
}
