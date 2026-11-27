import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, getQuoteEditor, loadPriceBook, saveDraft, saveVersion } from './quotes';
import { duplicateDeal, duplicateInfo } from './duplicateDeal';
import { getDealDetails } from './dealDetails';
import { sampleDraft } from '@/lib/quote/sampleDraft';
import type { QuoteDraft } from '@/lib/quote/draft';

let db: Client;
let dir: string;
let owner: number;
let other: number;
let quoteId: number;
let dealId: number;
let v1: number;

const mark = (x: number) => ({ id: `m${x}`, plan: 7, page: 1, x: x / 10, y: 0.5 });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-dup-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  owner = Number((await db.execute("INSERT INTO users (email, name, role, role_key) VALUES ('o@x.test', 'Riley Rep', 'rep', 'rep') RETURNING id")).rows[0].id);
  other = Number((await db.execute("INSERT INTO users (email, name, role, role_key) VALUES ('k@x.test', 'Kevin Winn', 'rep', 'rep') RETURNING id")).rows[0].id);
  ({ quoteId, dealId } = await createDeal(db, 'Maple Grove', { userId: owner }));
  const { book } = await loadPriceBook(db);
  const d = sampleDraft(book);
  const c0 = d.communities[0];
  const draft: QuoteDraft = {
    ...d,
    customerName: 'Maple Grove',
    communities: [
      {
        ...c0,
        roomTypes: [{ id: 't1', name: 'Studio', care: 'al', rooms: 0, sensors: 1, marks: [mark(1), mark(2), mark(3)], roomsFromPlan: true }],
        commonAreas: [{ id: 'a1', name: 'Dining', kind: 'dining', count: 1, pendants: 0, sensors: 4, mark: { plan: 7, page: 1, x: 0.2, y: 0.2 } }],
        commonAreaSensorsExtra: 2,
      } as never,
      ...d.communities.slice(1),
    ],
  };
  await saveDraft(db, quoteId, draft);
  v1 = (await saveVersion(db, quoteId, 'first', owner)).versionId;
  await db.execute({ sql: "INSERT INTO proposal_text (quote_version_id, edits_json, layout_json) VALUES (?, ?, ?)", args: [v1, JSON.stringify({ 'bc.cover.title': 'Our pilot for Maple Grove' }), JSON.stringify({ format: 'businessCase', hiddenValues: ['fp.abc', 'bc.x'] })] });
  // People, files and prospect things that stay behind.
  await db.execute({ sql: 'INSERT INTO deal_collaborators (deal_id, user_id, can_inputs, can_scope, can_deliverables) VALUES (?, ?, 1, 1, 1)', args: [dealId, other] });
  await db.execute({ sql: 'UPDATE deals SET details = ? WHERE id = ?', args: [JSON.stringify({ legalEntity: 'Maple Grove LLC', geography: 'US', geographyOther: '', hubspotUrl: 'https://app.hubspot.com/x', signatories: [{ first: 'J', last: 'O', title: 'COO', email: 'j@m.test' }], closeDate: '2027-01-01' }), dealId] });
  await db.execute({ sql: "INSERT INTO deal_rooms (deal_id, tab_name, team, sections) VALUES (?, 'Resources', '[]', '[]')", args: [dealId] });
  const f = Number((await db.execute({ sql: "INSERT INTO stored_files (deal_id, name, mime, size, chunks, complete) VALUES (?, 'deck.pdf', 'application/pdf', 3, 1, 1) RETURNING id", args: [dealId] })).rows[0].id);
  await db.execute({ sql: "INSERT INTO stored_file_chunks (file_id, idx, data) VALUES (?, 0, x'010203')", args: [f] });
  await db.execute({ sql: "INSERT INTO deal_resources (deal_id, section_id, kind, title, file_id) VALUES (?, 'docs', 'file', 'Teton deck', ?)", args: [dealId, f] });
  await db.execute({ sql: "INSERT INTO deal_resources (deal_id, section_id, kind, title, plan_id) VALUES (?, 'plans', 'floorplan', 'Floor plan', 7)", args: [dealId] });
  await db.execute({ sql: "INSERT INTO deal_questions (deal_id, body, answer_text, answered_email) VALUES (?, 'Who signs?', 'Jordan', 'j@m.test')", args: [dealId] });
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('duplicating a deal', () => {
  it('describes what can be copied', async () => {
    const info = await duplicateInfo(db, quoteId);
    expect(info).toMatchObject({ name: 'Maple Grove', owner: 'Riley Rep', roomItems: 1, questions: 1, draftChanged: false });
    expect(info.versions.map((v) => [v.no, v.active])).toEqual([[1, true]]);
  });

  it('copies the deal and its formatted proposal into a new deal the duplicater owns; leaves people, plans and the prospect behind', async () => {
    const r = await duplicateDeal(db, quoteId, other, { name: 'Maple Grove West' });
    const d = (await db.execute({ sql: 'SELECT * FROM deals WHERE id = ?', args: [r.dealId] })).rows[0];
    expect({ ...d }).toMatchObject({ customer_name: 'Maple Grove West', owner_id: other, status: 'open', duplicated_from_deal: dealId, duplicated_from_name: 'Maple Grove', duplicated_from_version: 1 });
    const ed = (await getQuoteEditor(db, r.quoteId))!;
    expect(ed.versions.filter((v) => v.status !== 'draft').map((v) => v.versionNo)).toEqual([1]);
    const c = ed.activeInputs!.communities[0] as unknown as { roomTypes: Array<{ rooms: number; marks?: unknown }>; commonAreas: Array<{ mark?: unknown }>; commonAreaSensors: number; commonAreaSensorsExtra?: number };
    expect(c.roomTypes[0].rooms).toBe(3); // counts kept
    expect(c.roomTypes[0].marks).toBeUndefined(); // tags gone
    expect(c.commonAreas[0].mark).toBeUndefined();
    expect(c.commonAreaSensors).toBe(6); // the same total, now typed in
    expect(ed.activeInputs!.customerName).toBe('Maple Grove West');
    // Formatted proposal: wording and layout, minus floor-plan settings.
    const pt = (await db.execute({ sql: 'SELECT edits_json, layout_json FROM proposal_text WHERE quote_version_id = ?', args: [r.versionId] })).rows[0];
    expect(JSON.parse(String(pt.edits_json))['bc.cover.title']).toBe('Our pilot for Maple Grove');
    expect(JSON.parse(String(pt.layout_json)).hiddenValues).toEqual(['bc.x']);
    // Not copied.
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM deal_collaborators WHERE deal_id = ?', args: [r.dealId] })).rows[0].n).toBe(0);
    const det = await getDealDetails(db, r.dealId);
    expect(det).toMatchObject({ geography: 'US', legalEntity: '', hubspotUrl: '', signatories: [] });
    // Deal room content (with its own file record), no floor plan card; questions without answers.
    const res = (await db.execute({ sql: 'SELECT title, file_id FROM deal_resources WHERE deal_id = ?', args: [r.dealId] })).rows;
    expect(res.map((x) => x.title)).toEqual(['Teton deck']);
    const file = (await db.execute({ sql: 'SELECT deal_id FROM stored_files WHERE id = ?', args: [res[0].file_id] })).rows[0];
    expect(Number(file.deal_id)).toBe(r.dealId);
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM stored_file_chunks WHERE file_id = ?', args: [res[0].file_id] })).rows[0].n).toBe(1);
    const qs = (await db.execute({ sql: 'SELECT body, answer_text FROM deal_questions WHERE deal_id = ?', args: [r.dealId] })).rows;
    expect(qs.map((x) => [x.body, x.answer_text])).toEqual([['Who signs?', null]]);
    // The original is untouched.
    expect((await db.execute({ sql: 'SELECT owner_id, customer_name FROM deals WHERE id = ?', args: [dealId] })).rows[0]).toMatchObject({ owner_id: owner, customer_name: 'Maple Grove' });
  });

  it('can leave the deal room and questions out, and copy the unsaved draft', async () => {
    const ed = (await getQuoteEditor(db, quoteId))!;
    await saveDraft(db, quoteId, { ...ed.draft!, customerName: 'Maple Grove', notes: 'changed' } as QuoteDraft);
    expect((await duplicateInfo(db, quoteId)).draftChanged).toBe(true);
    const r = await duplicateDeal(db, quoteId, owner, { from: 'draft', room: false, questions: false });
    const d = (await db.execute({ sql: 'SELECT customer_name, duplicated_from_version FROM deals WHERE id = ?', args: [r.dealId] })).rows[0];
    expect(d).toMatchObject({ customer_name: 'Maple Grove (copy)', duplicated_from_version: null });
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM deal_resources WHERE deal_id = ?', args: [r.dealId] })).rows[0].n).toBe(0);
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM deal_questions WHERE deal_id = ?', args: [r.dealId] })).rows[0].n).toBe(0);
    // Formatting comes from the active version.
    const pt = (await db.execute({ sql: 'SELECT edits_json FROM proposal_text WHERE quote_version_id = ?', args: [r.versionId] })).rows[0];
    expect(JSON.parse(String(pt.edits_json))['bc.cover.title']).toBe('Our pilot for Maple Grove');
  });
});
