/**
 * Per-version proposal wording and layout. Versions themselves are frozen; the
 * words a rep adjusts on the proposal, and how its sections are arranged, live
 * here, keyed by version, so the numbers stay exactly what the version recorded.
 */
import type { Client } from '@libsql/client';
import { sanitizeEdits, type TextEdits } from '@/lib/proposal/text';
import { DEFAULT_LAYOUT, sanitizeLayout, type ProposalLayout } from '@/lib/proposal/layout';
import { cleanRichText } from '@/lib/proposal/richText';

export interface ProposalCustomization {
  edits: TextEdits;
  layout: ProposalLayout;
}

export async function getProposalCustomization(db: Client, versionId: number): Promise<ProposalCustomization> {
  const rs = await db.execute({ sql: 'SELECT edits_json, layout_json FROM proposal_text WHERE quote_version_id = ?', args: [versionId] });
  const empty = { edits: {}, layout: structuredClone(DEFAULT_LAYOUT) };
  if (!rs.rows.length) return empty;
  let edits: TextEdits = {};
  let layout = empty.layout;
  try {
    edits = sanitizeEdits(JSON.parse(String(rs.rows[0].edits_json)));
  } catch {
    /* keep empty */
  }
  try {
    // Stored HTML was cleaned on the way in.
    if (rs.rows[0].layout_json) layout = sanitizeLayout(JSON.parse(String(rs.rows[0].layout_json)), (h) => h);
  } catch {
    /* keep default */
  }
  return { edits, layout };
}

/** Wording edits only (kept for callers that don't need the layout). */
export async function getProposalText(db: Client, versionId: number): Promise<TextEdits> {
  return (await getProposalCustomization(db, versionId)).edits;
}

/** Replace a version's wording edits and/or layout. Omitted parts are left as they are. */
export async function saveProposalCustomization(
  db: Client,
  versionId: number,
  input: { edits?: unknown; layout?: unknown },
  userId: number | null = null,
): Promise<ProposalCustomization> {
  const v = await db.execute({ sql: 'SELECT status FROM quote_versions WHERE id = ?', args: [versionId] });
  if (!v.rows.length) throw new Error('Version not found');
  if (v.rows[0].status === 'draft') throw new Error('Save the draft as a version before editing its proposal');
  const current = await getProposalCustomization(db, versionId);
  const edits = input.edits === undefined ? current.edits : sanitizeEdits(input.edits);
  const layout = input.layout === undefined ? current.layout : sanitizeLayout(input.layout, cleanRichText);
  await db.execute({
    sql: `INSERT INTO proposal_text (quote_version_id, edits_json, layout_json, updated_by, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(quote_version_id) DO UPDATE SET edits_json = excluded.edits_json, layout_json = excluded.layout_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [versionId, JSON.stringify(edits), JSON.stringify(layout), userId],
  });
  return { edits, layout };
}

export async function saveProposalText(db: Client, versionId: number, edits: unknown, userId: number | null = null): Promise<TextEdits> {
  return (await saveProposalCustomization(db, versionId, { edits }, userId)).edits;
}
