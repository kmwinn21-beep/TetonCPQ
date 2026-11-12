import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { newCommunity } from '@/lib/quote/draft';
import { createDeal, getExportHtml, getQuoteEditor, getVersion, getVersionLines, listDeals, listExports, markSent, saveDraft, saveVersion } from './quotes';

let db: Client;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-cpq-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  await migrate(db); // idempotent
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('deals, drafts and versions', () => {
  it('seeds the price book', async () => {
    const rs = await db.execute("SELECT list_price FROM products WHERE sku = 'TETON-PLATFORM'");
    expect(Number(rs.rows[0].list_price)).toBe(99);
  });

  it('creates a deal with a default draft and saves frozen versions', async () => {
    const { quoteId } = await createDeal(db, 'Acme Senior Living', { now: new Date(Date.UTC(2026, 10, 12)) });
    let ed = (await getQuoteEditor(db, quoteId))!;
    expect(ed.draftVersionNo).toBe(1);
    expect(ed.draft.commercial.pilotRate).toBe(75);
    expect(ed.versions).toEqual([]);

    const draft = { ...ed.draft, communities: [{ ...newCommunity(0), name: 'Site A', beds: 120, pilot: true }] };
    await saveDraft(db, quoteId, draft);
    const v1 = await saveVersion(db, quoteId, 'First proposal');
    expect(v1.versionNo).toBe(1);

    ed = (await getQuoteEditor(db, quoteId))!;
    expect(ed.draftVersionNo).toBe(2);
    expect(ed.draft.communities[0].name).toBe('Site A');
    expect(ed.versions).toHaveLength(1);
    expect(ed.versions[0]).toMatchObject({ versionNo: 1, status: 'saved', changeNote: 'First proposal', rung: 1 });
    expect(ed.versions[0].totalInvestment12).toBeGreaterThan(0);

    // Edit the draft: the saved version is untouched.
    await saveDraft(db, quoteId, { ...ed.draft, commercial: { ...ed.draft.commercial, platformRate: 85 } });
    const saved = (await getVersion(db, v1.versionId))!;
    expect(saved.inputs.commercial.platformRate).toBe(99);

    const v2 = await saveVersion(db, quoteId, 'Discount');
    const second = (await getVersion(db, v2.versionId))!;
    expect(second.guardrails?.findings.map((f) => f.code)).toContain('BELOW_POST_PILOT_FLOOR');

    const rows = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM communities WHERE quote_version_id = ?', args: [v1.versionId] });
    expect(Number(rows.rows[0].n)).toBe(1);
  });

  it('refuses to change or delete a saved version', async () => {
    const { quoteId } = await createDeal(db, 'Frozen Co');
    const { versionId } = await saveVersion(db, quoteId, null);
    await expect(db.execute({ sql: "UPDATE quote_versions SET inputs_json = '{}' WHERE id = ?", args: [versionId] })).rejects.toThrow(/frozen/);
    await expect(db.execute({ sql: "UPDATE quote_versions SET status = 'draft' WHERE id = ?", args: [versionId] })).rejects.toThrow(/frozen/);
    await expect(db.execute({ sql: 'DELETE FROM quote_versions WHERE id = ?', args: [versionId] })).rejects.toThrow(/frozen/);
    // Marking it sent is allowed.
    await db.execute({ sql: "UPDATE quote_versions SET status = 'sent', sent_at = datetime('now') WHERE id = ?", args: [versionId] });
  });

  it('records approval needs for a free pilot without blocking', async () => {
    const { quoteId } = await createDeal(db, 'Free Pilot SL');
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft, commercial: { ...ed.draft.commercial, pilotRate: 0, installCreditPct: 1 } });
    const { versionId } = await saveVersion(db, quoteId, null);
    const ev = await db.execute({ sql: 'SELECT rule_code, required_role, status FROM approval_events WHERE quote_version_id = ?', args: [versionId] });
    expect(ev.rows.map((r) => [r.rule_code, r.required_role, r.status])).toContainEqual(['FREE_PILOT', 'vp_sales_or_ceo', 'requested']);
  });

  it('stores price lines with each version and records a sent proposal', async () => {
    const { quoteId } = await createDeal(db, 'Sent SL');
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft, communities: [{ ...newCommunity(0), name: 'Site', beds: 50, pilot: true }] });
    const { versionId } = await saveVersion(db, quoteId, 'to CFO');
    const lines = await getVersionLines(db, versionId, ['Site']);
    expect(lines.map((l) => l.description)).toContain('Teton subscription — pilot');
    expect(lines[0].communityName).toBe('Site');

    const html = '<!doctype html><html><body>' + 'x'.repeat(200) + '</body></html>';
    const { exportId } = await markSent(db, versionId, 'Jane CFO <jane@example.com>', html);
    const v = (await getVersion(db, versionId))!;
    expect(v.status).toBe('sent');
    expect(v.sentTo).toBe('Jane CFO <jane@example.com>');
    expect(await getExportHtml(db, exportId)).toBe(html);
    expect(await listExports(db, versionId)).toHaveLength(1);
    // still frozen after sending
    await expect(db.execute({ sql: "UPDATE quote_versions SET inputs_json = '{}' WHERE id = ?", args: [versionId] })).rejects.toThrow(/frozen/);
  });

  it('lists deals with their draft scope', async () => {
    const deals = await listDeals(db);
    const acme = deals.find((d) => d.customerName === 'Acme Senior Living')!;
    expect(acme).toMatchObject({ savedVersions: 2, communities: 1, beds: 120 });
  });
});
