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
