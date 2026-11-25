import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, saveVersion } from './quotes';
import { checkAccess, isTeamEmail, linkByToken, saveShareLink, type PublicLink } from './shareLinks';
import { getProfile, saveProfile, setProfilePhoto } from './profiles';
import { completeUpload, putChunk, readFile, startUpload } from './storedFiles';
import { activityFor, addResource, dealOfQuote, deleteResource, getRoom, listResources, logEvent, reorderResources, roomForLink, saveRoom, updateResource } from './dealRooms';
import { resolveEmbed, parseTime } from '@/lib/resources/embed';
import { presign } from '@/lib/storage/r2';

let db: Client;
let dir: string;
let quoteId: number;
let dealId: number;
let kw: number;
let pn: number;
let l: PublicLink;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-room-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  kw = Number((await db.execute("INSERT INTO users (email, name, role) VALUES ('kevin@teton.ai', 'Kevin Winn', 'rep') RETURNING id")).rows[0].id);
  pn = Number((await db.execute("INSERT INTO users (email, name, role) VALUES ('priya@teton.ai', 'Priya Nair', 'rep') RETURNING id")).rows[0].id);
  const d = await createDeal(db, 'ABC Senior Living', { userId: kw });
  quoteId = d.quoteId;
  dealId = d.dealId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [kw, dealId] });
  const v = await saveVersion(db, quoteId, 'one');
  const s = await saveShareLink(db, quoteId, { versionId: v.versionId, emails: ['Dana Lee <dana@abc.com>', 'cfo@abc.com'] }, kw);
  l = (await linkByToken(db, s.token))!;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the deal’s team on the link', () => {
  it('lets the owner and collaborators in with their own email, as the team', async () => {
    expect(checkAccess(l, 'priya@teton.ai')).toBe('email');
    await db.execute({ sql: 'INSERT INTO deal_collaborators (deal_id, user_id, can_inputs) VALUES (?, ?, 1)', args: [dealId, pn] });
    const l2 = (await linkByToken(db, l.token))!;
    expect(checkAccess(l2, 'Priya@Teton.ai ')).toBe('ok');
    expect(checkAccess(l2, 'kevin@teton.ai')).toBe('ok');
    expect(isTeamEmail(l2, 'kevin@teton.ai')).toBe(true);
    expect(isTeamEmail(l2, 'dana@abc.com')).toBe(false);
    expect(checkAccess(l2, 'stranger@abc.com')).toBe('email');
    await db.execute({ sql: 'DELETE FROM deal_collaborators WHERE deal_id = ?', args: [dealId] });
  });
});

describe('profiles', () => {
  it('saves fields, checks links, keeps a photo', async () => {
    await expect(saveProfile(db, kw, { schedulingUrl: 'not a link' })).rejects.toThrow('isn’t a web address');
    const p = await saveProfile(db, kw, { title: 'Senior Account Executive', phone: '(502) 555-0142', schedulingUrl: 'calendly.com/kevin/30min', showPhone: false });
    expect(p).toMatchObject({ title: 'Senior Account Executive', schedulingUrl: 'https://calendly.com/kevin/30min', showPhone: false, photoUrl: null });
    const q = await setProfilePhoto(db, kw, { data: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' });
    expect(q.photoUrl).toMatch(/^\/api\/users\/\d+\/photo\?v=/);
    await expect(setProfilePhoto(db, kw, { data: new Uint8Array([1]), mime: 'image/gif' })).rejects.toThrow('JPG, PNG or WebP');
  });
});

describe('the tab', () => {
  it('has defaults, and saves the team (real users only, not the contact twice)', async () => {
    const r = await getRoom(db, dealId, kw);
    expect(r).toMatchObject({ tabName: 'Resources', contactUserId: kw, team: [] });
    expect(r.sections.map((s) => s.id)).toEqual(['docs', 'cases', 'plans', 'recordings']);
    const s = await saveRoom(db, quoteId, { tabName: 'Your pilot hub', team: [{ userId: pn, line: 'Runs your install' }, { userId: kw, line: 'dup' }, { userId: 9999, line: 'ghost' }], sections: [{ id: 'x', name: 'Extras' }] });
    expect(s.tabName).toBe('Your pilot hub');
    expect(s.team).toEqual([{ userId: pn, line: 'Runs your install' }]);
    expect(s.sections.map((x) => x.id)).toEqual(['x', 'docs', 'cases', 'plans', 'recordings']);
  });

  it('puts an embedded Canva deck under Decks & documents', async () => {
    const r = await addResource(db, quoteId, { kind: 'embed', url: '<iframe src="https://www.canva.com/design/DAGabc123XY/view?embed"></iframe>' }, kw);
    expect(r).toMatchObject({ sectionId: 'docs', title: 'Deck', embed: { provider: 'canva' } });
    await deleteResource(db, quoteId, r.id);
  });

  it('adds cards of each kind; embeds must play in the page', async () => {
    const link = await addResource(db, quoteId, { kind: 'link', url: 'teton.ai/case-studies/sunrise', title: 'Sunrise Gardens' }, kw);
    expect(link).toMatchObject({ kind: 'link', url: 'https://teton.ai/case-studies/sunrise', sectionId: 'cases' });
    await expect(addResource(db, quoteId, { kind: 'embed', url: 'https://example.com/video' }, kw)).rejects.toThrow('can’t be shown inside the page');
    const v = await addResource(db, quoteId, { kind: 'embed', url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef', title: 'Product demo' }, kw);
    expect(v.embed).toEqual({ provider: 'loom', src: 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef' });
    expect(v.sectionId).toBe('recordings');
    // An uploaded PDF (kept in the database here).
    const up = await startUpload(db, dealId, { name: 'Deck.pdf', mime: 'application/pdf', size: 5 }, kw);
    expect('chunks' in up && up.chunks).toBe(1);
    await putChunk(db, dealId, up.id, 0, new Uint8Array([37, 80, 68, 70, 45]));
    await completeUpload(db, dealId, up.id);
    const f = await addResource(db, quoteId, { kind: 'file', fileId: up.id }, kw);
    expect(f).toMatchObject({ kind: 'file', title: 'Deck', sectionId: 'docs', file: { name: 'Deck.pdf', size: 5 } });
    const read = await readFile(db, dealId, up.id);
    expect('data' in read && Array.from(read.data)).toEqual([37, 80, 68, 70, 45]);
    // Blocks, hiding, reordering.
    const u = await updateResource(db, quoteId, v.id, { blocks: [{ type: 'moments', items: [{ t: 782, label: 'How it works' }, { t: 10, label: 'Intro' }] }, { type: 'nope' }], duration: 2530.4 });
    expect(u.blocks).toHaveLength(1);
    expect(u.blocks[0]).toMatchObject({ type: 'moments', items: [{ t: 10 }, { t: 782 }] });
    expect(u.duration).toBe(2530);
    await updateResource(db, quoteId, link.id, { hidden: true });
    await reorderResources(db, quoteId, [{ sectionId: 'x', ids: [f.id] }, { sectionId: 'recordings', ids: [v.id] }]);
    const list = await listResources(db, dealId);
    expect(list.find((x) => x.id === f.id)?.sectionId).toBe('x');
    // The prospect: hidden cards and empty sections left out; the team with their profiles.
    const room = (await roomForLink(db, l))!;
    expect(room.heading).toBe('ABC Senior Living’s Teton Team');
    expect(room.resources.map((x) => x.title).sort()).toEqual(['Deck', 'Product demo']);
    expect(room.sections.map((x) => x.id)).toEqual(['x', 'recordings']);
    expect(room.contact).toMatchObject({ name: 'Kevin Winn', title: 'Senior Account Executive', phone: null });
    expect(room.team).toMatchObject([{ name: 'Priya Nair', line: 'Runs your install' }]);
    expect(room.showBooking).toBe(true);
    await deleteResource(db, quoteId, f.id);
    expect((await listResources(db, dealId)).some((x) => x.id === f.id)).toBe(false);
  });
});

describe('engagement', () => {
  it('records opens, time, video, downloads and pages, and sums them by resource and person', async () => {
    const [v] = (await listResources(db, dealId)).filter((x) => x.kind === 'embed');
    await logEvent(db, l, 'dana@abc.com', { target: 'item', resourceId: v.id, kind: 'open' });
    await logEvent(db, l, 'dana@abc.com', { target: 'item', resourceId: v.id, kind: 'video', value: 15 });
    await logEvent(db, l, 'dana@abc.com', { target: 'item', resourceId: v.id, kind: 'time', value: 500 });
    for (const p of ['scope', 'pilot', 'scope', 'scope']) await logEvent(db, l, 'dana@abc.com', { target: 'proposal', kind: 'page', detail: p });
    await logEvent(db, l, 'dana@abc.com', { target: 'proposal', kind: 'time', value: 30 });
    await expect(logEvent(db, l, 'dana@abc.com', { target: 'item', resourceId: 999, kind: 'open' })).rejects.toThrow('not found');
    const a = await activityFor(db, quoteId);
    expect(a.people.map((p) => p.email)).toEqual(['dana@abc.com', 'cfo@abc.com']);
    expect(a.cells[`r${v.id}|dana@abc.com`]).toMatchObject({ opens: 1, video: 15, time: 60 });
    expect(a.cells['proposal|dana@abc.com']).toMatchObject({ time: 30, topPage: { id: 'scope', count: 3 } });
    expect(a.totalTime).toBe(90);
    expect(a.recent[0]).toMatchObject({ email: 'dana@abc.com', kind: 'open', title: 'Product demo' });
  });
});

describe('helpers', () => {
  it('resolves embeds and times; signs R2 URLs', () => {
    expect(resolveEmbed('https://youtu.be/dQw4w9WgXcQ')?.provider).toBe('youtube');
    expect(resolveEmbed('https://vimeo.com/123456789')?.src).toBe('https://player.vimeo.com/video/123456789');
    expect(resolveEmbed('https://zoom.us/rec/share/abc')).toBeNull();
    // Decks: Canva (smart embed link, view link, or the embed HTML), Google Slides, Pitch.
    expect(resolveEmbed('https://www.canva.com/design/DAGabc123XY/view?embed')).toEqual({ provider: 'canva', src: 'https://www.canva.com/design/DAGabc123XY/view?embed' });
    expect(resolveEmbed('https://www.canva.com/design/DAGabc123XY/kQ9xYz_shareKey/view?utm_content=x')?.src).toBe('https://www.canva.com/design/DAGabc123XY/kQ9xYz_shareKey/view?embed');
    expect(resolveEmbed('<div><iframe loading="lazy" src="https://www.canva.com/design/DAGabc123XY/view?embed" allowfullscreen></iframe></div>')?.provider).toBe('canva');
    expect(resolveEmbed('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit#slide=id.p')?.src).toBe('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/embed?start=false&loop=false');
    expect(resolveEmbed('https://pitch.com/v/teton-overview-abc123')?.provider).toBe('pitch');
    expect(parseTime('13:02')).toBe(782);
    expect(parseTime('1:02:05')).toBe(3725);
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'AKID';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET_NAME = 'bucket';
    const u = new URL(presign('PUT', 'teton-resources/1/a b.mp4', { now: new Date('2026-11-25T12:00:00Z') }));
    expect(u.host).toBe('acct.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/bucket/teton-resources/1/a%20b.mp4');
    expect(u.searchParams.get('X-Amz-Credential')).toBe('AKID/20261125/auto/s3/aws4_request');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) delete process.env[k];
    void getProfile;
    void dealOfQuote;
  });
});
