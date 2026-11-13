import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { newCommunity } from '@/lib/quote/draft';
import { createDeal, getQuoteEditor, saveDraft, saveVersion } from '@/lib/data/quotes';
import { getProposalText, saveProposalText } from '@/lib/data/proposalText';
import { fillTemplate, renderText, sanitizeEdits, tidy } from '@/lib/proposal/text';

describe('proposal text templates', () => {
  it('splits text and calculated values', () => {
    expect(fillTemplate('Using your {rate} cost of money.', { rate: '8%' })).toEqual([{ text: 'Using your ' }, { token: 'rate', value: '8%' }, { text: ' cost of money.' }]);
    expect(renderText('{a} and {b}', { a: '1 community', b: '119 beds' })).toBe('1 community and 119 beds');
  });

  it('leaves unknown braces as typed text', () => {
    expect(renderText('Plan {x} stays', {})).toBe('Plan {x} stays');
  });

  it('lets a removed value simply disappear', () => {
    expect(renderText('Per apartment at run rate.', { perUnit: '$501' })).toBe('Per apartment at run rate.');
  });

  it('tidies whitespace', () => {
    expect(tidy('  two\n lines  ')).toBe('two lines');
  });

  it('rejects malformed edits', () => {
    expect(sanitizeEdits({ 'card.net.note': 'x' })).toEqual({ 'card.net.note': 'x' });
    expect(() => sanitizeEdits([])).toThrow();
    expect(() => sanitizeEdits({ 'bad key!': 'x' })).toThrow();
    expect(() => sanitizeEdits({ k: 5 })).toThrow();
    expect(() => sanitizeEdits({ k: 'x'.repeat(5000) })).toThrow();
  });
});

describe('proposal text storage', () => {
  let db: Client;
  let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'teton-text-'));
    db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
    await migrate(db);
  });
  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps wording per version, replaceable and clearable', async () => {
    const { quoteId } = await createDeal(db, 'Acme Senior Living');
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft, communities: [{ ...newCommunity(0), name: 'Site A', alBeds: 50 }] });
    const v = await saveVersion(db, quoteId, 'v1');
    expect(await getProposalText(db, v.versionId)).toEqual({});
    await saveProposalText(db, v.versionId, { 'summary.title': 'Year one at a glance' });
    expect(await getProposalText(db, v.versionId)).toEqual({ 'summary.title': 'Year one at a glance' });
    await saveProposalText(db, v.versionId, {});
    expect(await getProposalText(db, v.versionId)).toEqual({});
  });

  it('refuses unknown versions', async () => {
    await expect(saveProposalText(db, 99999, {})).rejects.toThrow('Version not found');
  });
});

describe('saving input changes from a proposal', () => {
  let db: Client;
  let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'teton-whatif-'));
    db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
    await migrate(db);
  });
  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the next version with the changes and the same wording, leaving the old one alone', async () => {
    const { saveProposalChanges } = await import('@/lib/data/whatIf');
    const { getVersion } = await import('@/lib/data/quotes');
    const { quoteId } = await createDeal(db, 'Acme Senior Living');
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft, communities: [{ ...newCommunity(0), name: 'Site A', alBeds: 50 }] });
    const v1 = await saveVersion(db, quoteId, 'v1');
    await saveProposalText(db, v1.versionId, { 'summary.title': 'Year one' });
    // A deal edit made after v1 (not part of the proposal's changes) is kept.
    const ed2 = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed2.draft, customerName: 'Acme SL (renamed)' });

    const v2 = await saveProposalChanges(db, v1.versionId, { 'commercial.platformRate': 89, 'client.occupancy': 0.92 });
    expect(v2.versionNo).toBe(2);
    const a = (await getVersion(db, v1.versionId))!;
    const b = (await getVersion(db, v2.versionId))!;
    expect(a.inputs.commercial.platformRate).toBe(99);
    expect(b.inputs.commercial.platformRate).toBe(89);
    expect(b.inputs.client.occupancy).toBe(0.92);
    expect(b.inputs.customerName).toBe('Acme SL (renamed)');
    expect(b.changeNote).toContain('Platform rate / bed / mo $99 → $89');
    expect(await getProposalText(db, v2.versionId)).toEqual({ 'summary.title': 'Year one' });
    // The deal's draft carries the change forward.
    expect((await getQuoteEditor(db, quoteId))!.draft.commercial.platformRate).toBe(89);
  });

  it('rejects empty, unknown and out-of-range changes', async () => {
    const { saveProposalChanges } = await import('@/lib/data/whatIf');
    const { quoteId } = await createDeal(db, 'Beta');
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft, communities: [{ ...newCommunity(0), name: 'S', alBeds: 10 }] });
    const v = await saveVersion(db, quoteId, null);
    await expect(saveProposalChanges(db, v.versionId, { 'commercial.platformRate': 99 })).rejects.toThrow('Nothing changed');
    await expect(saveProposalChanges(db, v.versionId, { 'communities.0.alBeds': 5 })).rejects.toThrow();
    await expect(saveProposalChanges(db, v.versionId, { 'client.occupancy': 3 })).rejects.toThrow('out of range');
  });
});
