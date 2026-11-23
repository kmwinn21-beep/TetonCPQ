import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, saveDraft, getQuoteEditor, saveVersion } from './quotes';
import type { Viewer } from './planNotes';
import { getProposalCustomization, saveProposalCustomization } from './proposalText';
import { applyTemplateToVersion, createTemplate, deleteTemplate, duplicateTemplate, getTemplate, listTemplates, templateFromVersion, updateTemplate } from './bcTemplates';

let db: Client;
let dir: string;
let versionId: number;
const users: Record<'kw' | 'js' | 'ad', Viewer> = {} as never;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-tpl-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  for (const [k, name, role] of [['kw', 'Kevin Winn', 'rep'], ['js', 'Jordan Smith', 'rep'], ['ad', 'Ada Admin', 'admin']] as const) {
    const r = await db.execute({ sql: 'INSERT INTO users (email, name, role) VALUES (?, ?, ?) RETURNING id', args: [`${k}@x.test`, name, role] });
    users[k] = { id: Number(r.rows[0].id), name, role };
  }
  const { quoteId } = await createDeal(db, 'ABC Senior Living');
  const ed = (await getQuoteEditor(db, quoteId))!;
  const draft = structuredClone(ed.draft);
  draft.communities[0].alBeds = 120;
  await saveDraft(db, quoteId, draft);
  versionId = (await saveVersion(db, quoteId, 'v1')).versionId;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('business case templates (data)', () => {
  it('saves a template from a business case with placeholders', async () => {
    await saveProposalCustomization(db, versionId, { edits: { 'bc.exec.lede': 'Why ABC Senior Living and its 120 beds', 'cover.x': 'std' }, layout: { format: 'businessCase', bcPages: ['cover', 'roi'], bcChart: 'stacked' } });
    const id = await templateFromVersion(db, versionId, users.kw, { name: ' CFO ', persona: 'CFO', shared: true });
    const t = await getTemplate(db, id, users.js);
    expect(t).toMatchObject({ name: 'CFO', persona: 'CFO', shared: true, pages: 2, canEdit: true, canDelete: false, edits: { 'bc.exec.lede': 'Why {customer} and its {bedCount} beds' }, layout: { bcPages: ['cover', 'roi'], bcChart: 'stacked' } });
    await expect(templateFromVersion(db, versionId, users.kw, { name: '  ' })).rejects.toThrow(/name/);
  });

  it('keeps private templates to their owner; owner or admin deletes', async () => {
    const id = await createTemplate(db, users.kw, { name: 'Mine', shared: false });
    expect((await listTemplates(db, users.js)).some((t) => t.id === id)).toBe(false);
    await expect(getTemplate(db, id, users.js)).rejects.toThrow(/not found/);
    await updateTemplate(db, id, users.kw, { layout: { bcPages: ['cover'] }, edits: { 'bc.a': 'x', 'other.b': 'y' } });
    const t = await getTemplate(db, id, users.kw);
    expect(t.edits).toEqual({ 'bc.a': 'x' });
    expect(t.layout).toEqual({ bcPages: ['cover'] });
    const shared = (await listTemplates(db, users.js)).find((x) => x.name === 'CFO')!;
    await updateTemplate(db, shared.id, users.js, { description: 'ROI first' });
    await expect(updateTemplate(db, shared.id, users.js, { shared: false })).rejects.toThrow(/owner/);
    await expect(deleteTemplate(db, shared.id, users.js)).rejects.toThrow(/owner or an admin/);
    const copy = await duplicateTemplate(db, shared.id, users.js);
    expect(await getTemplate(db, copy, users.js)).toMatchObject({ name: 'CFO (copy)', shared: false, owner: { id: users.js.id } });
    await deleteTemplate(db, copy, users.ad);
  });

  it('applies a template to a business case and counts its use', async () => {
    const cfo = (await listTemplates(db, users.kw)).find((x) => x.name === 'CFO')!;
    await saveProposalCustomization(db, versionId, { edits: { 'bc.exec.lede': 'Mine', 'cover.x': 'std' }, layout: { format: 'standard', bcPages: ['cover'] } });
    const lay = await applyTemplateToVersion(db, versionId, cfo.id, 'layout', users.js);
    expect(lay.edits).toEqual({ 'bc.exec.lede': 'Mine', 'cover.x': 'std' });
    expect(lay.layout).toMatchObject({ format: 'businessCase', bcPages: ['cover', 'roi'], bcChart: 'stacked', bcTemplate: { id: cfo.id, name: 'CFO' } });
    const all = await applyTemplateToVersion(db, versionId, cfo.id, 'all', users.js);
    expect(all.edits).toEqual({ 'cover.x': 'std', 'bc.exec.lede': 'Why {customer} and its {bedCount} beds' });
    expect((await getProposalCustomization(db, versionId)).layout.bcTemplate).toEqual({ id: cfo.id, name: 'CFO', wording: true });
    expect((await getTemplate(db, cfo.id, users.kw)).usage).toBe(1);
  });
});
