/**
 * Questions the team asks a prospect on the deal's shared link. Each one is answered with buttons the rep sets up, a
 * text box, or both (buttons plus an optional text box). The first answer counts for everyone on the link; it's logged
 * as a prospect comment on the question's page ("Question: …\nAnswer: …"), so the team is notified and anyone can
 * chime in on that thread. A changed answer is added as a reply to that comment, keeping a trail.
 */
import type { Client, Row } from '@libsql/client';
import { addProspectComment, type PublicLink } from './shareLinks';

export type QuestionKind = 'buttons' | 'text' | 'both';
export interface QuestionAnswer {
  choice: string | null;
  text: string | null;
  email: string;
  name: string | null;
  at: string;
  /** The comment it was logged as (the thread to reply in). */
  commentId: number | null;
}
export interface Question {
  id: number;
  position: number;
  body: string;
  kind: QuestionKind;
  /** Button labels (buttons and both). */
  options: string[];
  /** The business case page it's shown on (null: the whole proposal), and that page's title. */
  page: string | null;
  pageLabel: string | null;
  /** They may change their answer after giving it. */
  allowChange: boolean;
  answer: QuestionAnswer | null;
}
export interface QuestionInput {
  body?: unknown;
  kind?: unknown;
  options?: unknown;
  page?: unknown;
  pageLabel?: unknown;
  allowChange?: unknown;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const KINDS: QuestionKind[] = ['buttons', 'text', 'both'];
export const MAX_OPTIONS = 8;

const toQuestion = (r: Row): Question => {
  let options: string[] = [];
  try {
    const a = JSON.parse(String(r.options ?? '[]'));
    options = Array.isArray(a) ? a.map(String) : [];
  } catch {
    /* none */
  }
  return {
    id: Number(r.id),
    position: Number(r.position),
    body: String(r.body),
    kind: KINDS.includes(r.kind as QuestionKind) ? (r.kind as QuestionKind) : 'buttons',
    options,
    page: r.page == null ? null : String(r.page),
    pageLabel: r.page_label == null ? null : String(r.page_label),
    allowChange: Number(r.allow_change) === 1,
    answer:
      r.answered_at == null
        ? null
        : {
            choice: r.answer_choice == null ? null : String(r.answer_choice),
            text: r.answer_text == null ? null : String(r.answer_text),
            email: String(r.answered_email ?? ''),
            name: r.answered_name == null ? null : String(r.answered_name),
            at: String(r.answered_at),
            commentId: r.answer_comment_id == null ? null : Number(r.answer_comment_id),
          },
  };
};

async function dealOfQuote(db: Client, quoteId: number): Promise<number> {
  const r = await db.execute({ sql: 'SELECT deal_id FROM quotes WHERE id = ?', args: [quoteId] });
  if (!r.rows.length) throw httpError('Deal not found', 404);
  return Number(r.rows[0].deal_id);
}

/** The deal's questions, in order. */
export async function listQuestions(db: Client, dealId: number): Promise<Question[]> {
  const r = await db.execute({ sql: 'SELECT * FROM deal_questions WHERE deal_id = ? AND deleted_at IS NULL ORDER BY position, id', args: [dealId] });
  return r.rows.map(toQuestion);
}
export const questionsForQuote = async (db: Client, quoteId: number) => listQuestions(db, await dealOfQuote(db, quoteId));

/** A question's fields, checked. */
export function cleanQuestion(input: QuestionInput) {
  const body = text(input.body, 500);
  if (!body) throw httpError('Write the question first', 400);
  const kind = KINDS.includes(input.kind as QuestionKind) ? (input.kind as QuestionKind) : 'buttons';
  const raw = Array.isArray(input.options) ? input.options : [];
  const options = kind === 'text' ? [] : [...new Set(raw.map((o) => text(o, 60)).filter(Boolean))];
  if (kind !== 'text' && !options.length) throw httpError('Add at least one button', 400);
  if (options.length > MAX_OPTIONS) throw httpError(`At most ${MAX_OPTIONS} buttons`, 400);
  const page = input.page ? text(input.page, 40) : null;
  return { body, kind, options, page, pageLabel: page ? text(input.pageLabel, 160) || null : null, allowChange: input.allowChange !== false };
}

/** Add a question (at the end), or change one. Its answer, if any, stays. */
export async function saveQuestion(db: Client, quoteId: number, input: QuestionInput, userId: number, id?: number): Promise<Question> {
  const dealId = await dealOfQuote(db, quoteId);
  const q = cleanQuestion(input);
  const args = [q.body, q.kind, JSON.stringify(q.options), q.page, q.pageLabel, q.allowChange ? 1 : 0];
  let qid = id;
  if (qid == null) {
    const r = await db.execute({
      sql: `INSERT INTO deal_questions (deal_id, position, body, kind, options, page, page_label, allow_change, created_by)
            VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM deal_questions WHERE deal_id = ?), ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [dealId, dealId, ...args, userId],
    });
    qid = Number(r.rows[0].id);
  } else {
    const r = await db.execute({
      sql: "UPDATE deal_questions SET body = ?, kind = ?, options = ?, page = ?, page_label = ?, allow_change = ?, updated_at = datetime('now') WHERE id = ? AND deal_id = ? AND deleted_at IS NULL",
      args: [...args, qid, dealId],
    });
    if (!r.rowsAffected) throw httpError('Question not found', 404);
  }
  return (await listQuestions(db, dealId)).find((x) => x.id === qid)!;
}

/** Remove a question (its answer comment stays with the deal). */
export async function deleteQuestion(db: Client, quoteId: number, id: number): Promise<void> {
  const r = await db.execute({ sql: "UPDATE deal_questions SET deleted_at = datetime('now') WHERE id = ? AND deal_id = ? AND deleted_at IS NULL", args: [id, await dealOfQuote(db, quoteId)] });
  if (!r.rowsAffected) throw httpError('Question not found', 404);
}

/** Put the deal's questions in this order (ids not listed keep their place after these). */
export async function reorderQuestions(db: Client, quoteId: number, order: number[]): Promise<Question[]> {
  const dealId = await dealOfQuote(db, quoteId);
  const now = await listQuestions(db, dealId);
  const want = [...order.map(Number).filter((id) => now.some((q) => q.id === id)), ...now.map((q) => q.id).filter((id) => !order.map(Number).includes(id))];
  await db.batch(
    want.map((id, i) => ({ sql: 'UPDATE deal_questions SET position = ? WHERE id = ? AND deal_id = ?', args: [i + 1, id, dealId] })),
    'write',
  );
  return listQuestions(db, dealId);
}

export { answerWords, parseAnswerBody } from './questionText';
import { answerWords } from './questionText';

/**
 * A prospect answers a question on the shared link. The first answer counts for everyone: it's logged as a comment
 * (from them, on the question's page). Changing it (when allowed) adds a reply to that comment.
 */
export async function answerQuestion(db: Client, l: PublicLink, who: { email: string; name?: string | null }, questionId: number, input: { choice?: unknown; text?: unknown }): Promise<Question> {
  const r = await db.execute({ sql: 'SELECT * FROM deal_questions WHERE id = ? AND deal_id = ? AND deleted_at IS NULL', args: [questionId, l.dealId] });
  if (!r.rows.length) throw httpError('Question not found', 404);
  const q = toQuestion(r.rows[0]);
  const choice = q.kind === 'text' ? null : text(input.choice, 60) || null;
  const txt = q.kind === 'buttons' ? null : text(input.text, 2000) || null;
  if (q.kind !== 'text' && (!choice || !q.options.includes(choice))) throw httpError('Pick one of the answers', 400);
  if (q.kind === 'text' && !txt) throw httpError('Write your answer first', 400);
  if (q.answer && !q.allowChange) throw httpError('This question has already been answered', 409);
  if (q.answer && q.answer.choice === choice && (q.answer.text ?? null) === txt) return q;
  const email = who.email.trim().toLowerCase();
  const name = who.name ? text(who.name, 80) : null;
  const words = answerWords(choice, txt);

  if (!q.answer) {
    // Claim it first, so two people answering at once don't both count.
    const claim = await db.execute({
      sql: 'UPDATE deal_questions SET answer_choice = ?, answer_text = ?, answered_email = ?, answered_name = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ? AND answered_at IS NULL',
      args: [choice, txt, email, name, q.id],
    });
    if (!claim.rowsAffected) throw httpError('Someone answered this a moment ago. Reload to see their answer.', 409);
    const cid = await addProspectComment(db, l, { email, name }, { page: q.page, label: q.page ? q.pageLabel ?? 'Page' : 'Whole proposal', body: `Question: ${q.body}\nAnswer: ${words}` }, { questionId: q.id });
    await db.execute({ sql: 'UPDATE deal_questions SET answer_comment_id = ? WHERE id = ?', args: [cid, q.id] });
  } else {
    // A changed answer: a reply in the answer's thread (a new thread if that one was on an earlier link).
    const t = q.answer.commentId == null ? null : await db.execute({ sql: 'SELECT share_link_id FROM proposal_comments WHERE id = ?', args: [q.answer.commentId] });
    const sameLink = t?.rows.length && Number(t.rows[0].share_link_id) === l.id;
    const cid = sameLink
      ? await addProspectComment(db, l, { email, name }, { parentId: q.answer.commentId, body: `Changed the answer to: ${words}` }, { questionId: q.id })
      : await addProspectComment(db, l, { email, name }, { page: q.page, label: q.page ? q.pageLabel ?? 'Page' : 'Whole proposal', body: `Question: ${q.body}\nAnswer: ${words}` }, { questionId: q.id });
    await db.execute({
      sql: 'UPDATE deal_questions SET answer_choice = ?, answer_text = ?, answered_email = ?, answered_name = ?, answered_at = CURRENT_TIMESTAMP, answer_comment_id = ? WHERE id = ?',
      args: [choice, txt, email, name, sameLink ? q.answer.commentId : cid, q.id],
    });
  }
  return (await listQuestions(db, l.dealId)).find((x) => x.id === q.id)!;
}
