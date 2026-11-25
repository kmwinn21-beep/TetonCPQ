import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { linkByToken } from '@/lib/data/shareLinks';
import { listSharedThreads } from '@/lib/data/proposalComments';
import { answerQuestion, listQuestions } from '@/lib/data/questions';
import { prospectSession } from '@/lib/auth/prospect';

async function prospect(token: string) {
  const db = await getDb();
  const l = await linkByToken(db, token);
  const who = l ? await prospectSession(l) : null;
  if (!l || !who) throw Object.assign(new Error('Open the link and enter your email first'), { status: 401 });
  return { db, l, who };
}

/** The team's questions on this deal, with their answers. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l } = await prospect(params.token);
    return NextResponse.json({ questions: await listQuestions(db, l.dealId) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Answer one: { questionId, choice?, text? }. Logged as a comment (a reply to it when the answer changes). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospect(params.token);
    if (who.team) return NextResponse.json({ error: 'You’re viewing as the Teton team. Comment and answer from the deal in Teton.' }, { status: 403 });
    const b = (await req.json()) as { questionId?: unknown; choice?: unknown; text?: unknown };
    const question = await answerQuestion(db, l, who, Number(b.questionId), { choice: b.choice, text: b.text });
    return NextResponse.json({ question, questions: await listQuestions(db, l.dealId), threads: await listSharedThreads(db, l.versionId, l.id) });
  } catch (e) {
    return jsonError(e);
  }
}
