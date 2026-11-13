/**
 * Per-version proposal wording. Versions themselves are frozen; the words a
 * rep adjusts on the proposal live here, keyed by version, so the numbers stay
 * exactly what the version recorded.
 */
import type { Client } from '@libsql/client';
import { sanitizeEdits, type TextEdits } from '@/lib/proposal/text';

export async function getProposalText(db: Client, versionId: number): Promise<TextEdits> {
  const rs = await db.execute({ sql: 'SELECT edits_json FROM proposal_text WHERE quote_version_id = ?', args: [versionId] });
  if (!rs.rows.length) return {};
  try {
    return sanitizeEdits(JSON.parse(String(rs.rows[0].edits_json)));
  } catch {
    return {};
  }
}

/** Replace a version's text edits. An empty object clears them. */
export async function saveProposalText(db: Client, versionId: number, edits: unknown, userId: number | null = null): Promise<TextEdits> {
  const clean = sanitizeEdits(edits);
  const v = await db.execute({ sql: 'SELECT status FROM quote_versions WHERE id = ?', args: [versionId] });
  if (!v.rows.length) throw new Error('Version not found');
  if (v.rows[0].status === 'draft') throw new Error('Save the draft as a version before editing its proposal');
  await db.execute({
    sql: `INSERT INTO proposal_text (quote_version_id, edits_json, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(quote_version_id) DO UPDATE SET edits_json = excluded.edits_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [versionId, JSON.stringify(clean), userId],
  });
  return clean;
}
