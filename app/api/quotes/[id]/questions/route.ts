import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { questionsForQuote, reorderQuestions, saveQuestion, type QuestionInput } from '@/lib/data/questions';

/** The deal's questions for the prospect (anyone who can open the deal). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    const a = await accessForQuote(db, q, u);
    return NextResponse.json({ questions: await questionsForQuote(db, q), canEdit: a.deliverables }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Add a question (Edit Deliverables). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    const question = await saveQuestion(db, q, (await req.json()) as QuestionInput, u.id);
    return NextResponse.json({ question, questions: await questionsForQuote(db, q) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Reorder: { order: [ids] }. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    const { order } = (await req.json()) as { order?: unknown };
    return NextResponse.json({ questions: await reorderQuestions(db, q, Array.isArray(order) ? order.map(Number) : []) });
  } catch (e) {
    return jsonError(e);
  }
}
