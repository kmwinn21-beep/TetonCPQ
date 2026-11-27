import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal } from './quotes';
import { acceptTetonRound, addNote, agreementNotes, agreementNotifications, decideChange, finalBlockers, finalFile, getAgreement, invite, markFinal, markSigned, prospectAccess, removePerson, roundFile, sendProspectRound, sendTetonRound, setPerson, teamCaps, uploadProspectRound, uploadTetonRound, type Actor } from './agreementDocs';
import { acceptedText, parseDocx } from '@/lib/agreement/docx';
import { del, h, ins, makeDocx, p, r } from '@/lib/agreement/testDocx';

let db: Client;
let dir: string;
let dealId: number;
let quoteId: number;
let owner: number;
const full = { view: true, upload: true, review: true, people: true, finish: true };
let team: Extract<Actor, { kind: 'team' }>;
const signer: Extract<Actor, { kind: 'prospect' }> = { kind: 'prospect', email: 'jordan@maple.test', name: 'Jordan Ortiz', level: 'lead', signatory: true };

const draft = makeDocx([h('Master Services Agreement'), p(r('2. Term. The initial term is thirty-six (36) months.')), p(r('11. Governing law. Delaware.'))]);
const redlines = makeDocx([h('Master Services Agreement'), p(r('2. Term. The initial term is '), del(1, 'Alex Smith', 'thirty-six (36)'), ins(2, 'Alex Smith', 'twenty-four (24)'), r(' months.')), p(r('11. Governing law. Ohio.'))]);
const response = makeDocx([h('Master Services Agreement'), p(r('2. Term. The initial term is thirty-six (36) months'), ins(3, 'Kevin Winn', ', with Fees fixed for the Initial Term'), r('.')), p(r('11. Governing law. Delaware.'))]);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-agr-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  owner = Number((await db.execute("INSERT INTO users (email, name, role, role_key) VALUES ('k@x.test', 'Kevin Winn', 'rep', 'rep') RETURNING id")).rows[0].id);
  ({ dealId, quoteId } = await createDeal(db, 'Maple Grove', { userId: owner }));
  team = { kind: 'team', id: owner, name: 'Kevin Winn', caps: full };
  await db.execute({ sql: 'UPDATE deals SET details = ? WHERE id = ?', args: [JSON.stringify({ legalEntity: '', geography: '', geographyOther: '', hubspotUrl: '', signatories: [{ first: 'Jordan', last: 'Ortiz', title: 'COO', email: 'jordan@maple.test' }], closeDate: '' }), dealId] });
  const v = Number((await db.execute({ sql: "SELECT id FROM quote_versions WHERE quote_id = ?", args: [quoteId] })).rows[0].id);
  await db.execute({ sql: "INSERT INTO share_links (deal_id, version_id, token, expires_on, created_by) VALUES (?, ?, 'tok', '2099-01-01', ?)", args: [dealId, v, owner] });
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('permissions', () => {
  it('come from the matrix: owner reviews; a collaborating rep only views; RevOps uploads and finishes', () => {
    const owned = { isOwner: true, isCollaborator: false, archived: null };
    const collab = { isOwner: false, isCollaborator: true, archived: null };
    expect(teamCaps({ role: 'rep' }, owned)).toEqual({ view: true, upload: false, review: true, people: true, finish: true });
    expect(teamCaps({ role: 'rep' }, collab)).toEqual({ view: true, upload: false, review: false, people: false, finish: false });
    expect(teamCaps({ role: 'deal_desk' }, { isOwner: false, isCollaborator: false, archived: null })).toMatchObject({ view: true, upload: true, review: false, finish: true });
    expect(teamCaps({ role: 'admin' }, { ...owned, isOwner: false })).toEqual(full);
  });
});

describe('an agreement, round by round', () => {
  it('Teton uploads and sends a draft; the prospect sees nothing before it is sent', async () => {
    await uploadTetonRound(db, dealId, team, { name: 'MSA.docx', data: draft });
    expect((await getAgreement(db, dealId, signer)).rounds).toEqual([]);
    await expect(uploadProspectRound(db, dealId, signer, { name: 'x.docx', data: redlines })).rejects.toThrow(/isn’t with you/);
    await sendTetonRound(db, dealId, team);
    const v = await getAgreement(db, dealId, signer);
    expect(v).toMatchObject({ status: 'with_prospect', title: 'Master Services Agreement', turn: 'With the prospect' });
    expect(v.rounds.map((x) => [x.no, x.side, x.sent])).toEqual([[1, 'teton', true]]);
  });

  it('people: the signatory is a lead reviewer; they invite counsel, who joins the link; viewers can’t upload', async () => {
    expect((await prospectAccess(db, dealId, 'jordan@maple.test')).level).toBe('lead');
    await invite(db, dealId, signer, { email: 'alex@smithlee.test', name: 'Alex Smith', organization: 'Smith & Lee LLP', level: 'redline' });
    const alex = await prospectAccess(db, dealId, 'alex@smithlee.test');
    expect(alex).toMatchObject({ level: 'redline', invitedBy: 'jordan@maple.test', onLink: true, showProposal: false, showResources: false });
    const viewer: Extract<Actor, { kind: 'prospect' }> = { kind: 'prospect', email: 'cfo@maple.test', name: null, level: 'view', signatory: false };
    await expect(uploadProspectRound(db, dealId, viewer, { name: 'x.docx', data: redlines })).rejects.toThrow(/not upload/);
    await expect(invite(db, dealId, { ...viewer, level: 'lead' }, { email: 'z@z.test' })).rejects.toThrow(/Only a signatory/);
    const n = await agreementNotifications(db, owner, quoteId);
    expect(n[0].message).toMatch(/invited Alex Smith \(Smith & Lee LLP\) as redline/);
  });

  it('the prospect uploads redlines (a redline reviewer) and a lead sends them; Word and untracked edits are read', async () => {
    const alex: Extract<Actor, { kind: 'prospect' }> = { kind: 'prospect', email: 'alex@smithlee.test', name: 'Alex Smith', level: 'redline', signatory: false };
    await uploadProspectRound(db, dealId, alex, { name: 'MSA - SL redline.docx', data: redlines });
    await expect(sendProspectRound(db, dealId, alex)).rejects.toThrow(/lead reviewer/);
    await sendProspectRound(db, dealId, signer);
    const v = await getAgreement(db, dealId, team);
    expect(v.status).toBe('with_teton');
    const r2 = v.rounds[1];
    expect(r2.changes.map((c) => [c.cid, c.kind, c.deleted, c.inserted, c.commercial])).toEqual([
      ['c1', 'replace', 'thirty-six (36)', 'twenty-four (24)', true],
      ['u1', 'untracked', 'Delaware.', 'Ohio.', false],
    ]);
  });

  it('Teton decides, notes (Teton-only and shared), and downloads its response with decisions applied', async () => {
    const r2 = (await getAgreement(db, dealId, team)).rounds[1];
    await decideChange(db, dealId, team, r2.changes[0].id, 'rejected');
    await decideChange(db, dealId, team, r2.changes[1].id, 'rejected');
    await addNote(db, dealId, team, { changeId: r2.changes[0].id, visibility: 'internal', body: 'Counter with 36 + price lock' });
    await addNote(db, dealId, team, { changeId: r2.changes[0].id, visibility: 'shared', body: 'We can’t do 24, but we’ll lock your price.' });
    expect((await agreementNotes(db, dealId, signer)).map((n) => n.body)).toEqual(['We can’t do 24, but we’ll lock your price.']);
    // Decisions stay Teton's until it answers.
    expect((await getAgreement(db, dealId, signer)).rounds[1].changes[0].decision).toBeNull();
    expect(await finalBlockers(db, dealId)).toEqual(expect.arrayContaining([expect.stringMatching(/without Track Changes/)]));
    const f = await roundFile(db, dealId, team, r2.id, true);
    expect(f.name).toBe('MSA - SL redline - Teton response.docx');
    expect(acceptedText(parseDocx(f.data).paragraphs[1])).toBe('2. Term. The initial term is thirty-six (36) months.');
  });

  it('Teton uploads its response, sends it; the prospect accepts; it is marked final (clean file), then signed', async () => {
    await uploadTetonRound(db, dealId, team, { name: 'MSA - Teton response.docx', data: response });
    await sendTetonRound(db, dealId, team);
    expect((await getAgreement(db, dealId, signer)).rounds[1].changes[0].decision).toBe('rejected'); // now visible
    expect(await finalBlockers(db, dealId)).toEqual(['The prospect hasn’t accepted Teton’s latest round.']);
    await acceptTetonRound(db, dealId, signer);
    expect(await finalBlockers(db, dealId)).toEqual([]);
    await expect(markFinal(db, dealId, team, {})).rejects.toThrow(/active version/);
    await markFinal(db, dealId, team, { versionMatches: true });
    const fin = parseDocx((await finalFile(db, dealId)).data);
    expect(fin.changes).toEqual([]);
    expect(acceptedText(fin.paragraphs[1])).toBe('2. Term. The initial term is thirty-six (36) months, with Fees fixed for the Initial Term.');
    await markSigned(db, dealId, team);
    expect((await db.execute({ sql: 'SELECT status FROM deals WHERE id = ?', args: [dealId] })).rows[0].status).toBe('won');
    expect((await getAgreement(db, dealId, signer)).turn).toBe('Signed');
  });

  it('Teton manages people: levels, tabs; signatories stay lead; the signatory removes only people they invited', async () => {
    await setPerson(db, dealId, team, { email: 'cfo@maple.test', level: 'comment', showProposal: true, showResources: false });
    expect(await prospectAccess(db, dealId, 'cfo@maple.test')).toMatchObject({ level: 'comment', showResources: false });
    await expect(setPerson(db, dealId, team, { email: 'jordan@maple.test', level: 'view' })).rejects.toThrow(/always lead/);
    await expect(removePerson(db, dealId, signer, 'cfo@maple.test')).rejects.toThrow(/can’t remove/);
    await removePerson(db, dealId, signer, 'alex@smithlee.test');
    expect((await prospectAccess(db, dealId, 'alex@smithlee.test')).onLink).toBe(false);
  });
});
