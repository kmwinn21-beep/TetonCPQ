import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createDeal, saveVersion } from './quotes';
import { listComments } from './proposalComments';
import { linkByToken, saveShareLink, type PublicLink } from './shareLinks';
import { answerQuestion, deleteQuestion, questionsForQuote, reorderQuestions, saveQuestion } from './questions';
import { parseAnswerBody } from './questionText';

let db: Client;
let dir: string;
let quoteId: number;
let vid: number;
let uid: number;
let l: PublicLink;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-q-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  uid = Number((await db.execute("INSERT INTO users (email, name, role) VALUES ('kevin@teton.ai', 'Kevin Winn', 'rep') RETURNING id")).rows[0].id);
  const d = await createDeal(db, 'ABC Senior Living', { userId: uid });
  quoteId = d.quoteId;
  await db.execute({ sql: 'UPDATE deals SET owner_id = ? WHERE id = ?', args: [uid, d.dealId] });
  vid = (await saveVersion(db, quoteId, 'one')).versionId;
  const s = await saveShareLink(db, quoteId, { versionId: vid, emails: ['dana@abc.com', 'chris@abc.com'], allowComments: false }, uid);
  l = (await linkByToken(db, s.token))!;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('questions', () => {
  it('saves, checks, orders and removes questions', async () => {
    await expect(saveQuestion(db, quoteId, { body: '  ' }, uid)).rejects.toThrow('Write the question');
    await expect(saveQuestion(db, quoteId, { body: 'Start in January?', kind: 'buttons', options: [] }, uid)).rejects.toThrow('at least one button');
    const a = await saveQuestion(db, quoteId, { body: 'Start in January?', kind: 'buttons', options: ['Yes', 'No', 'Yes', ' '], page: 'pilot', pageLabel: 'The pilot' }, uid);
    expect(a).toMatchObject({ kind: 'buttons', options: ['Yes', 'No'], page: 'pilot', pageLabel: 'The pilot', allowChange: true, answer: null });
    const b = await saveQuestion(db, quoteId, { body: 'Who else decides?', kind: 'text', options: ['ignored'] }, uid);
    expect(b.options).toEqual([]);
    expect((await reorderQuestions(db, quoteId, [b.id, a.id])).map((q) => q.id)).toEqual([b.id, a.id]);
    const c = await saveQuestion(db, quoteId, { body: 'Gone soon', kind: 'text' }, uid);
    await deleteQuestion(db, quoteId, c.id);
    expect((await questionsForQuote(db, quoteId)).map((q) => q.body)).toEqual(['Who else decides?', 'Start in January?']);
  });

  it('the first answer counts for everyone and is logged as a comment; a change is a reply to it', async () => {
    const [text, yn] = await questionsForQuote(db, quoteId);
    await expect(answerQuestion(db, l, { email: 'dana@abc.com' }, yn.id, { choice: 'Maybe' })).rejects.toThrow('Pick one');
    const a = await answerQuestion(db, l, { email: 'dana@abc.com', name: 'Dana Lee' }, yn.id, { choice: 'Yes' });
    expect(a.answer).toMatchObject({ choice: 'Yes', email: 'dana@abc.com', name: 'Dana Lee' });
    // Logged as a comment from Dana on The pilot, even though the link doesn't take comments.
    const threads = await listComments(db, vid, { id: uid, name: 'Kevin Winn', role: 'rep' } as never);
    const t = threads.find((x) => x.id === a.answer!.commentId)!;
    expect(t).toMatchObject({ page: 'pilot', label: 'The pilot', prospect: 'dana@abc.com', questionId: yn.id });
    expect(parseAnswerBody(t.body)).toEqual({ question: 'Start in January?', answer: 'Yes', changed: false });
    // Chris sees it answered; changing it adds a reply in that thread.
    const b = await answerQuestion(db, l, { email: 'chris@abc.com' }, yn.id, { choice: 'No' });
    expect(b.answer).toMatchObject({ choice: 'No', email: 'chris@abc.com', commentId: a.answer!.commentId });
    const t2 = (await listComments(db, vid, { id: uid, name: 'Kevin Winn', role: 'rep' } as never)).find((x) => x.id === a.answer!.commentId)!;
    expect(t2.replies.map((r) => r.body)).toEqual(['Changed the answer to: No']);
    // The owner was notified of both.
    const n = await db.execute({ sql: "SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND kind = 'prospect_comment'", args: [uid] });
    expect(Number(n.rows[0].n)).toBe(2);
    // A text answer.
    await expect(answerQuestion(db, l, { email: 'dana@abc.com' }, text.id, { text: ' ' })).rejects.toThrow('Write your answer');
    const c = await answerQuestion(db, l, { email: 'dana@abc.com' }, text.id, { text: 'Our COO' });
    expect(c.answer?.text).toBe('Our COO');
  });

  it('no changes when the rep turned that off', async () => {
    const q = await saveQuestion(db, quoteId, { body: 'Which first?', kind: 'both', options: ['Forest Hills', 'Maple Grove'], allowChange: false }, uid);
    const a = await answerQuestion(db, l, { email: 'dana@abc.com' }, q.id, { choice: 'Maple Grove', text: 'Smaller team there' });
    expect(parseAnswerBody((await db.execute({ sql: 'SELECT body FROM proposal_comments WHERE id = ?', args: [a.answer!.commentId] })).rows[0].body as string)?.answer).toBe('Maple Grove — Smaller team there');
    await expect(answerQuestion(db, l, { email: 'chris@abc.com' }, q.id, { choice: 'Forest Hills' })).rejects.toThrow('already been answered');
  });
});
