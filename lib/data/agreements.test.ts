import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, getQuoteEditor, saveDraft, saveVersion } from './quotes';
import { linkByToken, prospectNotifications, saveShareLink, type PublicLink } from './shareLinks';
import { getDealDetails } from './dealDetails';
import { agreementInfo, requestAgreement, shapeRequest, type AgreementInfo } from './agreements';
import { agreementEmail } from '@/lib/email/templates';

let db: Client;
let dir: string;
let quoteId: number;
let dealId: number;
let kw: number;
let l: PublicLink;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-agree-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  kw = Number((await db.execute("INSERT INTO users (email, name, role) VALUES ('kevin@teton.ai', 'Kevin Winn', 'rep') RETURNING id")).rows[0].id);
  const d = await createDeal(db, 'Forest Hills', { userId: kw });
  quoteId = d.quoteId;
  dealId = d.dealId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [kw, dealId] });
  // Two communities, one in the pilot; the other has a floor plan.
  const ed = (await getQuoteEditor(db, quoteId))!;
  const base = ed.draft.communities[0];
  const draft = {
    ...ed.draft,
    schedule: { ...ed.draft.schedule, withPilot: true },
    communities: [
      { ...base, id: 'c1', name: 'Maple Court', city: 'Madison', market: 'WI', ilBeds: 0, alBeds: 96, mcBeds: 0, snfBeds: 0, pilot: true, pilotUnits: null },
      { ...base, id: 'c2', name: 'Oak Ridge', city: 'Verona', market: 'WI', ilBeds: 0, alBeds: 73, mcBeds: 0, snfBeds: 0, pilot: false, pilotUnits: null },
    ],
  };
  await saveDraft(db, quoteId, draft);
  await db.execute({ sql: "INSERT INTO floor_plans (quote_id, community_id, name, mime, size, chunks, complete) VALUES (?, 'c1', 'Maple.pdf', 'application/pdf', 10, 0, 1)", args: [quoteId] });
  await db.execute({
    sql: 'UPDATE deals SET details = ? WHERE id = ?',
    args: [JSON.stringify({ legalEntity: 'Forest Hills Senior Living, LLC', hubspotUrl: 'https://app.hubspot.com/x', signatories: [{ first: 'Dana', last: 'Lee', title: 'VP of Operations', email: 'dana@abc.com' }] }), dealId],
  });
  const v = await saveVersion(db, quoteId, 'one');
  const s = await saveShareLink(db, quoteId, { versionId: v.versionId, emails: ['Dana Lee <dana@abc.com>'] }, kw);
  l = (await linkByToken(db, s.token))!;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('what the form shows', () => {
  it('reads the deal’s details and the pilot communities with their floor plans', async () => {
    const i = await agreementInfo(db, l, 'dana@abc.com');
    expect(i.entity).toBe('Forest Hills Senior Living, LLC');
    expect(i.signatory).toMatchObject({ first: 'Dana', title: 'VP of Operations' });
    expect(i.pilot).toBe(true);
    expect(i.communities).toEqual([{ id: 'c1', name: 'Maple Court', place: 'Madison, WI', beds: 96, hasPlan: true }]);
    expect(i.requestedAt).toBeNull();
  });
});

describe('shaping a request', () => {
  const info: AgreementInfo = { entity: 'ABC LLC', signatory: { first: 'Dana', last: 'Lee', title: 'VP', email: 'dana@abc.com' }, pilot: true, communities: [{ id: 'c1', name: 'A', place: '', beds: 10, hasPlan: false }], requestedAt: null, latest: null };
  it('leaves everything skipped when nothing is ticked (confirming is optional)', () => {
    const p = shapeRequest(info, {});
    expect([p.entity.status, p.signatory.status, p.communities.status]).toEqual(['skipped', 'skipped', 'skipped']);
  });
  it('ticks, and changes (a change also confirms)', () => {
    const p = shapeRequest(info, { entity: { confirmed: true }, signatory: { value: { first: 'Dana', last: 'Lee', title: 'COO', email: 'DANA@abc.com' } }, communities: { change: 'Add Oak Ridge' }, note: ' Start in January ' });
    expect(p.entity).toMatchObject({ status: 'confirmed', value: 'ABC LLC' });
    expect(p.signatory).toMatchObject({ status: 'updated', value: { title: 'COO', email: 'dana@abc.com' }, was: { title: 'VP' } });
    expect(p.communities).toMatchObject({ status: 'updated', change: 'Add Oak Ridge' });
    expect(p.note).toBe('Start in January');
  });
  it('an unchanged edit counts as confirmed; a blank one filled in counts as updated', () => {
    expect(shapeRequest(info, { signatory: { value: info.signatory } }).signatory.status).toBe('confirmed');
    expect(shapeRequest({ ...info, entity: '' }, { entity: { value: 'New LLC' } }).entity).toMatchObject({ status: 'updated', value: 'New LLC', was: '' });
    expect(shapeRequest({ ...info, entity: '' }, { entity: { confirmed: true } }).entity.status).toBe('skipped');
  });
  it('checks the signatory', () => {
    expect(() => shapeRequest(info, { signatory: { value: { first: 'D', email: 'nope' } } })).toThrow('isn’t a valid email');
    expect(() => shapeRequest(info, { signatory: { value: { title: 'COO' } } })).toThrow('name');
  });
});

describe('sending one', () => {
  it('saves changes to the deal, records it, and tells the owner', async () => {
    const { id, payload } = await requestAgreement(db, l, { email: 'Dana@abc.com', name: 'Dana Lee' }, {
      entity: { confirmed: true },
      signatory: { value: { first: 'Dana', last: 'Lee', title: 'Chief Operating Officer', email: 'dana@abc.com' } },
      note: 'Copy our CFO',
    });
    expect(id).toBeGreaterThan(0);
    const d = await getDealDetails(db, dealId);
    expect(d?.legalEntity).toBe('Forest Hills Senior Living, LLC');
    expect(d?.signatories[0]).toMatchObject({ title: 'Chief Operating Officer' });
    expect(d?.hubspotUrl).toBe('https://app.hubspot.com/x');
    const n = await prospectNotifications(db, kw, quoteId);
    expect(n[0]).toMatchObject({ kind: 'prospect_agreement', who: 'Dana Lee', email: 'dana@abc.com', body: 'Copy our CFO' });
    expect(n[0].agreement?.signatory.status).toBe('updated');
    expect((await agreementInfo(db, l, 'dana@abc.com')).requestedAt).not.toBeNull();
    // The email: what changed, and what's left to confirm.
    const m = agreementEmail({ baseUrl: 'https://x', url: 'https://x/quotes/1', who: 'Dana Lee', first: 'Dana', dealName: 'Forest Hills', ownerName: 'Kevin', payload });
    expect(m.subject).toBe('Dana Lee requested the agreement: Forest Hills');
    expect(m.html).toContain('VP of Operations');
    expect(m.html).toContain('Still to confirm with Dana');
    expect(m.text).toContain('Signatory (Updated): Dana Lee, Chief Operating Officer');
  });
});

describe('the rep’s side', () => {
  it('shows what’s waiting, late after two days, snoozes, marks sent and undoes it', async () => {
    const { dealAgreement, agreementAction } = await import('./agreements');
    const { listDeals } = await import('./quotes');
    let a = await dealAgreement(db, dealId);
    expect(a.open?.who).toBe('Dana Lee');
    expect(a.open?.versionId).toBe(l.versionId);
    expect(a.byVersion[0]).toMatchObject({ versionId: l.versionId, who: 'Dana Lee' });
    expect(a.sharedVersionId).toBe(l.versionId);
    expect(a.late).toBe(false);
    expect((await listDeals(db, kw)).find((d) => d.dealId === dealId)?.agreementRequested).toBe(true);
    // Two days on, it's late.
    expect((await dealAgreement(db, dealId, new Date(Date.now() + 2.2 * 86_400_000))).late).toBe(true);
    await agreementAction(db, dealId, kw, 'snooze');
    a = await dealAgreement(db, dealId);
    expect(a.snoozedUntil).not.toBeNull();
    await agreementAction(db, dealId, kw, 'sent');
    a = await dealAgreement(db, dealId);
    expect(a.open).toBeNull();
    expect(a.lastSent).toMatchObject({ who: 'Dana Lee', sentByName: 'Kevin Winn' });
    expect((await listDeals(db, kw)).find((d) => d.dealId === dealId)?.agreementRequested).toBe(false);
    // The prospect's form now says it's been sent.
    expect((await agreementInfo(db, l, 'someone@abc.com')).latest?.sentAt).not.toBeNull();
    await agreementAction(db, dealId, kw, 'undo');
    expect((await dealAgreement(db, dealId)).open?.who).toBe('Dana Lee');
  });
});
