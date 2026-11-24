import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { setMailer, type OutgoingEmail } from '@/lib/email/send';
import { commentEmail, fillIntro, firstNameOf, shareEmail } from '@/lib/email/templates';
import { createDeal, saveVersion } from './quotes';
import type { Viewer } from './planNotes';
import { addComment } from './proposalComments';
import { addProspectComment, linkByToken, saveShareLink, type PublicLink } from './shareLinks';
import { checkSignInCode, markSeen, muteReplies, queueProspectMail, sendShareEmails, sendSignInCode, unsubscribeUrl } from './prospectMail';

let db: Client;
let dir: string;
let quoteId: number;
let vid: number;
let l: PublicLink;
const kw: Viewer = { id: 0, name: 'Kevin Winn', role: 'rep' };
const BASE = 'https://proposals.example';
const T0 = new Date('2026-11-24T15:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

// A fake Resend: what was sent (and scheduled), and what was canceled.
let sent: Array<OutgoingEmail & { id: string; canceled?: boolean }> = [];
let failCancel = false;
beforeEach(() => {
  sent = [];
  failCancel = false;
  setMailer({
    async send(e) {
      const id = `e${sent.length + 1}`;
      sent.push({ ...e, id });
      return { id };
    },
    async cancel(id) {
      if (failCancel) return false;
      const m = sent.find((x) => x.id === id);
      if (m) m.canceled = true;
      return true;
    },
  });
});
const live = () => sent.filter((x) => !x.canceled);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-pmail-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  const u = await db.execute({ sql: "INSERT INTO users (email, name, role) VALUES ('kevin@teton.ai', 'Kevin Winn', 'rep') RETURNING id", args: [] });
  kw.id = Number(u.rows[0].id);
  const d = await createDeal(db, 'ABC Senior Living', { userId: kw.id });
  quoteId = d.quoteId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [kw.id, d.dealId] });
  vid = (await saveVersion(db, quoteId, 'one')).versionId;
  const s = await saveShareLink(db, quoteId, { versionId: vid, emails: ['Dana Lee <dana.lee@abc.com>', 'cfo@abc.com'], proposalName: 'ABC Senior Living proposal', note: 'Great talking today.' }, kw.id);
  l = (await linkByToken(db, s.token))!;
});
afterAll(() => {
  setMailer(null);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('email wording', () => {
  it('fills first names', () => {
    expect(firstNameOf('Dana Lee', 'x@y.com')).toBe('Dana');
    expect(firstNameOf(null, 'chris.fox@abc.com')).toBe('Chris');
    expect(firstNameOf(null, 'cfo@abc.com')).toBeNull();
    expect(fillIntro(null, 'Dana')).toBe('Hey Dana - here is your proposal from Teton!');
    expect(fillIntro('Hi {First Name}, take a look', null)).toBe('Hi there, take a look');
  });

  it('share email: intro, note, name, no code in it', () => {
    const e = shareEmail({ baseUrl: BASE, url: `${BASE}/p/x`, email: 'dana@abc.com', first: 'Dana', repName: 'Kevin Winn', proposalName: 'ABC proposal', note: 'Great talking', allowComments: true, allowPdf: false, verify: true, expiresOn: '2026-12-24' });
    expect(e.subject).toBe('Kevin Winn shared a proposal with you: ABC proposal');
    expect(e.html).toContain('Hey Dana - here is your proposal from Teton!');
    expect(e.html).toContain('A note from Kevin');
    expect(e.html).toContain('ABC proposal');
    expect(e.html).toContain('We’ll email you a 6-digit code');
    expect(e.html).not.toContain('Download a PDF');
    expect(e.text).toContain(`${BASE}/p/x`);
  });

  it('reply / comment emails: the opening lines and the button', () => {
    const base = { baseUrl: BASE, url: `${BASE}/p/x`, first: 'Dana', repName: 'Kevin Winn', proposalName: 'ABC proposal', unsubscribeUrl: `${BASE}/stop` };
    const reply = commentEmail({ ...base, items: [{ kind: 'reply', label: 'The pilot · Pilot costs', original: { who: 'You', initials: 'DL', body: 'January?', at: '2026-11-24 15:00:00' }, messages: [{ author: 'Kevin Winn', body: 'Yes', at: '2026-11-24 15:05:00' }] }] });
    expect(reply.html).toContain('Hey Dana - Kevin replied to the comment you made on your proposal.');
    expect(reply.html).toContain('View and/or Reply');
    expect(reply.subject).toBe('Kevin Winn replied to your comment on ABC proposal');
    const added = commentEmail({ ...base, items: [{ kind: 'comment', label: 'Whole proposal', messages: [{ author: 'Kevin Winn', body: 'FYI', at: '2026-11-24 15:05:00' }] }] });
    expect(added.html).toContain('Hey Dana - Kevin added a comment to your proposal.');
  });
});

describe('the share email', () => {
  it('goes to everyone not emailed yet, from the rep, and only once', async () => {
    expect(await sendShareEmails(db, quoteId, BASE, kw)).toEqual(['dana.lee@abc.com', 'cfo@abc.com']);
    expect(sent.map((s) => [s.to, s.replyTo, s.fromName])).toEqual([['dana.lee@abc.com', 'kevin@teton.ai', 'Kevin Winn (Teton)'], ['cfo@abc.com', 'kevin@teton.ai', 'Kevin Winn (Teton)']]);
    expect(sent[0].html).toContain('Hey Dana - here is your proposal from Teton!');
    expect(sent[1].html).toContain('Hey there - here is your proposal from Teton!');
    expect(await sendShareEmails(db, quoteId, BASE, kw)).toEqual([]);
    // Again, on purpose, to one person.
    expect(await sendShareEmails(db, quoteId, BASE, kw, ['cfo@abc.com'])).toEqual(['cfo@abc.com']);
  });
});

describe('sign-in codes', () => {
  it('emails a code that works once, for 10 minutes', async () => {
    await sendSignInCode(db, l, 'dana.lee@abc.com', BASE, T0);
    const code = /code to open .*: (\d{6})/.exec(sent[0].subject)![1];
    expect(sent[0].to).toBe('dana.lee@abc.com');
    expect(await checkSignInCode(db, l, 'dana.lee@abc.com', '000000' === code ? '111111' : '000000', at(1))).toBe(false);
    expect(await checkSignInCode(db, l, 'dana.lee@abc.com', code, at(11))).toBe(false);
    await sendSignInCode(db, l, 'dana.lee@abc.com', BASE, at(12));
    const code2 = /: (\d{6})$/.exec(sent[1].subject)![1];
    expect(await checkSignInCode(db, l, 'dana.lee@abc.com', code2, at(13))).toBe(true);
    expect(await checkSignInCode(db, l, 'dana.lee@abc.com', code2, at(13))).toBe(false);
  });
});

describe('replies and comments, batched', () => {
  it('holds a reply 3 minutes; more replies join it; at most 10 minutes from the first', async () => {
    const t = await addProspectComment(db, l, { email: 'dana.lee@abc.com', name: 'Dana Lee' }, { page: 'pilot', block: 'costs', label: 'The pilot · Pilot costs', body: 'Can the pilot start in January?' });
    const r1 = await addComment(db, vid, { parentId: t, body: 'Yes — January works.' }, kw);
    expect(await queueProspectMail(db, r1, BASE, T0)).toBe(1);
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ to: 'dana.lee@abc.com', replyTo: 'kevin@teton.ai' });
    expect(live()[0].scheduledAt!.toISOString()).toBe(at(3).toISOString());
    expect(live()[0].html).toContain('Hey Dana - Kevin replied to the comment you made on your proposal.');
    expect(live()[0].html).toContain('Can the pilot start in January?');
    // A second reply 2 minutes later: one email with both, 3 minutes from now.
    const r2 = await addComment(db, vid, { parentId: t, body: 'And the install credit carries over.' }, kw);
    await queueProspectMail(db, r2, BASE, at(2));
    expect(live()).toHaveLength(1);
    expect(live()[0].scheduledAt!.toISOString()).toBe(at(5).toISOString());
    expect(live()[0].html).toContain('January works');
    expect(live()[0].html).toContain('install credit');
    // Keep going: never past 10 minutes from the first.
    for (const m of [4, 6, 8]) await queueProspectMail(db, (await addComment(db, vid, { parentId: t, body: `More at ${m}` }, kw)), BASE, at(m));
    expect(live()).toHaveLength(1);
    expect(live()[0].scheduledAt!.toISOString()).toBe(at(10).toISOString());
    // Only Dana commented in that thread: the CFO gets nothing.
    expect(sent.some((s) => s.to === 'cfo@abc.com')).toBe(false);
  });

  it('a new email after the last one went; nothing if they saw it first', async () => {
    const t = await addProspectComment(db, l, { email: 'dana.lee@abc.com' }, { body: 'Thanks!' });
    // (The previous batch went at minute 10.) A reply at minute 20 starts a new one.
    const r = await addComment(db, vid, { parentId: t, body: 'You’re welcome' }, kw);
    await queueProspectMail(db, r, BASE, at(20));
    expect(live()).toHaveLength(1);
    expect(live()[0].html).not.toContain('More at 8');
    // Dana opens the proposal at minute 21: it isn't sent.
    await markSeen(db, l, 'dana.lee@abc.com', at(21));
    expect(live()).toHaveLength(0);
  });

  it('a comment shared with the prospect goes to everyone on the link; stopped people get none', async () => {
    const c = await addComment(db, vid, { page: 'scope', label: 'The investment', body: 'Here’s the updated pricing.', shared: true }, kw);
    await queueProspectMail(db, c, BASE, at(30));
    expect(live().map((x) => x.to).sort()).toEqual(['cfo@abc.com', 'dana.lee@abc.com']);
    expect(live().find((x) => x.to === 'cfo@abc.com')!.html).toContain('Hey there - Kevin added a comment to your proposal.');
    // The CFO stops these emails: theirs is canceled, and the next comment skips them.
    const url = new URL(unsubscribeUrl(BASE, l, 'cfo@abc.com'));
    expect(await muteReplies(db, l, 'cfo@abc.com', 'forged')).toBe(false);
    expect(await muteReplies(db, l, 'cfo@abc.com', url.searchParams.get('s')!, at(30))).toBe(true);
    expect(live().map((x) => x.to)).toEqual(['dana.lee@abc.com']);
    const c2 = await addComment(db, vid, { body: 'One more thing', shared: true }, kw);
    await queueProspectMail(db, c2, BASE, at(31));
    expect(live().map((x) => x.to)).toEqual(['dana.lee@abc.com']);
    expect(live()[0].html).toContain('added comments to your proposal');
  });

  it('an internal comment emails nobody; a team reply in an internal thread neither', async () => {
    const c = await addComment(db, vid, { body: 'Internal only' }, kw);
    expect(await queueProspectMail(db, c, BASE, at(40))).toBe(0);
    const r = await addComment(db, vid, { parentId: c, body: 'Agreed' }, kw);
    expect(await queueProspectMail(db, r, BASE, at(41))).toBe(0);
  });
});
