/**
 * Archived deals: out of the Active list and open-task views, read-only for everyone, shared links off. Nothing is
 * deleted; unarchiving brings the deal back as it was, including the links archiving turned off. Who can archive or
 * unarchive comes from the roles & permissions matrix (Archive or delete a deal; the owner and admins by default).
 */
import type { Client } from '@libsql/client';
import type { DealAccess } from './access';

export const ARCHIVE_REASONS = ['won', 'lost', 'no_decision', 'duplicate', 'other'] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
export const REASON_LABEL: Record<ArchiveReason, string> = { won: 'Won', lost: 'Lost', no_decision: 'No decision', duplicate: 'Duplicate / test', other: 'Other' };

export interface ArchiveInfo {
  at: string;
  by: string | null;
  reason: ArchiveReason;
  note: string | null;
}

const forbidden = () => Object.assign(new Error('You don’t have permission to archive this deal'), { status: 403 as const });

export async function archiveDeal(db: Client, a: Pick<DealAccess, 'dealId' | 'canDelete'>, input: { reason?: unknown; note?: unknown }, userId: number): Promise<{ linksOff: number }> {
  if (!a.canDelete) throw forbidden();
  const reason = String(input.reason ?? '') as ArchiveReason;
  if (!ARCHIVE_REASONS.includes(reason)) throw new Error('Pick why you’re archiving it');
  const note = String(input.note ?? '').trim().slice(0, 500) || null;
  const cur = await db.execute({ sql: 'SELECT archived_at FROM deals WHERE id = ?', args: [a.dealId] });
  if (cur.rows[0]?.archived_at) throw new Error('This deal is already archived');
  const res = await db.batch(
    [
      { sql: "UPDATE deals SET archived_at = datetime('now'), archived_by = ?, archive_reason = ?, archive_note = ? WHERE id = ?", args: [userId, reason, note, a.dealId] },
      { sql: "UPDATE share_links SET revoked_at = datetime('now'), archived_off = 1, updated_at = datetime('now') WHERE deal_id = ? AND revoked_at IS NULL", args: [a.dealId] },
    ],
    'write',
  );
  return { linksOff: res[1].rowsAffected };
}

export async function unarchiveDeal(db: Client, a: Pick<DealAccess, 'dealId' | 'canDelete'>): Promise<{ linksOn: number }> {
  if (!a.canDelete) throw forbidden();
  const res = await db.batch(
    [
      { sql: 'UPDATE deals SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, archive_note = NULL WHERE id = ?', args: [a.dealId] },
      { sql: "UPDATE share_links SET revoked_at = NULL, archived_off = 0, updated_at = datetime('now') WHERE deal_id = ? AND archived_off = 1", args: [a.dealId] },
    ],
    'write',
  );
  return { linksOn: res[1].rowsAffected };
}

export async function archiveInfo(db: Client, dealId: number): Promise<ArchiveInfo | null> {
  const r = (await db.execute({ sql: 'SELECT d.archived_at, d.archive_reason, d.archive_note, u.name FROM deals d LEFT JOIN users u ON u.id = d.archived_by WHERE d.id = ?', args: [dealId] })).rows[0];
  if (!r?.archived_at) return null;
  return { at: String(r.archived_at), by: r.name == null ? null : String(r.name), reason: (String(r.archive_reason) as ArchiveReason) ?? 'other', note: r.archive_note == null ? null : String(r.archive_note) };
}
