/**
 * Saving input changes made on a proposal: apply them to the deal's current
 * draft, save that as the next version, and carry the proposal's wording and
 * layout over to it. The version the changes were made on stays as it was.
 */
import type { Client } from '@libsql/client';
import { getQuoteEditor, getVersion, saveDraft, saveVersion } from './quotes';
import { applyChanges, describeChanges, effectiveChanges, type Changes } from '@/lib/proposal/whatIf';

export async function saveProposalChanges(db: Client, versionId: number, changes: Changes, userId: number | null = null): Promise<{ versionId: number; versionNo: number }> {
  const v = await getVersion(db, versionId);
  if (!v) throw new Error('Version not found');
  if (v.status === 'draft') throw new Error('Save the draft as a version first');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Changes must be an object');
  const real = effectiveChanges(v.inputs, changes);
  if (!Object.keys(real).length) throw new Error('Nothing changed');
  applyChanges(v.inputs, real); // validates every field and value

  const editor = await getQuoteEditor(db, v.quoteId);
  if (!editor) throw new Error('Deal not found');
  // Applied to the deal as it is now, so other edits made on the deal since this version are kept.
  await saveDraft(db, v.quoteId, applyChanges(editor.draft, real));
  const note = `From proposal v${v.versionNo}: ${describeChanges(v.inputs, real)}`.slice(0, 500);
  const saved = await saveVersion(db, v.quoteId, note, userId);

  // The proposal's wording and layout carry over to the new version.
  await db.execute({
    sql: `INSERT INTO proposal_text (quote_version_id, edits_json, layout_json, updated_by, updated_at)
          SELECT ?, edits_json, layout_json, ?, datetime('now') FROM proposal_text WHERE quote_version_id = ?`,
    args: [saved.versionId, userId, versionId],
  });
  return saved;
}
