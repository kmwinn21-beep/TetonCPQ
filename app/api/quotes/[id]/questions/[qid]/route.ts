import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { deleteQuestion, questionsForQuote, saveQuestion, type QuestionInput } from '@/lib/data/questions';

/** Change a question (Edit Deliverables). */
export async function PUT(req: Request, { params }: { params: { id: string; qid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    const question = await saveQuestion(db, q, (await req.json()) as QuestionInput, u.id, idParam(params.qid));
    return NextResponse.json({ question, questions: await questionsForQuote(db, q) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Remove a question (its answer stays in the comments). */
export async function DELETE(_req: Request, { params }: { params: { id: string; qid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    await deleteQuestion(db, q, idParam(params.qid));
    return NextResponse.json({ questions: await questionsForQuote(db, q) });
  } catch (e) {
    return jsonError(e);
  }
}
